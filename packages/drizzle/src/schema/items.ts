import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./better-auth";

/**
 * Sample domain entity — a neutral placeholder for the end-to-end vertical slice
 * (Drizzle table -> oRPC procedures -> Solid page). Rename or replace with the
 * real Incluvo domain (coachplannen, cursussen, taken, ...).
 */
export const item = pgTable("item", {
	id: uuid("id").primaryKey().defaultRandom(),
	title: text("title").notNull(),
	description: text("description"),
	status: text("status").notNull().default("open"),
	ownerId: text("owner_id").references(() => user.id, { onDelete: "set null" }),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Item = typeof item.$inferSelect;
export type NewItem = typeof item.$inferInsert;
