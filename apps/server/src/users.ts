/**
 * Account provisioning. Self sign-up is disabled (auth.ts), so every account is
 * created here: by an invite (`account.users.invite`) or by the seed scripts.
 */
import { db } from "@incluvo/drizzle";
import { user } from "@incluvo/drizzle/schema";
import type { UserRole } from "@incluvo/permissions";
import { generateId } from "better-auth";
import { eq } from "drizzle-orm";
import { auth } from "./auth";
import { env } from "./env";
import { sendMail } from "./mail";

/** Invite links stay valid longer than a forgotten-password link (1 hour). */
const INVITE_EXPIRES_MS = 7 * 24 * 60 * 60 * 1000;

/** Web route where invited users set, and others reset, their password. */
export const SET_PASSWORD_PATH = "/wachtwoord-instellen";

export async function createAccount(input: {
	email: string;
	name: string;
	role: UserRole;
	organizationId: string | null;
	/** Omit for invites: the user sets it through the invite link. */
	password?: string;
}): Promise<string> {
	const ctx = await auth.$context;
	const created = await ctx.internalAdapter.createUser({
		email: input.email.toLowerCase(),
		name: input.name,
		emailVerified: false,
	});
	// Not better-auth fields, so set them on the row directly.
	await db
		.update(user)
		.set({ role: input.role, organizationId: input.organizationId })
		.where(eq(user.id, created.id));
	if (input.password) {
		await ctx.internalAdapter.linkAccount({
			userId: created.id,
			providerId: "credential",
			accountId: created.id,
			password: await ctx.password.hash(input.password),
		});
	}
	return created.id;
}

/** True when the user can sign in with a password (i.e. accepted an invite). */
export async function hasPassword(userId: string): Promise<boolean> {
	const ctx = await auth.$context;
	const accounts = await ctx.internalAdapter.findAccounts(userId);
	return accounts.some((a) => a.providerId === "credential" && a.password);
}

/**
 * Mail a set-password link. Reuses better-auth's reset-password token, so the
 * link lands on the same `/reset-password` endpoint and the web page calls
 * `resetPassword`, which also creates the credential account on first use.
 */
export async function sendInvite(user: {
	id: string;
	email: string;
	name: string;
}): Promise<void> {
	const ctx = await auth.$context;
	const token = generateId(24);
	await ctx.internalAdapter.createVerificationValue({
		value: user.id,
		identifier: `reset-password:${token}`,
		expiresAt: new Date(Date.now() + INVITE_EXPIRES_MS),
	});
	const callbackURL = encodeURIComponent(`${env.BETTER_AUTH_URL}${SET_PASSWORD_PATH}`);
	const url = `${ctx.baseURL}/reset-password/${token}?callbackURL=${callbackURL}`;
	await sendMail({
		to: user.email,
		subject: "Je account voor Incluvo",
		text: [
			`Hoi ${user.name},`,
			"",
			"Er is een Incluvo-account voor je aangemaakt. Kies via deze link een wachtwoord:",
			url,
			"",
			"De link is 7 dagen geldig. Werkt hij niet meer? Vraag je school om een nieuwe uitnodiging.",
		].join("\n"),
	});
}
