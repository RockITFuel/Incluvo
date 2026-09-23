import { describe, expect, test } from "bun:test";
import { DEMO, type DemoUser, anonymous, asUser, expectUnauthorized } from "./harness";

const EXPECTED_ROLE: Record<DemoUser, string> = {
	superadmin: "superadmin",
	keyuser: "keyuser",
	coach: "coach",
	leerling: "leerling",
	ontwikkelaar: "ontwikkelaar",
	coach2: "coach",
	leerling2: "leerling",
	andereKeyuser: "keyuser",
	andereCoach: "coach",
	andereLeerling: "leerling",
};

describe("harness", () => {
	for (const who of Object.keys(DEMO) as DemoUser[]) {
		test(`${who} is signed in with role ${EXPECTED_ROLE[who]}`, async () => {
			const { client } = await asUser(who);
			const me = await client.account.me();
			expect(me.role).toBe(EXPECTED_ROLE[who]);
		});
	}

	test("anonymous calls are rejected", async () => {
		await expectUnauthorized(() => anonymous.account.me());
	});

	test("the two schools are separate tenants", async () => {
		const a = (await (await asUser("coach")).client.account.me()).organization;
		const b = (await (await asUser("andereCoach")).client.account.me()).organization;
		expect(a?.id).toBeTruthy();
		expect(a?.id).not.toBe(b?.id);
	});
});
