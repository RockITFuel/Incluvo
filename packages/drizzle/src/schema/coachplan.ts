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
 * Coachplan / formulieren (#8–#21).
 *
 * A `formTemplate` is a reusable questionnaire. Scope distinguishes an Ondivera
 * platform template (#8) from a school-level template (#9). Schools copy an
 * Ondivera template and derive their own via `parentTemplateId`.
 *
 * Each template has a leerling-gedeelte and a coach-gedeelte (#8/#9, #17): the
 * `section` column on a question marks which part it belongs to.
 *
 * A `formSubmission` is a leerling filling in a template; `formAnswer` rows hold
 * the answers with the per-question flags "bespreken met coach" (#12) and
 * "bewust overgeslagen" (#13). Some answers map onto the coach questionnaire
 * (#16) via `answerCoachMapping`. Leervoorkeuren / standaardlabels (#19) are
 * stored as `learningPreferenceLabel` rows attached to a submission. The
 * "afgestemd met ouders" flag (#21) and a transcription record (#18) live on
 * the submission.
 */

/** Whether a template is owned by Ondivera (platform) or a school. */
export const formScope = pgEnum("form_scope", ["ondivera", "school"]);

/** Which part of the coachplan a question belongs to. */
export const formSection = pgEnum("form_section", ["leerling", "coach"]);

/**
 * Question types. The "trigger" types (e.g. leervoorkeur) feed the leeromgeving
 * (#8/#9 opmerkingen, #19/#35/#36) and recur in every template.
 */
export const questionType = pgEnum("question_type", [
	"short_text",
	"long_text",
	"single_choice",
	"multiple_choice",
	"scale",
	"boolean",
	"smiley",
	// Trigger type: drives learning-preference labels on course content.
	"leervoorkeur",
]);

export const formTemplate = pgTable("form_template", {
	id: uuid("id").primaryKey().defaultRandom(),
	scope: formScope("scope").notNull().default("ondivera"),
	// Null for an Ondivera template; the owning school for a school template.
	organizationId: uuid("organization_id").references(() => organization.id, {
		onDelete: "cascade",
	}),
	// The template this one was copied/derived from (#8 -> #9).
	parentTemplateId: uuid("parent_template_id"),
	name: text("name").notNull(),
	description: text("description"),
	// Marks the school default form (#10); per-leerling overrides via #10 link.
	isSchoolDefault: boolean("is_school_default").notNull().default(false),
	createdById: text("created_by_id").references(() => user.id, {
		onDelete: "set null",
	}),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const formQuestion = pgTable("form_question", {
	id: uuid("id").primaryKey().defaultRandom(),
	templateId: uuid("template_id")
		.notNull()
		.references(() => formTemplate.id, { onDelete: "cascade" }),
	section: formSection("section").notNull().default("leerling"),
	type: questionType("type").notNull().default("short_text"),
	label: text("label").notNull(),
	helpText: text("help_text"),
	required: boolean("required").notNull().default(false),
	position: integer("position").notNull().default(0),
	// Options for choice/scale/leervoorkeur questions, as JSON.
	options: jsonb("options"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Per-school link choosing which template applies to a specific leerling (#10).
 * A row overrides the school default for that leerling.
 */
export const formAssignment = pgTable("form_assignment", {
	id: uuid("id").primaryKey().defaultRandom(),
	organizationId: uuid("organization_id")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
	leerlingId: text("leerling_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	templateId: uuid("template_id")
		.notNull()
		.references(() => formTemplate.id, { onDelete: "cascade" }),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** A leerling's submission lifecycle. */
export const submissionStatus = pgEnum("submission_status", [
	"draft", // wizard in progress, autosaved (#11)
	"submitted", // sent to coach (#11/#15)
	"coach_review", // coach filling in coach-gedeelte (#17)
	"shared_with_leerling", // coach offered the result back (#17)
	"completed",
]);

export const formSubmission = pgTable("form_submission", {
	id: uuid("id").primaryKey().defaultRandom(),
	templateId: uuid("template_id")
		.notNull()
		.references(() => formTemplate.id, { onDelete: "restrict" }),
	organizationId: uuid("organization_id")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
	leerlingId: text("leerling_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	coachId: text("coach_id").references(() => user.id, { onDelete: "set null" }),
	status: submissionStatus("status").notNull().default("draft"),
	// "Plan afgestemd met ouders" toggle (#21).
	approvedWithParents: boolean("approved_with_parents").notNull().default(false),
	submittedAt: timestamp("submitted_at"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
	// Hot path: a leerling's coachplan submissions.
	index("form_submission_leerling_idx").on(t.leerlingId),
]);

export const formAnswer = pgTable("form_answer", {
	id: uuid("id").primaryKey().defaultRandom(),
	submissionId: uuid("submission_id")
		.notNull()
		.references(() => formSubmission.id, { onDelete: "cascade" }),
	questionId: uuid("question_id")
		.notNull()
		.references(() => formQuestion.id, { onDelete: "cascade" }),
	// Free-form / serialized choice value.
	value: text("value"),
	valueJson: jsonb("value_json"),
	// "Bespreken met coach" (#12) and "bewust overgeslagen" (#13).
	discussWithCoach: boolean("discuss_with_coach").notNull().default(false),
	deliberatelySkipped: boolean("deliberately_skipped").notNull().default(false),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Mapping of a leerling answer onto a question in the coach-gedeelte (#16). The
 * coach can edit the resulting value, so `overrideValue` captures the edit.
 */
export const answerCoachMapping = pgTable("answer_coach_mapping", {
	id: uuid("id").primaryKey().defaultRandom(),
	submissionId: uuid("submission_id")
		.notNull()
		.references(() => formSubmission.id, { onDelete: "cascade" }),
	sourceAnswerId: uuid("source_answer_id").references(() => formAnswer.id, {
		onDelete: "set null",
	}),
	coachQuestionId: uuid("coach_question_id")
		.notNull()
		.references(() => formQuestion.id, { onDelete: "cascade" }),
	overrideValue: text("override_value"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Leervoorkeur / standaardlabel set per submission (#19). These labels also tag
 * course content (#36, see course schema's `contentBlockLabel`).
 */
export const learningPreferenceLabel = pgTable("learning_preference_label", {
	id: uuid("id").primaryKey().defaultRandom(),
	submissionId: uuid("submission_id")
		.notNull()
		.references(() => formSubmission.id, { onDelete: "cascade" }),
	// Stable label key (e.g. "visueel", "auditief") used to match course labels.
	label: text("label").notNull(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** Transcription record for a coach conversation (#18). */
export const transcriptionStatus = pgEnum("transcription_status", [
	"pending",
	"processing",
	"completed",
	"failed",
]);

export const transcription = pgTable("transcription", {
	id: uuid("id").primaryKey().defaultRandom(),
	submissionId: uuid("submission_id")
		.notNull()
		.references(() => formSubmission.id, { onDelete: "cascade" }),
	coachId: text("coach_id").references(() => user.id, { onDelete: "set null" }),
	status: transcriptionStatus("status").notNull().default("pending"),
	// Storage key of the uploaded/recorded audio.
	// ASSUMPTION (QUESTIONS 4.3): recording may be deleted after transcription;
	// audioStorageKey is nullable so it can be cleared while keeping the text.
	audioStorageKey: text("audio_storage_key"),
	transcriptText: text("transcript_text"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type FormTemplate = typeof formTemplate.$inferSelect;
export type NewFormTemplate = typeof formTemplate.$inferInsert;
export type FormQuestion = typeof formQuestion.$inferSelect;
export type NewFormQuestion = typeof formQuestion.$inferInsert;
export type FormAssignment = typeof formAssignment.$inferSelect;
export type NewFormAssignment = typeof formAssignment.$inferInsert;
export type FormSubmission = typeof formSubmission.$inferSelect;
export type NewFormSubmission = typeof formSubmission.$inferInsert;
export type FormAnswer = typeof formAnswer.$inferSelect;
export type NewFormAnswer = typeof formAnswer.$inferInsert;
export type AnswerCoachMapping = typeof answerCoachMapping.$inferSelect;
export type NewAnswerCoachMapping = typeof answerCoachMapping.$inferInsert;
export type LearningPreferenceLabel =
	typeof learningPreferenceLabel.$inferSelect;
export type NewLearningPreferenceLabel =
	typeof learningPreferenceLabel.$inferInsert;
export type Transcription = typeof transcription.$inferSelect;
export type NewTranscription = typeof transcription.$inferInsert;

export const formTemplateRelations = relations(
	formTemplate,
	({ one, many }) => ({
		organization: one(organization, {
			fields: [formTemplate.organizationId],
			references: [organization.id],
		}),
		parent: one(formTemplate, {
			fields: [formTemplate.parentTemplateId],
			references: [formTemplate.id],
			relationName: "formTemplateParent",
		}),
		derived: many(formTemplate, { relationName: "formTemplateParent" }),
		questions: many(formQuestion),
		submissions: many(formSubmission),
	}),
);

export const formQuestionRelations = relations(formQuestion, ({ one }) => ({
	template: one(formTemplate, {
		fields: [formQuestion.templateId],
		references: [formTemplate.id],
	}),
}));

export const formAssignmentRelations = relations(formAssignment, ({ one }) => ({
	organization: one(organization, {
		fields: [formAssignment.organizationId],
		references: [organization.id],
	}),
	leerling: one(user, {
		fields: [formAssignment.leerlingId],
		references: [user.id],
	}),
	template: one(formTemplate, {
		fields: [formAssignment.templateId],
		references: [formTemplate.id],
	}),
}));

export const formSubmissionRelations = relations(
	formSubmission,
	({ one, many }) => ({
		template: one(formTemplate, {
			fields: [formSubmission.templateId],
			references: [formTemplate.id],
		}),
		organization: one(organization, {
			fields: [formSubmission.organizationId],
			references: [organization.id],
		}),
		leerling: one(user, {
			fields: [formSubmission.leerlingId],
			references: [user.id],
			relationName: "submissionLeerling",
		}),
		coach: one(user, {
			fields: [formSubmission.coachId],
			references: [user.id],
			relationName: "submissionCoach",
		}),
		answers: many(formAnswer),
		mappings: many(answerCoachMapping),
		learningPreferences: many(learningPreferenceLabel),
		transcriptions: many(transcription),
	}),
);

export const formAnswerRelations = relations(formAnswer, ({ one }) => ({
	submission: one(formSubmission, {
		fields: [formAnswer.submissionId],
		references: [formSubmission.id],
	}),
	question: one(formQuestion, {
		fields: [formAnswer.questionId],
		references: [formQuestion.id],
	}),
}));

export const answerCoachMappingRelations = relations(
	answerCoachMapping,
	({ one }) => ({
		submission: one(formSubmission, {
			fields: [answerCoachMapping.submissionId],
			references: [formSubmission.id],
		}),
		sourceAnswer: one(formAnswer, {
			fields: [answerCoachMapping.sourceAnswerId],
			references: [formAnswer.id],
		}),
		coachQuestion: one(formQuestion, {
			fields: [answerCoachMapping.coachQuestionId],
			references: [formQuestion.id],
		}),
	}),
);

export const learningPreferenceLabelRelations = relations(
	learningPreferenceLabel,
	({ one }) => ({
		submission: one(formSubmission, {
			fields: [learningPreferenceLabel.submissionId],
			references: [formSubmission.id],
		}),
	}),
);

export const transcriptionRelations = relations(transcription, ({ one }) => ({
	submission: one(formSubmission, {
		fields: [transcription.submissionId],
		references: [formSubmission.id],
	}),
	coach: one(user, {
		fields: [transcription.coachId],
		references: [user.id],
	}),
}));
