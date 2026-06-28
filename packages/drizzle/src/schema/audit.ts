import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Append-only audit log. Rows are written automatically by a Postgres trigger
 * (see `drizzle/audit-trigger.sql`) on every INSERT/UPDATE/DELETE of an audited
 * table. The `actor` column is populated from the `app.actor_id` GUC that the
 * server pins per request via `acquireRequestActor`.
 */
export const auditLog = pgTable("audit_log", {
	id: uuid("id").primaryKey().defaultRandom(),
	actor: text("actor").notNull().default("system"),
	tableName: text("table_name").notNull(),
	rowId: text("row_id"),
	operation: text("operation").notNull(), // INSERT | UPDATE | DELETE
	before: jsonb("before"),
	after: jsonb("after"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type AuditLog = typeof auditLog.$inferSelect;
