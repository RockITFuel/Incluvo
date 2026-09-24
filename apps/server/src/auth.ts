import { db } from "@incluvo/drizzle";
import {
	account,
	session,
	user,
	verification,
} from "@incluvo/drizzle/schema";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { bearer } from "better-auth/plugins";
import { env } from "./env";
import { sendMail } from "./mail";
import { rateLimit } from "./rate-limit";

/** Sign-in attempts allowed per e-mail address, whatever IP they come from. */
const SIGN_IN_PER_EMAIL = { max: 10, windowMs: 15 * 60_000 };

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: { user, session, account, verification },
	}),
	secret: env.BETTER_AUTH_SECRET,
	baseURL: env.BETTER_AUTH_URL,
	emailAndPassword: {
		enabled: true,
		// Accounts are created by invite only (users.ts). Open sign-up let anyone
		// register a teacher's address before the school invited it, and then
		// inherit the invited role.
		disableSignUp: true,
		// "Wachtwoord vergeten": the link lands on the same page invites use.
		sendResetPassword: async ({ user, url }) => {
			await sendMail({
				to: user.email,
				subject: "Wachtwoord opnieuw instellen",
				text: [
					`Hoi ${user.name},`,
					"",
					"Via deze link kies je een nieuw wachtwoord voor Incluvo:",
					url,
					"",
					"De link is 1 uur geldig. Heb je dit niet zelf aangevraagd? Dan kun je deze mail negeren.",
				].join("\n"),
			});
		},
	},
	// Expose the app `role` column on the session user object.
	user: {
		additionalFields: {
			role: {
				type: "string",
				required: false,
				defaultValue: "leerling",
				input: false,
			},
		},
	},
	trustedOrigins: env.CORS_ORIGINS,
	// H3 — rate limiting. Protect minors' accounts from credential
	// stuffing / brute-force. better-auth's built-in limiter is keyed by
	// IP and applies a global window/max plus stricter per-path rules.
	// `enabled: true` forces it on outside production too (it defaults to
	// production-only). Storage is in-memory by default, which is adequate
	// for a single-instance deployment; move to "secondary-storage" when
	// horizontally scaled.
	rateLimit: {
		enabled: true,
		window: 60,
		max: 30,
		customRules: {
			// Called on every page load; a class behind one school IP would
			// otherwise lock itself out within a minute.
			"/get-session": false,
			// Per IP. Generous enough for a school NAT; the per-e-mail limit in
			// `hooks.before` is what stops guessing one account's password.
			"/sign-in/email": { window: 60, max: 20 },
			"/request-password-reset": { window: 60, max: 3 },
			"/forget-password": { window: 60, max: 3 },
			"/reset-password": { window: 60, max: 5 },
		},
	},
	advanced: env.AUTH_IP_HEADER
		? { ipAddress: { ipAddressHeaders: [env.AUTH_IP_HEADER] } }
		: undefined,
	hooks: {
		before: createAuthMiddleware(async (ctx) => {
			if (ctx.path !== "/sign-in/email") return;
			const email = String(ctx.body?.email ?? "").toLowerCase();
			if (email && !rateLimit(`sign-in:${email}`, SIGN_IN_PER_EMAIL)) {
				throw new APIError("TOO_MANY_REQUESTS", {
					message: "Te veel inlogpogingen. Probeer het over een kwartier opnieuw.",
				});
			}
		}),
	},
	plugins: [bearer()],
});

export type AuthSession = typeof auth.$Infer.Session;
