import { acquireRequestActor } from "@incluvo/drizzle";
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
}

export const base = os.$context<Context>();

/** Public procedure — no authentication required. */
export const publicProcedure = base;

/**
 * Authentication middleware. Verifies a session, derives the **tenant-aware**
 * actor (id + role + organizationId), and pins a DB connection with
 * `app.actor_id` set so writes are audited.
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
		role: ((sessionUser as { role?: string }).role ?? "member") as UserRole,
		organizationId: row?.organizationId ?? null,
	};

	const { db, release } = await acquireRequestActor(`user:${actor.userId}`);
	try {
		return await next({ context: { ...context, db, actor } });
	} finally {
		await release();
	}
});

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
