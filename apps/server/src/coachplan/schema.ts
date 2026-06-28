import { z } from "zod";

/**
 * Shared Zod shapes for the Coachplan / formulieren domain (#8–#21).
 *
 * Form *templates* are normalised into `form_template` + `form_question` rows,
 * but options for choice/scale/leervoorkeur live as JSON on the question. These
 * schemas validate that JSON and the answer values, and are reused by the typed
 * oRPC client so the wizard / formulierenmanager stay in lockstep with the DB.
 */

/** Question types the per-question-type component registry knows how to render. */
export const QuestionType = z.enum([
	"short_text",
	"long_text",
	"single_choice",
	"multiple_choice",
	"scale",
	"boolean",
	"smiley",
	// Trigger type: drives leervoorkeur labels on course content (#19/#35/#36).
	"leervoorkeur",
]);
export type QuestionType = z.infer<typeof QuestionType>;

export const FormSection = z.enum(["leerling", "coach"]);
export type FormSection = z.infer<typeof FormSection>;

export const FormScope = z.enum(["ondivera", "school"]);

/** A single choice/scale/leervoorkeur option. */
export const QuestionOption = z.object({
	value: z.string().min(1),
	label: z.string().min(1),
});
export type QuestionOption = z.infer<typeof QuestionOption>;

/**
 * The `options` JSON blob on a question. `choices` for choice/leervoorkeur,
 * `scaleMin`/`scaleMax`/`scaleMinLabel`/`scaleMaxLabel` for scale, and a
 * `theme` to group questions in the wizard (matches the demo's themed steps).
 */
export const QuestionOptions = z
	.object({
		theme: z.string().optional(),
		choices: z.array(QuestionOption).optional(),
		scaleMin: z.number().int().optional(),
		scaleMax: z.number().int().optional(),
		scaleMinLabel: z.string().optional(),
		scaleMaxLabel: z.string().optional(),
	})
	.nullable();
export type QuestionOptions = z.infer<typeof QuestionOptions>;

export const QuestionSchema = z.object({
	id: z.string(),
	templateId: z.string(),
	section: FormSection,
	type: QuestionType,
	label: z.string(),
	helpText: z.string().nullable(),
	required: z.boolean(),
	position: z.number().int(),
	// Template-level correspondence to a coach (POPP) question (#18).
	mapsToQuestionId: z.string().nullable(),
	options: QuestionOptions,
});
export type QuestionDTO = z.infer<typeof QuestionSchema>;

export const TemplateSchema = z.object({
	id: z.string(),
	scope: FormScope,
	organizationId: z.string().nullable(),
	parentTemplateId: z.string().nullable(),
	name: z.string(),
	description: z.string().nullable(),
	isSchoolDefault: z.boolean(),
	createdAt: z.date(),
	updatedAt: z.date(),
});
export type TemplateDTO = z.infer<typeof TemplateSchema>;

export const TemplateWithQuestionsSchema = TemplateSchema.extend({
	questions: z.array(QuestionSchema),
});

export const SubmissionStatus = z.enum([
	"draft",
	"submitted",
	"coach_review",
	"shared_with_leerling",
	"completed",
]);

export const AnswerSchema = z.object({
	id: z.string(),
	submissionId: z.string(),
	questionId: z.string(),
	value: z.string().nullable(),
	valueJson: z.unknown().nullable(),
	discussWithCoach: z.boolean(),
	deliberatelySkipped: z.boolean(),
});
export type AnswerDTO = z.infer<typeof AnswerSchema>;

export const SubmissionSchema = z.object({
	id: z.string(),
	templateId: z.string(),
	organizationId: z.string(),
	leerlingId: z.string(),
	coachId: z.string().nullable(),
	status: SubmissionStatus,
	approvedWithParents: z.boolean(),
	submittedAt: z.date().nullable(),
	createdAt: z.date(),
	updatedAt: z.date(),
});
export type SubmissionDTO = z.infer<typeof SubmissionSchema>;

/** Default leervoorkeur labels offered as standaardlabels (#19). */
export const DEFAULT_LEERVOORKEUR_LABELS: QuestionOption[] = [
	{ value: "korte_video", label: "Korte video" },
	{ value: "stap_voor_stap", label: "Stap-voor-stap lezen" },
	{ value: "uitproberen", label: "Iets uitproberen" },
	{ value: "bespreken", label: "Met iemand bespreken" },
	{ value: "podcast", label: "Luisteren (podcast)" },
	{ value: "opschrijven", label: "Zelf opschrijven" },
	{ value: "stilte", label: "In stilte werken" },
	{ value: "tekening", label: "Tekening / schema" },
	{ value: "meer_tijd", label: "Meer tijd" },
	{ value: "pauzes", label: "Pauzes nemen" },
];
