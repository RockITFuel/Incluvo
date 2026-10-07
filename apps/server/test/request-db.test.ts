/**
 * Fix plan 1.4 — pool pressure. A request's connection is taken on first use,
 * can be handed back before slow work (`suspendDb`), and a saturated pool
 * fails fast with a recognisable error (the server answers 503).
 */
import { createRequestDb, db, isPoolTimeout, poolStats } from "@incluvo/drizzle";
import { auditLog, organization } from "@incluvo/drizzle/schema";
import { describe, expect, test } from "bun:test";
import { desc, eq, sql } from "drizzle-orm";
import pg from "pg";

const checkedOut = () => {
	const s = poolStats();
	return s.total - s.idle;
};

describe("createRequestDb", () => {
	test("takes no connection until the first query", async () => {
		const before = checkedOut();
		const req = createRequestDb("user:lazy");
		expect(checkedOut()).toBe(before);
		await req.db.execute(sql`select 1`);
		expect(checkedOut()).toBe(before + 1);
		await req.release();
		expect(checkedOut()).toBe(before);
	});

	test("suspend hands the connection back; the next query re-pins the actor", async () => {
		const before = checkedOut();
		const req = createRequestDb("user:suspended");
		await req.db.execute(sql`select 1`);
		await req.suspend();
		expect(checkedOut()).toBe(before);

		const rows = await req.db.execute<{ actor: string }>(
			sql`select current_setting('app.actor_id', true) as actor`,
		);
		expect(rows.rows[0]?.actor).toBe("user:suspended");
		await req.release();
	});

	test("writes after a suspend are still attributed to the actor", async () => {
		const [org] = await db.select().from(organization).limit(1);
		const req = createRequestDb("user:audit-after-suspend");
		await req.db.execute(sql`select 1`);
		await req.suspend();
		await req.db
			.update(organization)
			.set({ name: org!.name })
			.where(eq(organization.id, org!.id));
		await req.release();

		const [row] = await db
			.select({ actor: auditLog.actor })
			.from(auditLog)
			.where(eq(auditLog.tableName, "organization"))
			.orderBy(desc(auditLog.createdAt))
			.limit(1);
		expect(row?.actor).toBe("user:audit-after-suspend");
	});

	test("transactions run on one connection and roll back", async () => {
		const [org] = await db.select().from(organization).limit(1);
		const req = createRequestDb("user:tx");
		await expect(
			req.db.transaction(async (tx) => {
				await tx
					.update(organization)
					.set({ name: "tijdelijk" })
					.where(eq(organization.id, org!.id));
				throw new Error("rollback");
			}),
		).rejects.toThrow("rollback");
		await req.release();
		const [after] = await db.select().from(organization).where(eq(organization.id, org!.id));
		expect(after?.name).toBe(org!.name);
	});

	test("a released connection no longer carries the actor", async () => {
		const req = createRequestDb("user:gone");
		await req.db.execute(sql`select 1`);
		await req.release();
		const rows = await db.execute<{ actor: string }>(
			sql`select current_setting('app.actor_id', true) as actor`,
		);
		expect(rows.rows[0]?.actor ?? "").not.toBe("user:gone");
	});
});

describe("a saturated pool", () => {
	test("fails with an error the server maps to 503", async () => {
		const small = new pg.Pool({
			connectionString: process.env.DATABASE_URL,
			max: 1,
			connectionTimeoutMillis: 100,
		});
		const held = await small.connect();
		let error: unknown;
		try {
			await small.connect();
		} catch (e) {
			error = e;
		}
		held.release();
		await small.end();
		expect(isPoolTimeout(error)).toBe(true);
		expect(isPoolTimeout(new Error("something else"))).toBe(false);
	});
});
