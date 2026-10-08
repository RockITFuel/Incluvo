/**
 * Coach ↔ leerling koppelingen (FIX-PLAN phase 3): a keyuser links coaches and
 * leerlingen in their own school, and the link is what gives a coach access.
 */
import { db } from "@incluvo/drizzle";
import { coachAssignment } from "@incluvo/drizzle/schema";
import { describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { createAccount } from "../src/users";
import { asUser, expectForbidden, userId } from "./harness";

async function expectBadRequest(fn: () => Promise<unknown>) {
	let code: string | undefined;
	try {
		await fn();
	} catch (e) {
		code = (e as { code?: string }).code;
	}
	expect(code).toBe("BAD_REQUEST");
}

describe("koppelingen", () => {
	test("keyuser sees the school's coaches and leerlingen with their links", async () => {
		const keyuser = await asUser("keyuser");
		const list = await keyuser.client.admin.assignments.list();
		const coach2 = await userId("coach2");
		const leerling2 = list.leerlingen.find((l) => l.email === "leerling2@incluvo.local");
		expect(list.coaches.map((c) => c.email)).toContain("coach2@incluvo.local");
		expect(leerling2?.coachIds).toContain(coach2);
		// Only this school.
		expect(list.leerlingen.map((l) => l.email)).not.toContain("andere-leerling@incluvo.local");
	});

	test("linking gives the coach access, unlinking takes it away", async () => {
		const keyuser = await asUser("keyuser");
		const coach2 = await asUser("coach2");
		const leerlingId = await userId("leerling");

		await expectForbidden(() => coach2.client.dashboard.quickpanel({ leerlingId }));

		await keyuser.client.admin.assignments.set({
			coachId: coach2.id,
			leerlingId,
			assigned: true,
		});
		// Idempotent.
		await keyuser.client.admin.assignments.set({
			coachId: coach2.id,
			leerlingId,
			assigned: true,
		});
		const panel = await coach2.client.dashboard.quickpanel({ leerlingId });
		expect(panel.leerling.id).toBe(leerlingId);
		const overview = await coach2.client.dashboard.overview();
		expect(overview.map((r) => r.leerling.id)).toContain(leerlingId);

		await keyuser.client.admin.assignments.set({
			coachId: coach2.id,
			leerlingId,
			assigned: false,
		});
		await expectForbidden(() => coach2.client.dashboard.quickpanel({ leerlingId }));
	});

	test("refuses other schools, wrong roles and non-admins", async () => {
		const keyuser = await asUser("keyuser");
		const coach = await asUser("coach");
		const superadmin = await asUser("superadmin");
		const andereCoach = await userId("andereCoach");
		const andereLeerling = await userId("andereLeerling");
		const leerling = await userId("leerling");

		// Another school's pair, and that school's list.
		await expectForbidden(() =>
			keyuser.client.admin.assignments.set({
				coachId: andereCoach,
				leerlingId: andereLeerling,
				assigned: true,
			}),
		);
		const andere = (await superadmin.client.admin.organizations.listAll()).find(
			(o) => o.name === "Andere School",
		)!;
		await expectForbidden(() =>
			keyuser.client.admin.assignments.list({ organizationId: andere.id }),
		);
		// A coach and a leerling from different schools.
		await expectBadRequest(() =>
			superadmin.client.admin.assignments.set({
				coachId: andereCoach,
				leerlingId: leerling,
				assigned: true,
			}),
		);
		// Two leerlingen.
		const leerling2 = await userId("leerling2");
		await expectBadRequest(() =>
			keyuser.client.admin.assignments.set({
				coachId: leerling2,
				leerlingId: leerling,
				assigned: true,
			}),
		);
		// A coach can't manage koppelingen.
		await expectForbidden(() => coach.client.admin.assignments.list());

		// The superadmin can, for any school.
		const list = await superadmin.client.admin.assignments.list({
			organizationId: andere.id,
		});
		expect(list.leerlingen.map((l) => l.id)).toEqual([andereLeerling]);
	});

	test("a keyuser manages koppelingen but isn't a coach in one (INC-16)", async () => {
		const keyuser = await asUser("keyuser");
		const leerlingId = await userId("leerling2");
		const list = await keyuser.client.admin.assignments.list();
		expect(list.coaches.map((c) => c.id)).not.toContain(keyuser.id);

		let code: string | undefined;
		try {
			await keyuser.client.admin.assignments.set({
				coachId: keyuser.id,
				leerlingId,
				assigned: true,
			});
		} catch (e) {
			code = (e as { code?: string }).code;
		}
		expect(code).toBe("BAD_REQUEST");
		const partners = await keyuser.client.chat.partners();
		expect(partners.map((p) => p.id)).not.toContain(leerlingId);
	});

	test("changing a coach's role drops their koppelingen", async () => {
		const keyuser = await asUser("keyuser");
		const me = await keyuser.client.account.me();
		const coachId = await createAccount({
			email: "wisselende.coach@school.nl",
			name: "Wisselende Coach",
			role: "coach",
			organizationId: me.organization!.id,
		});
		const leerlingId = await userId("leerling");
		await keyuser.client.admin.assignments.set({ coachId, leerlingId, assigned: true });

		// A keyuser doesn't coach (INC-16): the koppeling goes.
		await keyuser.client.account.users.setRole({ userId: coachId, role: "keyuser" });

		const left = await db
			.select({ id: coachAssignment.id })
			.from(coachAssignment)
			.where(
				and(eq(coachAssignment.coachId, coachId), eq(coachAssignment.leerlingId, leerlingId)),
			);
		expect(left).toHaveLength(0);
	});
});
