/**
 * Enable the pgvector extension (#20/#22). Run ONCE before `db:push`, because
 * the `kennisdocument_chunk.embedding` column has type `vector(…)` which
 * requires the extension to exist at create time.
 *
 *   bun run db:pgvector   # (root) -> bun run --cwd packages/drizzle pgvector
 *
 * Needs the `pgvector/pgvector` Postgres image (see docker-compose.yml).
 */
import { loadRootEnv } from "./load-env";

loadRootEnv();

const { db } = await import("./index");
const { sql } = await import("drizzle-orm");

await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
console.log("pgvector extension ensured.");
process.exit(0);
