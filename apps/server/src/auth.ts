import { db } from "@incluvo/drizzle";
import {
	account,
	session,
	user,
	verification,
} from "@incluvo/drizzle/schema";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins";
import { env } from "./env";

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: { user, session, account, verification },
	}),
	secret: env.BETTER_AUTH_SECRET,
	baseURL: env.BETTER_AUTH_URL,
	emailAndPassword: {
		enabled: true,
	},
	// Expose the app `role` column on the session user object.
	user: {
		additionalFields: {
			role: {
				type: "string",
				required: false,
				defaultValue: "member",
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
			// Credential endpoints get a much tighter budget.
			"/sign-in/email": { window: 60, max: 5 },
			"/sign-up/email": { window: 60, max: 5 },
			"/forget-password": { window: 60, max: 3 },
			"/reset-password": { window: 60, max: 5 },
			// `get-session` is a read-only session probe the SPA calls on every
			// navigation/route preload — it is not a brute-force target and must
			// not share the tight global budget (that caused 429 floods). The
			// client also caches it for 30s (see lib/auth/session.ts); this is a
			// generous ceiling for multi-tab / reload bursts.
			"/get-session": { window: 60, max: 120 },
		},
	},
	plugins: [bearer()],
});

export type AuthSession = typeof auth.$Infer.Session;
