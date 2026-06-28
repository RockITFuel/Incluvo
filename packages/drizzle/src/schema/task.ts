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
import { assignment } from "./course";
import { organization } from "./organization";

/**
 * Takenlijst (#37–#41).
 *
 * Tasks are either sourced from a course assignment (#37) or created manually by
 * a coach or leerling (#41); `source` discriminates. Due dates split the list
 * into vandaag/toekomst (#37); `pinnedForToday` lets a leerling pull a future
 * task into today (#38). `done` is the afgevinkt state (#40). The per-pupil
 * "hide task list" toggle (#39) lives on `coachAssignment` (membership schema).
 */

export const taskSource = pgEnum("task_source", ["assignment", "manual"]);

export const task = pgTable("task", {
	id: uuid("id").primaryKey().defaultRandom(),
	organizationId: uuid("organization_id")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
	// The leerling the task belongs to.
	leerlingId: text("leerling_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	source: taskSource("source").notNull().default("manual"),
	// Set when source = "assignment" (#37). Coach may adjust the due date here.
	assignmentId: uuid("assignment_id").references(() => assignment.id, {
		onDelete: "cascade",
	}),
	// Who created a manual task (coach or leerling, #41).
	createdById: text("created_by_id").references(() => user.id, {
		onDelete: "set null",
	}),
	title: text("title").notNull(),
	description: text("description"),
	dueAt: timestamp("due_at"),
	// Leerling pulled a future task into "vandaag" (#38).
	pinnedForToday: boolean("pinned_for_today").notNull().default(false),
	done: boolean("done").notNull().default(false),
	doneAt: timestamp("done_at"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
	// Hot path: a leerling's task list.
	index("task_leerling_idx").on(t.leerlingId),
]);

export type Task = typeof task.$inferSelect;
export type NewTask = typeof task.$inferInsert;

export const taskRelations = relations(task, ({ one }) => ({
	organization: one(organization, {
		fields: [task.organizationId],
		references: [organization.id],
	}),
	leerling: one(user, {
		fields: [task.leerlingId],
		references: [user.id],
		relationName: "taskLeerling",
	}),
	createdBy: one(user, {
		fields: [task.createdById],
		references: [user.id],
		relationName: "taskCreatedBy",
	}),
	assignment: one(assignment, {
		fields: [task.assignmentId],
		references: [assignment.id],
	}),
}));
