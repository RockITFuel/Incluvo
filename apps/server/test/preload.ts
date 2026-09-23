/**
 * Test bootstrap (runs once per `bun test` process, before any test file).
 *
 * 1. Points DATABASE_URL at a throwaway `<name>_test` database on the same
 *    Postgres as the dev DB (or TEST_DATABASE_URL when set, e.g. in CI).
 * 2. Drops + recreates it, then applies exactly what production startup does
 *    (apps/server/startup.ts): pgvector, committed migrations, audit trigger.
 * 3. Seeds the demo tenants, the coachplan template and the demo courses.
 *
 * Env is set here, before anything imports `@incluvo/drizzle`, because the
 * pool reads DATABASE_URL at import time.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadRootEnv } from "@incluvo/drizzle/load-env";
import pg from "pg";

loadRootEnv();

const baseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!baseUrl) {
	throw new Error("Set DATABASE_URL (root .env) or TEST_DATABASE_URL to run tests");
}

const testUrl = new URL(baseUrl);
const baseName = testUrl.pathname.slice(1) || "incluvo";
const testDbName = baseName.endsWith("_test") ? baseName : `${baseName}_test`;
testUrl.pathname = `/${testDbName}`;

const adminUrl = new URL(baseUrl);
adminUrl.pathname = "/postgres";

Object.assign(process.env, {
	NODE_ENV: "test",
	DATABASE_URL: testUrl.toString(),
	BETTER_AUTH_SECRET:
		process.env.BETTER_AUTH_SECRET ?? "test-secret-test-secret-test-secret-0000",
	BETTER_AUTH_URL: "http://localhost:3200",
	CORS_ORIGINS: "http://localhost:3200",
	// Never let a developer's real AI key leak into tests: force the mock.
	AI_BASE_URL: "",
	AI_API_KEY: "",
	AI_EMBED_BASE_URL: "",
	AI_EMBED_API_KEY: "",
});

const admin = new pg.Client({ connectionString: adminUrl.toString() });
await admin.connect();
await admin.query(`DROP DATABASE IF EXISTS "${testDbName}" WITH (FORCE)`);
await admin.query(`CREATE DATABASE "${testDbName}"`);
await admin.end();

const { drizzle } = await import("drizzle-orm/node-postgres");
const { migrate } = await import("drizzle-orm/node-postgres/migrator");
const drizzleDir = join(import.meta.dir, "../../../packages/drizzle/drizzle");

const pool = new pg.Pool({ connectionString: testUrl.toString(), max: 1 });
await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
await migrate(drizzle(pool), { migrationsFolder: drizzleDir });
await pool.query(readFileSync(join(drizzleDir, "audit-trigger.sql"), "utf8"));
await pool.end();

// Demo tenants/users first, then the coachplan template and the courses (with
// a student execution + forum for leerling@). The seed scripts call
// process.exit, so each runs as a subprocess.
for (const script of ["seed-demo.ts", "seed-coachplan.ts", "seed-courses.ts"]) {
	const seed = Bun.spawnSync(["bun", `src/${script}`], {
		cwd: join(import.meta.dir, ".."),
		env: process.env,
		stdout: "pipe",
		stderr: "pipe",
	});
	if (seed.exitCode !== 0) {
		throw new Error(`${script} failed:\n${seed.stdout}\n${seed.stderr}`);
	}
}
