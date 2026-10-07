import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index";

const { Pool } = pg;

const pool = new Pool({
	connectionString: process.env.DATABASE_URL,
	max: 30,
	// Waiting longer than this for a free connection means the pool is
	// saturated: fail fast (the server answers 503) instead of hanging.
	connectionTimeoutMillis: 10_000,
});

/** Pool counters, for tests and diagnostics. */
export function poolStats() {
	return {
		total: pool.totalCount,
		idle: pool.idleCount,
		waiting: pool.waitingCount,
	};
}

/** True for the error `pg` throws when no connection frees up in time. */
export function isPoolTimeout(error: unknown): boolean {
	return (
		error instanceof Error &&
		/timeout exceeded when trying to connect/i.test(error.message)
	);
}

export const db = drizzle(pool, { schema });
export type Database = typeof db;

export interface RequestDb {
	/** Drizzle bound to this request's connection, with the actor pinned. */
	db: Database;
	/**
	 * Hand the connection back to the pool, e.g. before slow external work
	 * (AI call, PDF rendering). The next query takes a fresh connection with
	 * the same actor pinned. Never call it inside a transaction.
	 */
	suspend: () => Promise<void>;
	/** End of request: hand the connection back (same as `suspend`). */
	release: () => Promise<void>;
}

/**
 * A per-request database handle whose writes the audit trigger attributes to
 * `actor` (`app.actor_id`, see `src/schema/audit.ts` and
 * `drizzle/audit-trigger.sql`).
 *
 * The connection is taken from the pool on the first query, not up front, so a
 * request that never touches the database never holds one, and `suspend()`
 * lets a handler give it back during slow work. Queries within a request (and
 * so drizzle transactions, which run on the same client) share one connection
 * while it is held.
 */
export function createRequestDb(actor: string): RequestDb {
	let client: pg.PoolClient | null = null;
	let pending: Promise<pg.PoolClient> | null = null;

	const acquire = (): Promise<pg.PoolClient> => {
		if (client) return Promise.resolve(client);
		pending ??= (async () => {
			const c = await pool.connect();
			try {
				await c.query("select set_config('app.actor_id', $1, false)", [actor]);
			} catch (error) {
				c.release();
				throw error;
			}
			client = c;
			return c;
		})().finally(() => {
			pending = null;
		});
		return pending;
	};

	const suspend = async () => {
		const c = client;
		if (!c) return;
		client = null;
		try {
			await c.query("select set_config('app.actor_id', '', false)");
			c.release();
		} catch {
			// Reset failed: destroy the connection instead of returning a poisoned
			// one to the pool, which would mis-attribute later audit rows.
			c.release(true);
		}
	};

	// Stand-in for a pg client: drizzle only calls `query`, and runs
	// transactions on the same object when it isn't a Pool.
	const lazyClient = {
		query: async (...args: unknown[]) =>
			(await acquire()).query(...(args as Parameters<pg.PoolClient["query"]>)),
	};
	const db = drizzle(lazyClient as unknown as pg.PoolClient, { schema }) as unknown as Database;

	return { db, suspend, release: suspend };
}
