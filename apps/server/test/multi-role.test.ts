/**
 * INC-24: one account, several roles. The keyuser gives someone more roles;
 * that person switches between them, and every screen and permission follows
 * the active role.
 */
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { describe, expect, test } from "bun:test";
import { handleRequest } from "../src/app";
import { auth } from "../src/auth";
import type { Router } from "../src/router";
import { createAccount } from "../src/users";
import { asUser, expectForbidden, withDbAt } from "./harness";

let counter = 0;

/** A new coach of the demo school, with a client signed in as them. */
async function newCoach() {
	const keyuser = await asUser("keyuser");
	const me = await keyuser.client.account.me();
	const id = await createAccount({
		email: `rollen.coach.${++counter}@school.nl`,
		name: `Rollen Coach ${counter}`,
		role: "coach",
		organizationId: me.organization!.id,
	});
	const { token } = await (await auth.$context).internalAdapter.createSession(id);
	const client: RouterClient<Router> = createORPCClient(
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
	return { id, client, keyuser };
}

/** A new leerling of the demo school, without koppelingen. */
async function newLeerling() {
	const keyuser = await asUser("keyuser");
	const me = await keyuser.client.account.me();
	return createAccount({
		email: `rollen.leerling.${++counter}@school.nl`,
		name: `Rollen Leerling ${counter}`,
		role: "leerling",
		organizationId: me.organization!.id,
	});
}

async function codeOf(fn: () => Promise<unknown>) {
	try {
		await fn();
	} catch (e) {
		return (e as { code?: string }).code;
	}
	return undefined;
}

describe("several roles per account (INC-24)", () => {
	test("a keyuser and coach switches between the beheer and the coach side", async () => {
		const { id, client, keyuser } = await newCoach();
		const leerlingId = await newLeerling();
		await keyuser.client.admin.assignments.set({ coachId: id, leerlingId, assigned: true });

		// One person, two roles; the active one stays coach.
		const updated = await keyuser.client.account.users.setRoles({
			userId: id,
			roles: ["coach", "keyuser"],
		});
		expect(updated.roles).toEqual(["coach", "keyuser"]);
		expect(updated.role).toBe("coach");
		let me = await client.account.me();
		expect(me.roles).toEqual(["coach", "keyuser"]);

		// As coach: the own leerling, no beheer.
		await client.dashboard.quickpanel({ leerlingId });
		await expectForbidden(() => client.people.leerlingen.list());

		// As keyuser: the beheer, not the leerling's data (AC6, AC7).
		await client.account.switchRole({ role: "keyuser" });
		me = await client.account.me();
		expect(me.role).toBe("keyuser");
		expect((await client.people.leerlingen.list()).length).toBeGreaterThan(0);
		await expectForbidden(() => client.dashboard.quickpanel({ leerlingId }));

		// Still a coach for the school while working as keyuser: listed, and the
		// koppeling stays (AC13).
		const coaches = await keyuser.client.people.coaches.list();
		expect(coaches.map((c) => c.id)).toContain(id);
		const links = await keyuser.client.admin.assignments.list();
		expect(links.coaches.map((c) => c.id)).toContain(id);

		// And back.
		await client.account.switchRole({ role: "coach" });
		await client.dashboard.quickpanel({ leerlingId });
	});

	test("only an own role can be switched to", async () => {
		const { client } = await newCoach();
		expect(await codeOf(() => client.account.switchRole({ role: "keyuser" }))).toBe("FORBIDDEN");
		expect(await codeOf(() => client.account.switchRole({ role: "superadmin" }))).toBe(
			"FORBIDDEN",
		);
		expect((await client.account.me()).role).toBe("coach");
	});

	test("taking away the active role continues in a remaining one (AC11)", async () => {
		const { id, client, keyuser } = await newCoach();
		await keyuser.client.account.users.setRoles({ userId: id, roles: ["coach", "keyuser"] });
		await client.account.switchRole({ role: "keyuser" });

		await keyuser.client.account.users.setRoles({ userId: id, roles: ["coach"] });
		const me = await client.account.me();
		expect(me.role).toBe("coach");
		expect(me.roles).toEqual(["coach"]);
		await expectForbidden(() => client.people.leerlingen.list());
		expect(await codeOf(() => client.account.switchRole({ role: "keyuser" }))).toBe("FORBIDDEN");
	});

	test("a leerling or superadmin role doesn't combine; a keyuser can't grant superadmin", async () => {
		const { id, keyuser } = await newCoach();
		expect(
			await codeOf(() =>
				keyuser.client.account.users.setRoles({ userId: id, roles: ["coach", "leerling"] }),
			),
		).toBe("BAD_REQUEST");
		expect(
			await codeOf(() =>
				keyuser.client.account.users.setRoles({ userId: id, roles: ["keyuser", "superadmin"] }),
			),
		).toBe("FORBIDDEN");
		const row = (await keyuser.client.account.users.listInTenant()).find((u) => u.id === id);
		expect(row?.roles).toEqual(["coach"]);
	});

	test("dropping the coach role drops the koppelingen", async () => {
		const { id, keyuser } = await newCoach();
		const leerlingId = await newLeerling();
		await keyuser.client.account.users.setRoles({ userId: id, roles: ["coach", "keyuser"] });
		await keyuser.client.admin.assignments.set({ coachId: id, leerlingId, assigned: true });
		await keyuser.client.account.users.setRoles({ userId: id, roles: ["keyuser"] });
		const list = await keyuser.client.admin.assignments.list();
		expect(list.coaches.map((c) => c.id)).not.toContain(id);
		expect(list.leerlingen.find((l) => l.id === leerlingId)?.coachIds).not.toContain(id);
	});
});

describe("migration 0019", () => {
	test("everyone keeps their role as their first assigned role; new roles are assigned", async () => {
		await withDbAt(18, async (pool, migrateRest) => {
			await pool.query(`
				INSERT INTO "user" (id, name, email, role) VALUES
					('k', 'K', 'k@x', 'keyuser'), ('l', 'L', 'l@x', 'leerling');
			`);
			await migrateRest();
			const assigned = async () =>
				(await pool.query(`SELECT user_id, role::text FROM assigned_role ORDER BY user_id, role`))
					.rows;
			expect(await assigned()).toEqual([
				{ user_id: "k", role: "keyuser" },
				{ user_id: "l", role: "leerling" },
			]);
			// The trigger: a new account and a changed active role are assigned too.
			await pool.query(`INSERT INTO "user" (id, name, email, role) VALUES ('n', 'N', 'n@x', 'coach')`);
			await pool.query(`UPDATE "user" SET role = 'coach' WHERE id = 'k'`);
			expect(await assigned()).toEqual([
				{ user_id: "k", role: "coach" },
				{ user_id: "k", role: "keyuser" },
				{ user_id: "l", role: "leerling" },
				{ user_id: "n", role: "coach" },
			]);
		});
	});
});
