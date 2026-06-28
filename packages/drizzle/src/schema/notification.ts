import { relations } from "drizzle-orm";
import {
	boolean,
	index,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { user } from "./better-auth";
import { organization } from "./organization";

/**
 * Notifications (#3). In-app notification rows with a type and read state.
 * Minimal at least for: coachplan sent/received, taken voor vandaag, nieuwe
 * taken, activiteiten binnen de leeromgeving.
 *
 * ASSUMPTION (QUESTIONS 10.1): MVP is in-app only. `entityType`/`entityId`
 * loosely reference the originating row so the UI can deep-link without a hard
 * FK per type.
 */
export const notificationType = pgEnum("notification_type", [
	"coachplan_submitted",
	"coachplan_shared",
	"task_due_today",
	"task_new",
	"course_activity",
	"chat_message",
	"generic",
]);

export const notification = pgTable("notification", {
	id: uuid("id").primaryKey().defaultRandom(),
	organizationId: uuid("organization_id")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
	// Recipient.
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	type: notificationType("type").notNull().default("generic"),
	title: text("title").notNull(),
	body: text("body"),
	// Loose link to the source row (e.g. "task", "form_submission").
	entityType: text("entity_type"),
	entityId: text("entity_id"),
	read: boolean("read").notNull().default(false),
	readAt: timestamp("read_at"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
	// Hot path: fetch a user's (unread) notifications.
	index("notification_user_read_idx").on(t.userId, t.read),
]);

export type Notification = typeof notification.$inferSelect;
export type NewNotification = typeof notification.$inferInsert;

export const notificationRelations = relations(notification, ({ one }) => ({
	organization: one(organization, {
		fields: [notification.organizationId],
		references: [organization.id],
	}),
	user: one(user, {
		fields: [notification.userId],
		references: [user.id],
	}),
}));
