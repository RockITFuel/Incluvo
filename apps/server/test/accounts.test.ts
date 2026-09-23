/**
 * Fix plan 1.2 — accounts are created by invite only.
 */
import { db } from "@incluvo/drizzle";
import { user } from "@incluvo/drizzle/schema";
import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { testOutbox } from "../src/mail";
import { createAccount } from "../src/users";
import { asUser, expectForbidden, request } from "./harness";

let ipCounter = 0;
/** A fresh client IP per call, so the per-IP limiter doesn't couple tests. */
const freshIp = () => `10.0.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`;

function postAuth(path: string, body: unknown, ip = freshIp()) {
	return request(`/api/auth${path}`, {
		method: "POST",
		headers: { "content-type": "application/json", "x-forwarded-for": ip },
		body: JSON.stringify(body),
	});
}

const signIn = (email: string, password: string, ip?: string) =>
	postAuth("/sign-in/email", { email, password }, ip);

async function findUser(email: string) {
	const [row] = await db.select().from(user).where(eq(user.email, email));
	return row;
}

/** Pull the set-password link out of the last mail to `to`. */
function lastLinkTo(to: string): string {
	const mail = testOutbox.findLast((m) => m.to === to);
	if (!mail) throw new Error(`no mail to ${to}`);
	const url = mail.text.match(/https?:\/\/\S+/)?.[0];
	if (!url) throw new Error("no link in mail");
	return url;
}

/** Follow the mailed link like a browser, then set the password. */
async function acceptInvite(link: string, password: string) {
	const url = new URL(link);
	const res = await request(url.pathname + url.search, { redirect: "manual" });
	expect(res.status).toBe(302);
	const landing = new URL(res.headers.get("location")!);
	expect(landing.pathname).toBe("/wachtwoord-instellen");
	const token = landing.searchParams.get("token");
	expect(token).toBeTruthy();
	return postAuth("/reset-password", { token, newPassword: password });
}

beforeEach(() => {
	testOutbox.length = 0;
});

describe("sign-up is closed", () => {
	test("public sign-up is rejected and creates no user", async () => {
		const res = await postAuth("/sign-up/email", {
			email: "indringer@example.com",
			password: "een-lang-wachtwoord",
			name: "Indringer",
		});
		expect(res.status).toBeGreaterThanOrEqual(400);
		expect(await findUser("indringer@example.com")).toBeUndefined();
	});
});

describe("invite", () => {
	test("creates the account in the keyuser's school and mails a working link", async () => {
		const keyuser = await asUser("keyuser");
		const me = await keyuser.client.account.me();
		const res = await keyuser.client.account.users.invite({
			email: "Nieuwe.Coach@School.nl",
			name: "Nieuwe Coach",
			role: "coach",
		});
		expect(res).toMatchObject({ created: true, mailSent: true, role: "coach" });

		const row = await findUser("nieuwe.coach@school.nl");
		expect(row?.role).toBe("coach");
		expect(row?.organizationId).toBe(me.organization!.id);

		// No password yet: can't sign in until the link is used.
		expect((await signIn("nieuwe.coach@school.nl", "wachtwoord-van-mij")).status).toBe(401);

		const accepted = await acceptInvite(
			lastLinkTo("nieuwe.coach@school.nl"),
			"wachtwoord-van-mij",
		);
		expect(accepted.status).toBe(200);
		expect((await signIn("nieuwe.coach@school.nl", "wachtwoord-van-mij")).status).toBe(200);
	});

	test("inviting again resends the link until a password is set", async () => {
		const keyuser = await asUser("keyuser");
		await keyuser.client.account.users.invite({ email: "later@school.nl", role: "leerling" });
		const again = await keyuser.client.account.users.invite({
			email: "later@school.nl",
			role: "leerling",
		});
		expect(again.created).toBe(false);
		expect(testOutbox.filter((m) => m.to === "later@school.nl")).toHaveLength(2);

		// Existing users with a password get no new mail.
		testOutbox.length = 0;
		await keyuser.client.account.users.invite({ email: "coach2@incluvo.local", role: "coach" });
		expect(testOutbox).toHaveLength(0);
	});

	test("refuses to attach an account that has no school (pre-registered address)", async () => {
		await createAccount({
			email: "leraar@school.nl",
			name: "Voorgeregistreerd",
			role: "member",
			organizationId: null,
			password: "aanvaller-wachtwoord",
		});
		const keyuser = await asUser("keyuser");
		let code: string | undefined;
		try {
			await keyuser.client.account.users.invite({ email: "leraar@school.nl", role: "coach" });
		} catch (e) {
			code = (e as { code?: string }).code;
		}
		expect(code).toBe("CONFLICT");
		const row = await findUser("leraar@school.nl");
		expect(row?.organizationId).toBeNull();
		expect(row?.role).toBe("member");
	});

	test("refuses a user from another school", async () => {
		const keyuser = await asUser("keyuser");
		await expectForbidden(() =>
			keyuser.client.account.users.invite({
				email: "andere-coach@incluvo.local",
				role: "leerling",
			}),
		);
		expect((await findUser("andere-coach@incluvo.local"))?.role).toBe("coach");
	});

	test("a keyuser cannot invite into another school", async () => {
		const keyuser = await asUser("keyuser");
		const andere = await (await asUser("andereKeyuser")).client.account.me();
		await expectForbidden(() =>
			keyuser.client.account.users.invite({
				email: "ergens@school.nl",
				role: "leerling",
				organizationId: andere.organization!.id,
			}),
		);
		expect(await findUser("ergens@school.nl")).toBeUndefined();
	});

	test("a coach cannot invite", async () => {
		const coach = await asUser("coach");
		await expectForbidden(() =>
			coach.client.account.users.invite({ email: "x@school.nl", role: "leerling" }),
		);
	});
});

describe("forgot password", () => {
	test("mails a reset link that works", async () => {
		const res = await postAuth("/request-password-reset", {
			email: "leerling2@incluvo.local",
			redirectTo: "http://localhost:3200/wachtwoord-instellen",
		});
		expect(res.status).toBe(200);
		const accepted = await acceptInvite(lastLinkTo("leerling2@incluvo.local"), "nieuw-wachtwoord-1");
		expect(accepted.status).toBe(200);
		expect((await signIn("leerling2@incluvo.local", "nieuw-wachtwoord-1")).status).toBe(200);
	});
});

describe("rate limits", () => {
	test("get-session is not rate limited (every page load calls it)", async () => {
		const leerling = await asUser("leerling");
		for (let i = 0; i < 40; i++) {
			const res = await leerling.request("/api/auth/get-session");
			expect(res.status).toBe(200);
		}
	});

	test("one account is locked after 10 attempts, even from different IPs", async () => {
		for (let i = 0; i < 10; i++) {
			expect((await signIn("ontwikkelaar@incluvo.local", "fout")).status).toBe(401);
		}
		const blocked = await signIn("ontwikkelaar@incluvo.local", "incluvo123");
		expect(blocked.status).toBe(429);
		// Other accounts are unaffected.
		expect((await signIn("keyuser@incluvo.local", "incluvo123")).status).toBe(200);
	});
});
