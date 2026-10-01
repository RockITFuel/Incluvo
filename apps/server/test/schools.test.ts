/**
 * Superadmin school management (docs/decisions/superadmin-beheer.md): the
 * platform overview stats, inviting into a chosen school, and archiving.
 */
import { db } from "@incluvo/drizzle";
import { user } from "@incluvo/drizzle/schema";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { handleRequest } from "../src/app";
import type { Router } from "../src/router";
import { createAccount } from "../src/users";
import { asUser, expectForbidden, expectUnauthorized, request } from "./harness";

/** A client for a session token obtained through a real sign-in. */
const clientFor = (token: string): RouterClient<Router> =>
	createORPCClient(
		new RPCLink({
			url: "http://localhost:3200/rpc",
			fetch: (input, init) => {
				const req = new Request(input, init);
				req.headers.set("authorization", `Bearer ${token}`);
				req.headers.set("origin", "http://localhost:3200");
				return handleRequest(req);
			},
		}),
	);

let ipCounter = 0;
const freshIp = () => `10.1.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`;

const signIn = (email: string, password: string) =>
	request("/api/auth/sign-in/email", {
		method: "POST",
		headers: { "content-type": "application/json", "x-forwarded-for": freshIp() },
		body: JSON.stringify({ email, password }),
	});

async function expectCode(fn: () => Promise<unknown>, code: string) {
	let error: unknown;
	try {
		await fn();
	} catch (e) {
		error = e;
	}
	expect((error as { code?: string } | undefined)?.code).toBe(code);
}

describe("platform overview", () => {
	test("superadmin lists every school with stats", async () => {
		const superadmin = await asUser("superadmin");
		const orgs = await superadmin.client.admin.organizations.listAll();
		const demo = orgs.find((o) => o.name === "Demo School");
		expect(demo).toBeDefined();
		expect(demo!.archivedAt).toBeNull();
		expect(demo!.stats.keyuserCount).toBeGreaterThanOrEqual(1);
		expect(demo!.stats.leerlingCount).toBeGreaterThanOrEqual(1);

		const detail = await superadmin.client.admin.organizations.detail({ id: demo!.id });
		expect(detail.stats).toEqual(demo!.stats);
	});

	test("keyuser and coach cannot see other schools", async () => {
		const superadmin = await asUser("superadmin");
		const andere = (await superadmin.client.admin.organizations.listAll()).find(
			(o) => o.name === "Andere School",
		)!;
		for (const who of ["keyuser", "coach"] as const) {
			const actor = await asUser(who);
			await expectForbidden(() => actor.client.admin.organizations.listAll());
			await expectForbidden(() =>
				actor.client.admin.organizations.detail({ id: andere.id }),
			);
			await expectForbidden(() =>
				actor.client.admin.organizations.setArchived({ id: andere.id, archived: true }),
			);
		}
	});
});

describe("invite into a school", () => {
	test("superadmin invites the first keyuser of a new school", async () => {
		const superadmin = await asUser("superadmin");
		const school = await superadmin.client.admin.organizations.createSchool({
			name: "Nieuwe School",
		});
		const res = await superadmin.client.account.users.invite({
			email: "keyuser@nieuwe-school.nl",
			name: "Eerste Keyuser",
			role: "keyuser",
			organizationId: school.id,
		});
		expect(res).toMatchObject({ created: true, organizationId: school.id });

		const detail = await superadmin.client.admin.organizations.detail({ id: school.id });
		expect(detail.stats.keyuserCount).toBe(1);

		const users = await superadmin.client.admin.users.overview({
			organizationId: school.id,
		});
		expect(users.map((u) => u.email)).toEqual(["keyuser@nieuwe-school.nl"]);
		expect(users[0]!.organizationName).toBe("Nieuwe School");
	});

	test("a keyuser cannot invite into another school", async () => {
		const superadmin = await asUser("superadmin");
		const andere = (await superadmin.client.admin.organizations.listAll()).find(
			(o) => o.name === "Andere School",
		)!;
		const keyuser = await asUser("keyuser");
		await expectForbidden(() =>
			keyuser.client.account.users.invite({
				email: "indringer@andere-school.nl",
				role: "coach",
				organizationId: andere.id,
			}),
		);
	});
});

describe("archiving a school", () => {
	test("locks the school out and restoring lets it back in", async () => {
		const superadmin = await asUser("superadmin");
		const school = await superadmin.client.admin.organizations.createSchool({
			name: "Archiefschool",
		});
		const password = "een-lang-wachtwoord";
		await createAccount({
			email: "coach@archiefschool.nl",
			name: "Archief Coach",
			role: "coach",
			organizationId: school.id,
			password,
		});
		const login = await signIn("coach@archiefschool.nl", password);
		expect(login.status).toBe(200);
		const coach = clientFor(((await login.json()) as { token: string }).token);
		expect((await coach.account.me()).role).toBe("coach");

		const archived = await superadmin.client.admin.organizations.setArchived({
			id: school.id,
			archived: true,
		});
		expect(archived.archivedAt).toBeInstanceOf(Date);

		// The open session is revoked, and a new sign-in is refused.
		await expectUnauthorized(() => coach.account.me());
		const refused = await signIn("coach@archiefschool.nl", password);
		expect(refused.status).toBe(403);

		// No invites or renames while archived.
		await expectCode(
			() =>
				superadmin.client.account.users.invite({
					email: "nieuw@archiefschool.nl",
					role: "leerling",
					organizationId: school.id,
				}),
			"BAD_REQUEST",
		);
		await expectCode(
			() => superadmin.client.admin.organizations.update({ id: school.id, name: "X" }),
			"BAD_REQUEST",
		);

		// The data stays: the user still exists in the school.
		const [row] = await db
			.select({ organizationId: user.organizationId })
			.from(user)
			.where(eq(user.email, "coach@archiefschool.nl"));
		expect(row?.organizationId).toBe(school.id);

		await superadmin.client.admin.organizations.setArchived({
			id: school.id,
			archived: false,
		});
		expect((await signIn("coach@archiefschool.nl", password)).status).toBe(200);
	});

	test("Ondivera itself cannot be archived", async () => {
		const superadmin = await asUser("superadmin");
		const ondivera = (await superadmin.client.admin.organizations.listAll()).find(
			(o) => o.kind === "ondivera",
		)!;
		await expectCode(
			() =>
				superadmin.client.admin.organizations.setArchived({
					id: ondivera.id,
					archived: true,
				}),
			"BAD_REQUEST",
		);
	});
});
