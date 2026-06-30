/**
 * Production startup script (CLP-style: migrate the DB, then boot the server).
 *
 * Order matters for Incluvo:
 *   1. Ensure the **pgvector** extension — the `kennisdocument_chunk.embedding`
 *      `vector(1536)` column (#20) requires it before the migration creates
 *      that table.
 *   2. Run committed Drizzle migrations from ./drizzle.
 *   3. Apply the audit trigger (idempotent: CREATE OR REPLACE + DROP IF EXISTS).
 *   4. Ensure the kennisdocument ANN index (hnsw, cosine) — kept out of the
 *      schema so `db:push`/migrate stay clean; created here once.
 *   5. Import the real server entry (./dist/index.js).
 *
 * Requires the `pgvector/pgvector` Postgres image (the Dokploy DB service).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error("[startup] DATABASE_URL is not set — refusing to start.");
	process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });
const db = drizzle(pool);

try {
	console.log("[startup] ensuring pgvector extension…");
	await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);

	console.log("[startup] running migrations…");
	await migrate(db, { migrationsFolder: "./drizzle" });

	console.log("[startup] applying audit trigger…");
	const auditSql = readFileSync(
		join(import.meta.dir, "drizzle", "audit-trigger.sql"),
		"utf8",
	);
	// Simple-query protocol runs the multi-statement file in one go.
	await pool.query(auditSql);

	console.log("[startup] ensuring kennisdocument ANN index…");
	await db.execute(
		sql`CREATE INDEX IF NOT EXISTS kennisdocument_chunk_embedding_idx ON kennisdocument_chunk USING hnsw (embedding vector_cosine_ops)`,
	);

	console.log("[startup] database ready.");
} catch (error) {
	console.error("[startup] migration/setup failed:", error);
	process.exit(1);
} finally {
	await pool.end();
}

// Boot the actual server.
await import("./dist/index.js");
