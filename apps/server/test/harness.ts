/**
 * In-process test client. Requests go straight into `handleRequest` (no port),
 * authenticated as a seeded demo user via a bearer session token, so tests
 * exercise the real middleware, policies and database.
 *
 *   const coach = await asUser("coach");
 *   await coach.client.dashboard.list({});
 *   await expectForbidden(() => coach.client.courses.tree({ ... }));
 */
import { db } from "@incluvo/drizzle";
import { user } from "@incluvo/drizzle/schema";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { expect } from "bun:test";
import { eq } from "drizzle-orm";
import { handleRequest } from "../src/app";
import { auth } from "../src/auth";
import type { Router } from "../src/router";

const ORIGIN = "http://localhost:3200";

/** Seeded demo users (see src/seed-demo.ts), by short name. */
export const DEMO = {
	superadmin: "superadmin@incluvo.local",
	keyuser: "keyuser@incluvo.local",
	coach: "coach@incluvo.local",
	leerling: "leerling@incluvo.local",
	ontwikkelaar: "ontwikkelaar@incluvo.local",
	coach2: "coach2@incluvo.local",
	leerling2: "leerling2@incluvo.local",
	andereKeyuser: "andere-keyuser@incluvo.local",
	andereCoach: "andere-coach@incluvo.local",
	andereLeerling: "andere-leerling@incluvo.local",
} as const;
export type DemoUser = keyof typeof DEMO;

/** Call the app in-process, like `fetch` against the running server. */
export function request(path: string, init: RequestInit = {}): Promise<Response> {
	const headers = new Headers(init.headers);
	if (!headers.has("origin")) headers.set("origin", ORIGIN);
	return handleRequest(new Request(`${ORIGIN}${path}`, { ...init, headers }));
}

export async function userId(who: DemoUser): Promise<string> {
	const [row] = await db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.email, DEMO[who]));
	if (!row) throw new Error(`Demo user ${who} not seeded`);
	return row.id;
}

export interface TestUser {
	id: string;
	token: string;
	client: RouterClient<Router>;
	/** Raw request as this user (for /api/auth, /sse, file routes). */
	request: (path: string, init?: RequestInit) => Promise<Response>;
}

const sessions = new Map<DemoUser, TestUser>();

/** A client signed in as `who`. Sessions are cached for the test run. */
export async function asUser(who: DemoUser): Promise<TestUser> {
	const cached = sessions.get(who);
	if (cached) return cached;

	const id = await userId(who);
	const ctx = await auth.$context;
	const session = await ctx.internalAdapter.createSession(id);
	const token = session.token;

	const authed = (path: string, init: RequestInit = {}) => {
		const headers = new Headers(init.headers);
		headers.set("authorization", `Bearer ${token}`);
		return request(path, { ...init, headers });
	};
	const client: RouterClient<Router> = createORPCClient(
		new RPCLink({
			url: `${ORIGIN}/rpc`,
			fetch: (input, init) => {
				const req = new Request(input, init);
				req.headers.set("authorization", `Bearer ${token}`);
				req.headers.set("origin", ORIGIN);
				return handleRequest(req);
			},
		}),
	);

	const testUser = { id, token, client, request: authed };
	sessions.set(who, testUser);
	return testUser;
}

/** Client with no session at all. */
export const anonymous: RouterClient<Router> = createORPCClient(
	new RPCLink({
		url: `${ORIGIN}/rpc`,
		fetch: (input, init) => {
			const req = new Request(input, init);
			req.headers.set("origin", ORIGIN);
			return handleRequest(req);
		},
	}),
);

async function expectCode(fn: () => Promise<unknown>, codes: string[]) {
	let error: unknown;
	try {
		await fn();
	} catch (e) {
		error = e;
	}
	expect(error, `expected ${codes.join("/")}, call succeeded`).toBeDefined();
	expect(codes).toContain(String((error as { code?: string }).code));
}

/** Expect an oRPC FORBIDDEN (or NOT_FOUND, which hides existence) error. */
export const expectForbidden = (fn: () => Promise<unknown>) =>
	expectCode(fn, ["FORBIDDEN", "NOT_FOUND"]);

export const expectUnauthorized = (fn: () => Promise<unknown>) =>
	expectCode(fn, ["UNAUTHORIZED"]);

/**
 * A new plan version for a leerling in the given status (default submitted),
 * on their school's default form. Tests use it where filling the wizard in is
 * not what's under test.
 */
export async function planVersion(
	leerlingId: string,
	status: "draft" | "submitted" | "coach_review" | "shared_with_leerling" = "submitted",
) {
	const { formSubmission, formTemplate, user: userTable } = await import("@incluvo/drizzle/schema");
	const { createVersion, ensurePlan, transition } = await import("../src/coachplan/lifecycle");
	const { and } = await import("drizzle-orm");
	const [leerling] = await db
		.select({ organizationId: userTable.organizationId })
		.from(userTable)
		.where(eq(userTable.id, leerlingId));
	const [template] = await db
		.select({ id: formTemplate.id })
		.from(formTemplate)
		.where(
			and(
				eq(formTemplate.organizationId, leerling!.organizationId!),
				eq(formTemplate.isSchoolDefault, true),
			),
		);
	const plan = await ensurePlan(db, leerling!.organizationId!, leerlingId);
	// Close any version still open, so the new one is the latest.
	await db
		.update(formSubmission)
		.set({ status: "shared_with_leerling" })
		.where(and(eq(formSubmission.coachplanId, plan.id), eq(formSubmission.status, "draft")));
	let version = await createVersion(db, plan, template!.id);
	if (status !== "draft") {
		version = await transition(db, version.id, ["draft"], status, { submittedAt: new Date() });
	}
	return version;
}
