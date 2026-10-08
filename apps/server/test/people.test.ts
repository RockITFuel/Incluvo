/**
 * INC-15 – INC-18: the keyuser adds leerlingen and coaches and decides who
 * coaches whom: one vaste coach and at most one vervanger per leerling.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { testOutbox } from "../src/mail";
import { asUser, expectForbidden } from "./harness";

let n = 0;
const unique = () => `${Date.now().toString(36)}${++n}`;

function leerlingInput(overrides: Record<string, unknown> = {}) {
	const id = unique();
	return {
		lastName: "Jansen",
		prefix: "de",
		nickname: `Sam${id}`,
		birthDate: "2012-03-14",
		email: `sam.${id}@school.nl`,
		startDate: "2026-09-01",
		...overrides,
	};
}

function coachInput(overrides: Record<string, unknown> = {}) {
	const id = unique();
	return {
		lastName: "Bakker",
		nickname: `Noor${id}`,
		email: `noor.${id}@school.nl`,
		startDate: "2026-08-01",
		...overrides,
	};
}

async function codeOf(fn: () => Promise<unknown>) {
	try {
		await fn();
	} catch (e) {
		return e as { code?: string; message?: string; data?: { field?: string } };
	}
	return null;
}

beforeEach(() => {
	testOutbox.length = 0;
});

describe("leerling toevoegen (INC-15)", () => {
	test("the keyuser adds a leerling: Actief, an ID, in the list, invite mailed", async () => {
		const keyuser = await asUser("keyuser");
		const input = leerlingInput({ eckId: "ECK-123", gender: "vrouw", endDate: "2027-07-01" });
		const created = await keyuser.client.people.leerlingen.create(input);
		expect(created.number).toBeGreaterThan(0);
		expect(created.name).toBe(`${input.nickname} de Jansen`);
		expect(created.mailSent).toBe(true);
		expect(testOutbox.map((m) => m.to)).toContain(input.email);

		const row = (await keyuser.client.people.leerlingen.list()).find((r) => r.id === created.id);
		expect(row).toMatchObject({
			number: created.number,
			status: "actief",
			account: "invited",
			startDate: "2026-09-01",
			endDate: "2027-07-01",
			vasteCoach: null,
		});
	});

	test("required fields and dates are checked", async () => {
		const keyuser = await asUser("keyuser");
		for (const bad of [
			{ lastName: "" },
			{ nickname: " " },
			{ email: "geen-adres" },
			{ birthDate: "2012-02-30" },
			{ startDate: "" },
			{ endDate: "2026-08-01" },
			{ photoUrl: "http://onveilig.nl/foto.jpg" },
		]) {
			const err = await codeOf(() => keyuser.client.people.leerlingen.create(leerlingInput(bad)));
			expect(err?.code, JSON.stringify(bad)).toBe("BAD_REQUEST");
		}
	});

	test("a taken e-mail or username is refused, at that field, and nothing is half-made", async () => {
		const keyuser = await asUser("keyuser");
		const username = `sam${unique()}`;
		const first = leerlingInput({ username });
		await keyuser.client.people.leerlingen.create(first);
		const before = (await keyuser.client.people.leerlingen.list()).length;

		const sameEmail = await codeOf(() =>
			keyuser.client.people.leerlingen.create(leerlingInput({ email: first.email })),
		);
		expect(sameEmail?.code).toBe("CONFLICT");
		expect(sameEmail?.data?.field).toBe("email");

		const sameName = await codeOf(() =>
			keyuser.client.people.leerlingen.create(leerlingInput({ username: username.toUpperCase() })),
		);
		expect(sameName?.data?.field).toBe("username");
		expect((await keyuser.client.people.leerlingen.list()).length).toBe(before);
	});

	test("a coach, a leerling or another school can't add or list", async () => {
		for (const who of ["coach", "leerling", "superadmin"] as const) {
			const u = await asUser(who);
			await expectForbidden(() => u.client.people.leerlingen.create(leerlingInput()));
			await expectForbidden(() => u.client.people.coaches.create(coachInput()));
		}
		const created = await (await asUser("keyuser")).client.people.leerlingen.create(leerlingInput());
		const andere = await asUser("andereKeyuser");
		const theirs = await andere.client.people.leerlingen.list();
		expect(theirs.map((r) => r.id)).not.toContain(created.id);
	});
});

describe("coach toevoegen (INC-17)", () => {
	test("the coach is in the list as coach, without access to leerlingen yet", async () => {
		const keyuser = await asUser("keyuser");
		const input = coachInput({ endDate: "2027-08-01" });
		const created = await keyuser.client.people.coaches.create(input);
		const row = (await keyuser.client.people.coaches.list()).find((r) => r.id === created.id);
		expect(row).toMatchObject({ status: "actief", leerlingen: 0, vervangingen: 0, startDate: "2026-08-01" });

		const users = await keyuser.client.admin.users.overview();
		expect(users.find((u) => u.id === created.id)?.role).toBe("coach");
	});

	test("uitdienst before indienst, or the e-mail of a coach of the school, is refused", async () => {
		const keyuser = await asUser("keyuser");
		const early = await codeOf(() =>
			keyuser.client.people.coaches.create(coachInput({ endDate: "2026-07-01" })),
		);
		expect(early?.code).toBe("BAD_REQUEST");

		const dup = await codeOf(() =>
			keyuser.client.people.coaches.create(coachInput({ email: "coach@incluvo.local" })),
		);
		expect(dup?.code).toBe("CONFLICT");
		expect(dup?.message).toBe("Er is al een coach met dit e-mailadres op je school.");
	});
});

describe("koppelen: vaste coach en vervanger (INC-18)", () => {
	async function setup() {
		const keyuser = await asUser("keyuser");
		const leerling = await keyuser.client.people.leerlingen.create(leerlingInput());
		const vast = await keyuser.client.people.coaches.create(coachInput());
		const vervanger = await keyuser.client.people.coaches.create(coachInput());
		return { keyuser, leerling, vast, vervanger };
	}
	const rowOf = async (keyuser: Awaited<ReturnType<typeof asUser>>, id: string) =>
		(await keyuser.client.people.leerlingen.list()).find((r) => r.id === id)!;

	test("a vervanger needs a vaste coach and must be someone else", async () => {
		const { keyuser, leerling, vast, vervanger } = await setup();
		const tooEarly = await codeOf(() =>
			keyuser.client.people.koppeling.set({ leerlingId: leerling.id, kind: "vervanger", coachId: vervanger.id }),
		);
		expect(tooEarly?.code).toBe("CONFLICT");

		await keyuser.client.people.koppeling.set({ leerlingId: leerling.id, kind: "vast", coachId: vast.id });
		const same = await codeOf(() =>
			keyuser.client.people.koppeling.set({ leerlingId: leerling.id, kind: "vervanger", coachId: vast.id }),
		);
		expect(same?.code).toBe("CONFLICT");

		await keyuser.client.people.koppeling.set({ leerlingId: leerling.id, kind: "vervanger", coachId: vervanger.id });
		const row = await rowOf(keyuser, leerling.id);
		expect(row.vasteCoach?.id).toBe(vast.id);
		expect(row.vervanger?.id).toBe(vervanger.id);

		// The vervanger can't become the vaste coach while standing in.
		const swap = await codeOf(() =>
			keyuser.client.people.koppeling.set({ leerlingId: leerling.id, kind: "vast", coachId: vervanger.id }),
		);
		expect(swap?.code).toBe("CONFLICT");
		// Nor can the vaste coach go while there's a vervanger.
		const drop = await codeOf(() =>
			keyuser.client.people.koppeling.set({ leerlingId: leerling.id, kind: "vast", coachId: null }),
		);
		expect(drop?.code).toBe("CONFLICT");
		// Refusals leave the koppelingen as they were.
		expect(await rowOf(keyuser, leerling.id)).toMatchObject({
			vasteCoach: { id: vast.id },
			vervanger: { id: vervanger.id },
		});
	});

	test("both coaches reach the leerling; ending the vervanging or changing the vaste coach takes it away", async () => {
		const { keyuser, leerling, vast, vervanger } = await setup();
		await keyuser.client.people.koppeling.set({ leerlingId: leerling.id, kind: "vast", coachId: vast.id });
		await keyuser.client.people.koppeling.set({ leerlingId: leerling.id, kind: "vervanger", coachId: vervanger.id });

		const { canReach } = await reachFor(leerling.id);
		expect(await canReach(vast.id)).toBe(true);
		expect(await canReach(vervanger.id)).toBe(true);

		await keyuser.client.people.koppeling.set({ leerlingId: leerling.id, kind: "vervanger", coachId: null });
		expect(await canReach(vervanger.id)).toBe(false);
		expect(await canReach(vast.id)).toBe(true);

		await keyuser.client.people.koppeling.set({ leerlingId: leerling.id, kind: "vast", coachId: vervanger.id });
		expect(await canReach(vervanger.id)).toBe(true);
		expect(await canReach(vast.id)).toBe(false);
	});

	test("a coach can't change koppelingen", async () => {
		const { leerling, vast } = await setup();
		const coach = await asUser("coach");
		await expectForbidden(() =>
			coach.client.people.koppeling.set({ leerlingId: leerling.id, kind: "vast", coachId: vast.id }),
		);
	});
});

/** Whether a coach (by id) reaches a leerling, through the one access rule. */
async function reachFor(leerlingId: string) {
	const { canAccessLeerling } = await import("@incluvo/permissions");
	const { db } = await import("@incluvo/drizzle");
	const { coachAssignment, user } = await import("@incluvo/drizzle/schema");
	const { eq } = await import("drizzle-orm");
	return {
		canReach: async (coachId: string) => {
			const [coach] = await db
				.select({ organizationId: user.organizationId })
				.from(user)
				.where(eq(user.id, coachId));
			const [leerling] = await db
				.select({ organizationId: user.organizationId })
				.from(user)
				.where(eq(user.id, leerlingId));
			const links = await db
				.select({ coachId: coachAssignment.coachId })
				.from(coachAssignment)
				.where(eq(coachAssignment.leerlingId, leerlingId));
			return canAccessLeerling(
				{ userId: coachId, role: "coach", organizationId: coach!.organizationId },
				{
					leerlingId,
					organizationId: leerling!.organizationId,
					coachIds: links.map((l) => l.coachId),
				},
			);
		},
	};
}
