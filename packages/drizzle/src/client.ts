import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index";

const { Pool } = pg;

const pool = new Pool({
	connectionString: process.env.DATABASE_URL,
	max: 30,
});

export const db = drizzle(pool, { schema });
export type Database = typeof db;

/**
 * Acquire a dedicated connection with `app.actor_id` set at the session level,
 * so every write made through the returned `db` is attributed to `actor` by the
 * audit trigger (see `src/schema/audit.ts` and `drizzle/audit-trigger.sql`).
 *
 * The oRPC `requireAuth` middleware calls this once per authenticated request and
 * releases the connection when the handler resolves.
 */
export async function acquireRequestActor(actor: string): Promise<{
	db: Database;
	release: () => Promise<void>;
}> {
	const client = await pool.connect();
	try {
		await client.query("select set_config('app.actor_id', $1, false)", [actor]);
	} catch (error) {
		client.release();
		throw error;
	}

	const requestDb = drizzle(client, { schema }) as unknown as Database;

	const release = async () => {
		await client
			.query("select set_config('app.actor_id', '', false)")
			.catch(() => {});
		client.release();
	};

	return { db: requestDb, release };
}
