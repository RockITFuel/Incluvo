/** INC-6: an invited user shows as "Uitgenodigd" until they accept; resend works. */
import { beforeEach, describe, expect, test } from "bun:test";
import { testOutbox } from "../src/mail";
import { asUser, expectForbidden, request } from "./harness";

let ip = 0;
const postAuth = (path: string, body: unknown) =>
	request(`/api/auth${path}`, {
		method: "POST",
		headers: { "content-type": "application/json", "x-forwarded-for": `10.9.0.${++ip}` },
		body: JSON.stringify(body),
	});

/** Follow the mailed link and set a password, like the invitee would. */
async function accept(email: string) {
	const mail = testOutbox.findLast((m) => m.to === email)!;
	const link = new URL(mail.text.match(/https?:\/\/\S+/)![0]);
	const res = await request(link.pathname + link.search, { redirect: "manual" });
	const token = new URL(res.headers.get("location")!).searchParams.get("token");
	const done = await postAuth("/reset-password", { token, newPassword: "een-lang-wachtwoord" });
	expect(done.status).toBe(200);
}

beforeEach(() => {
	testOutbox.length = 0;
});

describe("invite status", () => {
	test("Uitgenodigd → resend → accept → Actief", async () => {
		const keyuser = await asUser("keyuser");
		const email = "status.test@school.nl";
		const invited = await keyuser.client.account.users.invite({ email, role: "coach" });
		expect(invited.mailSent).toBe(true);

		const statusOf = async () =>
			(await keyuser.client.admin.users.overview()).find((u) => u.email === email)?.status;
		expect(await statusOf()).toBe("invited");

		const again = await keyuser.client.account.users.resendInvite({ userId: invited.userId });
		expect(again).toEqual({ email, mailSent: true });
		expect(testOutbox.filter((m) => m.to === email)).toHaveLength(2);

		await accept(email);
		expect(await statusOf()).toBe("active");

		let code: string | undefined;
		try {
			await keyuser.client.account.users.resendInvite({ userId: invited.userId });
		} catch (e) {
			code = (e as { code?: string }).code;
		}
		expect(code).toBe("BAD_REQUEST");
	});

	test("seeded users with a password are active; other schools can't resend", async () => {
		const keyuser = await asUser("keyuser");
		const rows = await keyuser.client.admin.users.overview();
		expect(rows.find((u) => u.email === "coach@incluvo.local")?.status).toBe("active");

		const invited = await keyuser.client.account.users.invite({
			email: "niet.van.jou@school.nl",
			role: "leerling",
		});
		const andere = await asUser("andereKeyuser");
		await expectForbidden(() =>
			andere.client.account.users.resendInvite({ userId: invited.userId }),
		);
	});
});
