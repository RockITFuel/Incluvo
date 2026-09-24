import { relations } from "drizzle-orm";
import {
	boolean,
	index,
	uniqueIndex,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { user } from "./better-auth";
import { organization } from "./organization";

/**
 * Coach <-> leerling assignment within a tenant. Drives the coach dashboard
 * (#42–#44), notification routing and group-chat supervision (#6).
 */
export const coachAssignment = pgTable("coach_assignment", {
	id: uuid("id").primaryKey().defaultRandom(),
	organizationId: uuid("organization_id")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
	coachId: text("coach_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	leerlingId: text("leerling_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	// Coach can temporarily hide the leerling's task list (#39).
	taskListHidden: boolean("task_list_hidden").notNull().default(false),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
	// Hot paths: a coach's leerlingen, and a leerling's coaches.
	index("coach_assignment_coach_idx").on(t.coachId),
	index("coach_assignment_leerling_idx").on(t.leerlingId),
	uniqueIndex("coach_assignment_pair_uq").on(t.coachId, t.leerlingId),
]);

export type CoachAssignment = typeof coachAssignment.$inferSelect;
export type NewCoachAssignment = typeof coachAssignment.$inferInsert;

export const coachAssignmentRelations = relations(
	coachAssignment,
	({ one }) => ({
		organization: one(organization, {
			fields: [coachAssignment.organizationId],
			references: [organization.id],
		}),
		coach: one(user, {
			fields: [coachAssignment.coachId],
			references: [user.id],
			relationName: "coachAssignmentCoach",
		}),
		leerling: one(user, {
			fields: [coachAssignment.leerlingId],
			references: [user.id],
			relationName: "coachAssignmentLeerling",
		}),
	}),
);
