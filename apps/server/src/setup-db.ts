/**
 * Prepare a fresh database the way production does at startup (pgvector, the
 * committed migrations, the audit trigger) and load the demo seeds. Used by
 * the server tests (test/preload.ts) and the accessibility check in CI
 * (`bun run --cwd apps/server setup-db`).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const SERVER_DIR = join(import.meta.dir, "..");
const DRIZZLE_DIR = join(SERVER_DIR, "../../packages/drizzle/drizzle");

export async function prepareDatabase(url: string): Promise<void> {
	const pool = new pg.Pool({ connectionString: url, max: 1 });
	try {
		await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
		await migrate(drizzle(pool), { migrationsFolder: DRIZZLE_DIR });
		await pool.query(readFileSync(join(DRIZZLE_DIR, "audit-trigger.sql"), "utf8"));
	} finally {
		await pool.end();
	}
	// Demo tenants/users first, then the coachplan template and the courses.
	// The seed scripts call process.exit, so each runs as a subprocess.
	for (const script of ["seed-demo.ts", "seed-coachplan.ts", "seed-courses.ts"]) {
		const seed = Bun.spawnSync(["bun", `src/${script}`], {
			cwd: SERVER_DIR,
			env: { ...process.env, DATABASE_URL: url },
			stdout: "pipe",
			stderr: "pipe",
		});
		if (seed.exitCode !== 0) {
			throw new Error(`${script} failed:\n${seed.stdout}\n${seed.stderr}`);
		}
	}
}

if (import.meta.main) {
	const url = process.env.DATABASE_URL;
	if (!url) throw new Error("DATABASE_URL is not set");
	await prepareDatabase(url);
	console.log("database ready");
}
