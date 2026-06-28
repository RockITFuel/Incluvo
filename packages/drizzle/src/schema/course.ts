import { relations } from "drizzle-orm";
import {
	boolean,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { user } from "./better-auth";
import { organization } from "./organization";

/**
 * Online cursus (#23–#36, #61).
 *
 * Three course kinds (#23): an Ondivera template, a school template (derived
 * from an Ondivera template), and a student execution (derived from a school
 * template). The parent/derived link is `parentCourseId`. A course has ordered
 * `section`s (#25), each with ordered `contentBlock`s (CbS, #26) discriminated
 * by `type` (opdracht/pagina/bestand/youtube/forum/lti, #27–#33).
 *
 * Opdracht blocks own an `assignment` (#27); leerlingen create
 * `assignmentSubmission`s which a coach grades (#28). Per-leerling progress per
 * content block is tracked in `contentProgress` (#24). Content blocks are
 * labelled with learning preferences (#36) via `contentBlockLabel` so they can
 * be shown as recommended/active (#35). A leerling can propose their own
 * assignment (#61) via `proposedAssignment`.
 */

/** The three course kinds (#23). */
export const courseKind = pgEnum("course_kind", [
	"ondivera_template",
	"school_template",
	"student_execution",
]);

export const course = pgTable("course", {
	id: uuid("id").primaryKey().defaultRandom(),
	kind: courseKind("kind").notNull().default("ondivera_template"),
	// Null for an Ondivera template; the owning school otherwise.
	organizationId: uuid("organization_id").references(() => organization.id, {
		onDelete: "cascade",
	}),
	// Source course this one was copied from (#23 inheritance).
	parentCourseId: uuid("parent_course_id"),
	// The leerling for a student_execution course.
	leerlingId: text("leerling_id").references(() => user.id, {
		onDelete: "cascade",
	}),
	title: text("title").notNull(),
	description: text("description"),
	// Coach can hide the progress bar (#24).
	progressBarHidden: boolean("progress_bar_hidden").notNull().default(false),
	createdById: text("created_by_id").references(() => user.id, {
		onDelete: "set null",
	}),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const courseSection = pgTable("course_section", {
	id: uuid("id").primaryKey().defaultRandom(),
	courseId: uuid("course_id")
		.notNull()
		.references(() => course.id, { onDelete: "cascade" }),
	title: text("title").notNull(),
	position: integer("position").notNull().default(0),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
	// Hot path: a course's sections.
	index("course_section_course_idx").on(t.courseId),
]);

/** Content-block (CbS) type discriminator (#26–#33). */
export const contentBlockType = pgEnum("content_block_type", [
	"opdracht",
	"pagina",
	"bestand",
	"youtube",
	"forum",
	"lti",
]);

export const contentBlock = pgTable("content_block", {
	id: uuid("id").primaryKey().defaultRandom(),
	sectionId: uuid("section_id")
		.notNull()
		.references(() => courseSection.id, { onDelete: "cascade" }),
	type: contentBlockType("type").notNull(),
	title: text("title").notNull(),
	position: integer("position").notNull().default(0),
	// WYSIWYG body for pagina (#29).
	body: text("body"),
	// File storage key for bestand (#30).
	fileStorageKey: text("file_storage_key"),
	// YouTube URL/id for youtube (#31).
	youtubeUrl: text("youtube_url"),
	// LTI launch config for lti (#33), as JSON.
	ltiConfig: jsonb("lti_config"),
	// Whether this block counts towards the progress bar (#24).
	countsForProgress: boolean("counts_for_progress").notNull().default(true),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
	// Hot path: a section's content blocks.
	index("content_block_section_idx").on(t.sectionId),
]);

/**
 * Learning-preference label on a content block (#36). Matches the leerling's
 * leervoorkeur labels (#19) to drive recommended/active content (#35).
 */
export const contentBlockLabel = pgTable("content_block_label", {
	id: uuid("id").primaryKey().defaultRandom(),
	contentBlockId: uuid("content_block_id")
		.notNull()
		.references(() => contentBlock.id, { onDelete: "cascade" }),
	label: text("label").notNull(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** Assignment attached to an opdracht content block (#27). */
export const assignmentResponseType = pgEnum("assignment_response_type", [
	"text",
	"files",
	"text_and_files",
]);

export const assignment = pgTable("assignment", {
	id: uuid("id").primaryKey().defaultRandom(),
	contentBlockId: uuid("content_block_id")
		.notNull()
		.references(() => contentBlock.id, { onDelete: "cascade" }),
	name: text("name").notNull(),
	description: text("description"),
	// Individual vs group assignment (#27).
	isGroup: boolean("is_group").notNull().default(false),
	responseType: assignmentResponseType("response_type")
		.notNull()
		.default("text_and_files"),
	maxAttempts: integer("max_attempts"),
	dueAt: timestamp("due_at"),
	availableFrom: timestamp("available_from"),
	availableUntil: timestamp("available_until"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const assignmentSubmissionStatus = pgEnum(
	"assignment_submission_status",
	["draft", "submitted", "graded", "returned"],
);

export const assignmentSubmission = pgTable("assignment_submission", {
	id: uuid("id").primaryKey().defaultRandom(),
	assignmentId: uuid("assignment_id")
		.notNull()
		.references(() => assignment.id, { onDelete: "cascade" }),
	leerlingId: text("leerling_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	attempt: integer("attempt").notNull().default(1),
	status: assignmentSubmissionStatus("status").notNull().default("draft"),
	responseText: text("response_text"),
	// Uploaded file storage keys, as JSON array.
	fileStorageKeys: jsonb("file_storage_keys"),
	submittedAt: timestamp("submitted_at"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Grading of a submission (#28). Cijfer is optional; feedback may be text and/or
 * a voice/video message storage key.
 */
export const assignmentGrade = pgTable("assignment_grade", {
	id: uuid("id").primaryKey().defaultRandom(),
	submissionId: uuid("submission_id")
		.notNull()
		.references(() => assignmentSubmission.id, { onDelete: "cascade" }),
	coachId: text("coach_id").references(() => user.id, { onDelete: "set null" }),
	// Optional grade (#28). ASSUMPTION (QUESTIONS 6.4): scale undecided, stored
	// as free text (e.g. "8", "voldoende") until the rubric is defined.
	grade: text("grade"),
	feedbackText: text("feedback_text"),
	feedbackMediaStorageKey: text("feedback_media_storage_key"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** Per-leerling progress per content block (#24). */
export const contentProgress = pgTable("content_progress", {
	id: uuid("id").primaryKey().defaultRandom(),
	contentBlockId: uuid("content_block_id")
		.notNull()
		.references(() => contentBlock.id, { onDelete: "cascade" }),
	leerlingId: text("leerling_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	completed: boolean("completed").notNull().default(false),
	completedAt: timestamp("completed_at"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
	// Hot path: a leerling's progress, and progress for a given block.
	index("content_progress_leerling_block_idx").on(
		t.leerlingId,
		t.contentBlockId,
	),
]);

/** Leerling-proposed assignment, to be discussed with the coach (#61). */
export const proposedAssignmentStatus = pgEnum("proposed_assignment_status", [
	"proposed",
	"accepted",
	"rejected",
]);

export const proposedAssignment = pgTable("proposed_assignment", {
	id: uuid("id").primaryKey().defaultRandom(),
	courseId: uuid("course_id")
		.notNull()
		.references(() => course.id, { onDelete: "cascade" }),
	leerlingId: text("leerling_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	coachId: text("coach_id").references(() => user.id, { onDelete: "set null" }),
	title: text("title").notNull(),
	description: text("description"),
	status: proposedAssignmentStatus("status").notNull().default("proposed"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Course = typeof course.$inferSelect;
export type NewCourse = typeof course.$inferInsert;
export type CourseSection = typeof courseSection.$inferSelect;
export type NewCourseSection = typeof courseSection.$inferInsert;
export type ContentBlock = typeof contentBlock.$inferSelect;
export type NewContentBlock = typeof contentBlock.$inferInsert;
export type ContentBlockLabel = typeof contentBlockLabel.$inferSelect;
export type NewContentBlockLabel = typeof contentBlockLabel.$inferInsert;
export type Assignment = typeof assignment.$inferSelect;
export type NewAssignment = typeof assignment.$inferInsert;
export type AssignmentSubmission = typeof assignmentSubmission.$inferSelect;
export type NewAssignmentSubmission =
	typeof assignmentSubmission.$inferInsert;
export type AssignmentGrade = typeof assignmentGrade.$inferSelect;
export type NewAssignmentGrade = typeof assignmentGrade.$inferInsert;
export type ContentProgress = typeof contentProgress.$inferSelect;
export type NewContentProgress = typeof contentProgress.$inferInsert;
export type ProposedAssignment = typeof proposedAssignment.$inferSelect;
export type NewProposedAssignment = typeof proposedAssignment.$inferInsert;

export const courseRelations = relations(course, ({ one, many }) => ({
	organization: one(organization, {
		fields: [course.organizationId],
		references: [organization.id],
	}),
	parent: one(course, {
		fields: [course.parentCourseId],
		references: [course.id],
		relationName: "courseParent",
	}),
	derived: many(course, { relationName: "courseParent" }),
	leerling: one(user, {
		fields: [course.leerlingId],
		references: [user.id],
	}),
	sections: many(courseSection),
	proposedAssignments: many(proposedAssignment),
}));

export const courseSectionRelations = relations(
	courseSection,
	({ one, many }) => ({
		course: one(course, {
			fields: [courseSection.courseId],
			references: [course.id],
		}),
		contentBlocks: many(contentBlock),
	}),
);

export const contentBlockRelations = relations(
	contentBlock,
	({ one, many }) => ({
		section: one(courseSection, {
			fields: [contentBlock.sectionId],
			references: [courseSection.id],
		}),
		labels: many(contentBlockLabel),
		assignment: one(assignment),
		progress: many(contentProgress),
	}),
);

export const contentBlockLabelRelations = relations(
	contentBlockLabel,
	({ one }) => ({
		contentBlock: one(contentBlock, {
			fields: [contentBlockLabel.contentBlockId],
			references: [contentBlock.id],
		}),
	}),
);

export const assignmentRelations = relations(assignment, ({ one, many }) => ({
	contentBlock: one(contentBlock, {
		fields: [assignment.contentBlockId],
		references: [contentBlock.id],
	}),
	submissions: many(assignmentSubmission),
}));

export const assignmentSubmissionRelations = relations(
	assignmentSubmission,
	({ one, many }) => ({
		assignment: one(assignment, {
			fields: [assignmentSubmission.assignmentId],
			references: [assignment.id],
		}),
		leerling: one(user, {
			fields: [assignmentSubmission.leerlingId],
			references: [user.id],
		}),
		grades: many(assignmentGrade),
	}),
);

export const assignmentGradeRelations = relations(
	assignmentGrade,
	({ one }) => ({
		submission: one(assignmentSubmission, {
			fields: [assignmentGrade.submissionId],
			references: [assignmentSubmission.id],
		}),
		coach: one(user, {
			fields: [assignmentGrade.coachId],
			references: [user.id],
		}),
	}),
);

export const contentProgressRelations = relations(
	contentProgress,
	({ one }) => ({
		contentBlock: one(contentBlock, {
			fields: [contentProgress.contentBlockId],
			references: [contentBlock.id],
		}),
		leerling: one(user, {
			fields: [contentProgress.leerlingId],
			references: [user.id],
		}),
	}),
);

export const proposedAssignmentRelations = relations(
	proposedAssignment,
	({ one }) => ({
		course: one(course, {
			fields: [proposedAssignment.courseId],
			references: [course.id],
		}),
		leerling: one(user, {
			fields: [proposedAssignment.leerlingId],
			references: [user.id],
			relationName: "proposedAssignmentLeerling",
		}),
		coach: one(user, {
			fields: [proposedAssignment.coachId],
			references: [user.id],
			relationName: "proposedAssignmentCoach",
		}),
	}),
);
