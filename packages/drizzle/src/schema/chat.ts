import { relations } from "drizzle-orm";
import {
	index,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { user } from "./better-auth";
import { contentBlock } from "./course";
import { organization } from "./organization";
import { task } from "./task";

/**
 * Chat (#5–#7).
 *
 * A `conversation` is either a 1:1 coach–leerling chat (#5) or a group/forum
 * started within a course as an opdracht (#6/#32). `kind` discriminates;
 * `courseContentBlockId` links a forum conversation to its CbS. Membership is
 * explicit via `conversationMember`; a coach can be a `supervisor` member to
 * always read along in group chats (#6). Messages may reference a coachtaak
 * created from the chat window (#7) via `taskId`.
 */

export const conversationKind = pgEnum("conversation_kind", [
	"direct", // 1:1 coach–leerling (#5)
	"forum", // group/forum within a course (#6/#32)
]);

export const conversation = pgTable("conversation", {
	id: uuid("id").primaryKey().defaultRandom(),
	organizationId: uuid("organization_id")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
	kind: conversationKind("kind").notNull().default("direct"),
	// The forum's content block (#32), when kind = "forum".
	courseContentBlockId: uuid("course_content_block_id").references(
		() => contentBlock.id,
		{ onDelete: "cascade" },
	),
	title: text("title"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** Role of a member within a conversation. `supervisor` = coach-meekijk (#6). */
export const conversationRole = pgEnum("conversation_role", [
	"member",
	"supervisor",
]);

export const conversationMember = pgTable("conversation_member", {
	id: uuid("id").primaryKey().defaultRandom(),
	conversationId: uuid("conversation_id")
		.notNull()
		.references(() => conversation.id, { onDelete: "cascade" }),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	role: conversationRole("role").notNull().default("member"),
	lastReadAt: timestamp("last_read_at"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
	// Hot path: a user's conversations, and a conversation's members.
	index("conversation_member_user_idx").on(t.userId),
	index("conversation_member_conversation_idx").on(t.conversationId),
]);

export const message = pgTable("message", {
	id: uuid("id").primaryKey().defaultRandom(),
	conversationId: uuid("conversation_id")
		.notNull()
		.references(() => conversation.id, { onDelete: "cascade" }),
	senderId: text("sender_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	body: text("body").notNull(),
	// Optional file/image attachment storage key.
	attachmentStorageKey: text("attachment_storage_key"),
	// Coachtaak created from the chat window (#7), linked back into the message.
	taskId: uuid("task_id").references(() => task.id, { onDelete: "set null" }),
	createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
	// Hot path: paginate a conversation's messages in chronological order.
	index("message_conversation_created_idx").on(t.conversationId, t.createdAt),
]);

export type Conversation = typeof conversation.$inferSelect;
export type NewConversation = typeof conversation.$inferInsert;
export type ConversationMember = typeof conversationMember.$inferSelect;
export type NewConversationMember = typeof conversationMember.$inferInsert;
export type Message = typeof message.$inferSelect;
export type NewMessage = typeof message.$inferInsert;

export const conversationRelations = relations(
	conversation,
	({ one, many }) => ({
		organization: one(organization, {
			fields: [conversation.organizationId],
			references: [organization.id],
		}),
		contentBlock: one(contentBlock, {
			fields: [conversation.courseContentBlockId],
			references: [contentBlock.id],
		}),
		members: many(conversationMember),
		messages: many(message),
	}),
);

export const conversationMemberRelations = relations(
	conversationMember,
	({ one }) => ({
		conversation: one(conversation, {
			fields: [conversationMember.conversationId],
			references: [conversation.id],
		}),
		user: one(user, {
			fields: [conversationMember.userId],
			references: [user.id],
		}),
	}),
);

export const messageRelations = relations(message, ({ one }) => ({
	conversation: one(conversation, {
		fields: [message.conversationId],
		references: [conversation.id],
	}),
	sender: one(user, {
		fields: [message.senderId],
		references: [user.id],
	}),
	task: one(task, {
		fields: [message.taskId],
		references: [task.id],
	}),
}));
