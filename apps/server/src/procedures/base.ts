import { createRequestDb, isPoolTimeout } from "@incluvo/drizzle";
import { user } from "@incluvo/drizzle/schema";
import {
	checkPermission,
	type Policy,
	type PolicySubject,
	type UserRole,
} from "@incluvo/permissions";
import { ORPCError, os } from "@orpc/server";
import { eq } from "drizzle-orm";
import type { Context } from "../context";

/** Context available to handlers once authentication has run. */
export interface AuthedContext extends Context {
	actor: PolicySubject;
	/**
	 * Give the request's DB connection back to the pool before slow external
	 * work (AI provider, PDF rendering). The next query takes a fresh one with
	 * the actor still pinned. Never call it inside a transaction.
	 */
	suspendDb: () => Promise<void>;
}

export const base = os.$context<Context>();

/** Public procedure — no authentication required. */
export const publicProcedure = base;

/**
 * Authentication middleware. Verifies a session, derives the **tenant-aware**
 * actor (id + role + organizationId), and gives the handler a DB handle with
 * `app.actor_id` pinned so writes are audited (`createRequestDb`: the
 * connection is taken on first use and returned at the end of the request).
 *
 * `organizationId` is loaded from the `user` row (the single tenant per user,
 * QUESTIONS 3.2). It is mirrored onto `context.actor` so every protected
 * procedure can tenant-scope with `sameTenant(context.actor, resource)` without
 * re-querying. The session may also carry it if better-auth exposes the column;
 * we still read the DB so the value is authoritative.
 */
const requireAuth = base.middleware(async ({ context, next }) => {
	const sessionUser = context.session?.user;
	if (!sessionUser) {
		throw new ORPCError("UNAUTHORIZED");
	}

	// Load the authoritative tenant for this user from the DB.
	const [row] = await context.db
		.select({ organizationId: user.organizationId })
		.from(user)
		.where(eq(user.id, sessionUser.id));

	const actor: PolicySubject = {
		userId: sessionUser.id,
		role: ((sessionUser as { role?: string }).role ?? "leerling") as UserRole,
		organizationId: row?.organizationId ?? null,
	};

	const { db, suspend, release } = createRequestDb(`user:${actor.userId}`);
	// A streaming handler (`async function*`) returns its generator before its
	// body has run; then the connection is released when the stream ends.
	let streaming = false;
	try {
		const result = await next({ context: { ...context, db, actor, suspendDb: suspend } });
		const output: unknown = result.output;
		if (isAsyncIterable(output)) {
			streaming = true;
			(result as { output: unknown }).output = releaseAfterStream(output, release);
		}
		return result;
	} catch (error) {
		if (isPoolTimeout(error)) {
			throw new ORPCError("SERVICE_UNAVAILABLE", {
				message: "Het is even erg druk. Probeer het zo opnieuw.",
			});
		}
		throw error;
	} finally {
		if (!streaming) await release();
	}
});

/**
 * Longest a stream may hold its connection. AI streams are bounded well below
 * this (request timeout × retries); it only guards against a stream that the
 * transport never consumes nor cancels.
 */
const MAX_STREAM_MS = 5 * 60_000;

/**
 * Wrap a handler's stream so the request's pinned connection is released
 * exactly once when the stream ends: finished, failed, or cancelled by the
 * client — also when it is cancelled before it started. (A plain
 * `try/finally` generator wrapper would miss that last case: `return()` on a
 * generator that hasn't started skips its body.) Releasing any earlier would
 * let the handler body query a connection that is back in the pool, possibly
 * checked out by another request with another actor pinned.
 */
export function releaseAfterStream<T>(
	stream: AsyncIterable<T>,
	release: () => Promise<void>,
): AsyncIterableIterator<T> {
	const inner = stream[Symbol.asyncIterator]();
	let released = false;
	const done = async () => {
		if (released) return;
		released = true;
		clearTimeout(timer);
		await release();
	};
	const timer = setTimeout(() => void done(), MAX_STREAM_MS);
	timer.unref?.();

	return {
		[Symbol.asyncIterator]() {
			return this;
		},
		async next(...args: [] | [unknown]) {
			try {
				const step = await inner.next(...args);
				if (step.done) await done();
				return step;
			} catch (error) {
				await done();
				throw error;
			}
		},
		async return(value?: unknown) {
			try {
				return ((await inner.return?.(value)) ?? {
					done: true,
					value,
				}) as IteratorResult<T>;
			} finally {
				await done();
			}
		},
		async throw(error?: unknown) {
			try {
				if (inner.throw) return await inner.throw(error);
				throw error;
			} finally {
				await done();
			}
		},
	};
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] ===
			"function"
	);
}

/** Protected procedure — requires a valid session. */
export const protectedProcedure = base.use(requireAuth);

/**
 * Policy guard. Compose after `protectedProcedure` to enforce an RBAC policy.
 *
 * - Role-only policies (no resource): call `withPolicy(policy)`.
 * - Tenant-scoped policies that gate access to the actor's *own* tenant (e.g.
 *   `readUsers` / `manageUsers` on a list endpoint): pass a `resolveResource`
 *   that returns the actor's own org, so `sameTenant` evaluates `true`.
 *   Per-row resource checks are still re-run inside handlers once a row loads.
 */
export function withPolicy<Resource>(
	policy: Policy<Resource>,
	resolveResource?: (context: AuthedContext) => Resource,
) {
	return os
		.$context<AuthedContext>()
		.middleware(async ({ context, next }) => {
			const resource = resolveResource?.(context);
			if (!checkPermission(policy, context.actor, resource)) {
				throw new ORPCError("FORBIDDEN", {
					message: `Policy "${policy.name}" denied access`,
				});
			}
			return next({ context });
		});
}

/** Resolve the actor's own tenant as the policy resource (self-tenant gate). */
export function ownTenant(context: AuthedContext): {
	organizationId?: string | null;
} {
	return { organizationId: context.actor.organizationId };
}
