import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/**
 * Validated server environment. Initialised lazily through a Proxy so that
 * importing modules never crashes before env vars are loaded (e.g. during
 * test setup or tooling).
 */
function createServerEnv() {
	return createEnv({
		server: {
			NODE_ENV: z
				.enum(["development", "test", "production"])
				.default("development"),
			DATABASE_URL: z.string().url(),
			BETTER_AUTH_SECRET: z.string().min(32),
			BETTER_AUTH_URL: z.string().url(),
			PORT: z.coerce.number().default(3110),
			CORS_ORIGINS: z
				.string()
				.default("http://localhost:3100")
				.transform((v) =>
					v
						.split(",")
						.map((s) => s.trim())
						.filter(Boolean),
				),
			ENABLE_API_DOCS: z
				.enum(["true", "false"])
				.default("false")
				.transform((v) => v === "true"),
			// --- AI EU data-residency allow-list. Comma-separated list of
			// approved EU-resident hostnames; `AI_BASE_URL`'s host must match
			// (exact or as a wildcard suffix). When unset a sensible EU default
			// set is used (see ai/config.ts). ---
			AI_ALLOWED_HOSTS: z.string().optional(),
			SMTP_HOST: z.string().default("localhost"),
			SMTP_PORT: z.coerce.number().default(1025),
			SMTP_FROM: z.string().default("no-reply@incluvo.local"),
			// --- AI layer (Epic 7). All optional; unset => deterministic MOCK
			// provider. For production point these at an EU-resident,
			// OpenAI-compatible endpoint (Azure OpenAI Data Zone EUR / Mistral EU). ---
			AI_BASE_URL: z.string().url().optional(),
			AI_API_KEY: z.string().optional(),
			AI_MODEL: z.string().optional(),
			AI_TRANSCRIBE_MODEL: z.string().optional(),
			// --- Object storage for course uploads (Epic 4). All optional; unset =>
			// local-dev fallback (apps/server/uploads + data URLs). Use an EU/NL
			// S3-compatible store (e.g. self-hosted MinIO) in production. ---
			S3_BUCKET: z.string().optional(),
			S3_ENDPOINT: z.string().url().optional(),
			S3_ACCESS_KEY_ID: z.string().optional(),
			S3_SECRET_ACCESS_KEY: z.string().optional(),
			S3_PUBLIC_BASE_URL: z.string().url().optional(),
		},
		runtimeEnv: process.env,
		emptyStringAsUndefined: true,
	});
}

type ServerEnv = ReturnType<typeof createServerEnv>;

let _env: ServerEnv | undefined;

export const env: ServerEnv = new Proxy({} as ServerEnv, {
	get(_, prop: string) {
		if (!_env) _env = createServerEnv();
		return _env[prop as keyof ServerEnv];
	},
});
