import {
	answerCoachMapping,
	coachAssignment,
	formAnswer,
	formAssignment,
	formQuestion,
	formSubmission,
	formTemplate,
	learningPreferenceLabel,
	organization,
	user,
} from "@incluvo/drizzle/schema";
import {
	can,
	isSuperadmin,
	policies,
	sameTenant,
} from "@incluvo/permissions";
import { ORPCError } from "@orpc/server";
import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import {
	type PdfPlan,
	type PdfQuestion,
	renderPlanPdf,
} from "../../coachplan/pdf";
import {
	AnswerSchema,
	DEFAULT_LEERVOORKEUR_LABELS,
	FormScope,
	FormSection,
	QuestionOptions,
	QuestionSchema,
	QuestionType,
	SubmissionSchema,
	TemplateSchema,
	TemplateWithQuestionsSchema,
} from "../../coachplan/schema";
import { notify } from "../../notifications/notify";
import { rateLimit } from "../../rate-limit";
import { publishTo } from "../../sse";
import { type AuthedContext, base, protectedProcedure, withPolicy } from "../base";

/**
 * Coachplan / formulieren domain (backlog #8–#21).
 *
 * Flow this router powers, end to end:
 *   - keyuser/superadmin manage form *templates* (#8/#9), copy an Ondivera
 *     template into a school (#9), set a school default / per-leerling
 *     assignment (#10), CRUD the questions;
 *   - a leerling fills the wizard with per-question autosave (#11), flagging
 *     "bespreken met coach" (#12) / "bewust overgeslagen" (#13), then submits
 *     and reviews/edits the overview (#14);
 *   - a coach reads the answers with their flags (#15), maps answers onto the
 *     coach vragenlijst with editable overrides (#16), fills the coach-gedeelte
 *     (#17), sets leervoorkeuren / standaardlabels (#19), toggles "afgestemd
 *     met ouders" (#21), and downloads a PDF (#20).
 *
 * Transcription (#18) and AI (#22) belong to Epic 7 and are not built here.
 *
 * Tenant scoping: every handler re-checks `sameTenant(actor, row)` after loading,
 * so a leerling/coach can never reach another tenant's plan even though the
 * role-only `withPolicy` gate already ran.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A leerling's assigned coach ids (for per-recipient SSE fan-out, C1). */
async function coachIdsFor(
	context: AuthedContext,
	leerlingId: string,
): Promise<string[]> {
	const rows = await context.db
		.select({ coachId: coachAssignment.coachId })
		.from(coachAssignment)
		.where(eq(coachAssignment.leerlingId, leerlingId));
	return [...new Set(rows.map((r) => r.coachId))];
}

/** Map a template row to the DTO shape (Date columns pass through). */
function templateDto(row: typeof formTemplate.$inferSelect) {
	return {
		id: row.id,
		scope: row.scope,
		organizationId: row.organizationId,
		parentTemplateId: row.parentTemplateId,
		name: row.name,
		description: row.description,
		isSchoolDefault: row.isSchoolDefault,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

function questionDto(row: typeof formQuestion.$inferSelect) {
	return {
		id: row.id,
		templateId: row.templateId,
		section: row.section,
		type: row.type,
		label: row.label,
		helpText: row.helpText,
		required: row.required,
		position: row.position,
		mapsToQuestionId: row.mapsToQuestionId,
		options: (row.options ?? null) as never,
	};
}

function submissionDto(row: typeof formSubmission.$inferSelect) {
	return {
		id: row.id,
		templateId: row.templateId,
		organizationId: row.organizationId,
		leerlingId: row.leerlingId,
		coachId: row.coachId,
		status: row.status,
		approvedWithParents: row.approvedWithParents,
		submittedAt: row.submittedAt,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

function answerDto(row: typeof formAnswer.$inferSelect) {
	return {
		id: row.id,
		submissionId: row.submissionId,
		questionId: row.questionId,
		value: row.value,
		valueJson: row.valueJson ?? null,
		discussWithCoach: row.discussWithCoach,
		deliberatelySkipped: row.deliberatelySkipped,
	};
}

// ---------------------------------------------------------------------------
// #8 / #9 — Form templates (manage, list, get, copy-to-school)
// ---------------------------------------------------------------------------

/**
 * List templates the actor may use: Ondivera templates (visible to everyone for
 * copying) + the actor's own school templates. Superadmin sees all.
 */
const templatesList = protectedProcedure
	.use(withPolicy(policies.readForm, (c) => ({ organizationId: c.actor.organizationId })))
	.route({ method: "GET", path: "/coachplan/templates", tags: ["coachplan"] })
	.output(z.array(TemplateSchema))
	.handler(async ({ context }) => {
		const { actor } = context;
		const rows = await context.db
			.select()
			.from(formTemplate)
			.orderBy(desc(formTemplate.updatedAt));
		const visible = rows.filter(
			(t) =>
				isSuperadmin(actor.role) ||
				t.scope === "ondivera" ||
				(t.organizationId && sameTenant(actor, t)),
		);
		return visible.map(templateDto);
	});

/** Get one template with its questions (ordered). */
const templatesGet = protectedProcedure
	.use(withPolicy(policies.readForm, (c) => ({ organizationId: c.actor.organizationId })))
	.route({ method: "GET", path: "/coachplan/templates/{id}", tags: ["coachplan"] })
	.input(z.object({ id: z.string().uuid() }))
	.output(TemplateWithQuestionsSchema)
	.handler(async ({ input, context }) => {
		const { actor } = context;
		const [tpl] = await context.db
			.select()
			.from(formTemplate)
			.where(eq(formTemplate.id, input.id));
		if (!tpl) throw new ORPCError("NOT_FOUND");
		// Ondivera templates are readable by any coach+; school templates are tenant-scoped.
		if (tpl.scope === "school" && !sameTenant(actor, tpl)) {
			throw new ORPCError("FORBIDDEN");
		}
		const questions = await context.db
			.select()
			.from(formQuestion)
			.where(eq(formQuestion.templateId, tpl.id))
			.orderBy(asc(formQuestion.position));
		return { ...templateDto(tpl), questions: questions.map(questionDto) };
	});

/** Create a school template (#9). Keyuser+ within their own tenant. */
const templatesCreate = protectedProcedure
	.use(withPolicy(policies.manageForms, (c) => ({ organizationId: c.actor.organizationId })))
	.route({ method: "POST", path: "/coachplan/templates", tags: ["coachplan"] })
	.input(
		z.object({
			name: z.string().min(1),
			description: z.string().optional(),
			scope: FormScope.default("school"),
		}),
	)
	.output(TemplateSchema)
	.handler(async ({ input, context }) => {
		const { actor } = context;
		// Only the superadmin may author Ondivera-scope templates.
		const scope = input.scope === "ondivera" && isSuperadmin(actor.role)
			? "ondivera"
			: "school";
		const organizationId = scope === "ondivera" ? null : actor.organizationId;
		if (scope === "school" && !organizationId) {
			throw new ORPCError("BAD_REQUEST", { message: "No tenant" });
		}
		const [row] = await context.db
			.insert(formTemplate)
			.values({
				name: input.name,
				description: input.description ?? null,
				scope,
				organizationId,
				createdById: actor.userId,
			})
			.returning();
		if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");
		publishTo(
			{ type: "coachplan.template.changed", payload: { id: row.id } },
			[context.actor.userId],
		);
		return templateDto(row);
	});

/** Update a template's name/description (#9). */
const templatesUpdate = protectedProcedure
	.use(withPolicy(policies.manageForms, (c) => ({ organizationId: c.actor.organizationId })))
	.route({ method: "PUT", path: "/coachplan/templates/{id}", tags: ["coachplan"] })
	.input(
		z.object({
			id: z.string().uuid(),
			name: z.string().min(1).optional(),
			description: z.string().nullable().optional(),
		}),
	)
	.output(TemplateSchema)
	.handler(async ({ input, context }) => {
		const { actor } = context;
		const [tpl] = await context.db
			.select()
			.from(formTemplate)
			.where(eq(formTemplate.id, input.id));
		if (!tpl) throw new ORPCError("NOT_FOUND");
		if (!can(actor, policies.manageForms, tpl)) throw new ORPCError("FORBIDDEN");
		const { id, ...patch } = input;
		const [row] = await context.db
			.update(formTemplate)
			.set({ ...patch, updatedAt: new Date() })
			.where(eq(formTemplate.id, id))
			.returning();
		if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");
		publishTo(
			{ type: "coachplan.template.changed", payload: { id: row.id } },
			[context.actor.userId],
		);
		return templateDto(row);
	});

/**
 * Copy a template into the actor's school (#8 → #9). Clones the template row
 * (scope=school, parentTemplateId=source) and all its questions.
 */
const templatesCopyToSchool = protectedProcedure
	.use(withPolicy(policies.manageForms, (c) => ({ organizationId: c.actor.organizationId })))
	.route({ method: "POST", path: "/coachplan/templates/{id}/copy", tags: ["coachplan"] })
	.input(z.object({ id: z.string().uuid(), name: z.string().min(1).optional() }))
	.output(TemplateSchema)
	.handler(async ({ input, context }) => {
		const { actor } = context;
		const organizationId = actor.organizationId;
		if (!organizationId) throw new ORPCError("BAD_REQUEST", { message: "No tenant" });

		const [src] = await context.db
			.select()
			.from(formTemplate)
			.where(eq(formTemplate.id, input.id));
		if (!src) throw new ORPCError("NOT_FOUND");
		// May copy an Ondivera template or one already in the tenant.
		if (src.scope === "school" && !sameTenant(actor, src)) {
			throw new ORPCError("FORBIDDEN");
		}

		const [copy] = await context.db
			.insert(formTemplate)
			.values({
				name: input.name ?? `${src.name} (kopie)`,
				description: src.description,
				scope: "school",
				organizationId,
				parentTemplateId: src.id,
				createdById: actor.userId,
			})
			.returning();
		if (!copy) throw new ORPCError("INTERNAL_SERVER_ERROR");

		const srcQuestions = await context.db
			.select()
			.from(formQuestion)
			.where(eq(formQuestion.templateId, src.id))
			.orderBy(asc(formQuestion.position));
		if (srcQuestions.length) {
			await context.db.insert(formQuestion).values(
				srcQuestions.map((q) => ({
					templateId: copy.id,
					section: q.section,
					type: q.type,
					label: q.label,
					helpText: q.helpText,
					required: q.required,
					position: q.position,
					options: q.options,
				})),
			);
		}
		publishTo(
			{ type: "coachplan.template.changed", payload: { id: copy.id } },
			[context.actor.userId],
		);
		return templateDto(copy);
	});

// ---------------------------------------------------------------------------
// Questions CRUD (#8/#9 — formulierenmanager)
// ---------------------------------------------------------------------------

/** Assert the actor may manage the template that owns/will-own a question. */
async function assertCanManageTemplate(
	context: AuthedContext,
	templateId: string,
) {
	const [tpl] = await context.db
		.select()
		.from(formTemplate)
		.where(eq(formTemplate.id, templateId));
	if (!tpl) throw new ORPCError("NOT_FOUND");
	if (!can(context.actor, policies.manageForms, tpl)) {
		throw new ORPCError("FORBIDDEN");
	}
	return tpl;
}

const questionsCreate = protectedProcedure
	.use(withPolicy(policies.manageForms, (c) => ({ organizationId: c.actor.organizationId })))
	.route({ method: "POST", path: "/coachplan/questions", tags: ["coachplan"] })
	.input(
		z.object({
			templateId: z.string().uuid(),
			section: FormSection.default("leerling"),
			type: QuestionType.default("short_text"),
			label: z.string().min(1),
			helpText: z.string().nullable().optional(),
			required: z.boolean().default(false),
			position: z.number().int().optional(),
			// #18 — optional correspondence to a coach (POPP) question.
			mapsToQuestionId: z.string().uuid().nullable().optional(),
			options: QuestionOptions.optional(),
		}),
	)
	.output(QuestionSchema)
	.handler(async ({ input, context }) => {
		await assertCanManageTemplate(context, input.templateId);
		// Append at end if no position given.
		let position = input.position;
		if (position === undefined) {
			const existing = await context.db
				.select({ position: formQuestion.position })
				.from(formQuestion)
				.where(eq(formQuestion.templateId, input.templateId));
			position = existing.reduce((m, q) => Math.max(m, q.position + 1), 0);
		}
		const [row] = await context.db
			.insert(formQuestion)
			.values({
				templateId: input.templateId,
				section: input.section,
				type: input.type,
				label: input.label,
				helpText: input.helpText ?? null,
				required: input.required,
				position,
				mapsToQuestionId: input.mapsToQuestionId ?? null,
				options: (input.options ?? null) as never,
			})
			.returning();
		if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");
		publishTo(
			{ type: "coachplan.template.changed", payload: { id: input.templateId } },
			[context.actor.userId],
		);
		return questionDto(row);
	});

const questionsUpdate = protectedProcedure
	.use(withPolicy(policies.manageForms, (c) => ({ organizationId: c.actor.organizationId })))
	.route({ method: "PUT", path: "/coachplan/questions/{id}", tags: ["coachplan"] })
	.input(
		z.object({
			id: z.string().uuid(),
			section: FormSection.optional(),
			type: QuestionType.optional(),
			label: z.string().min(1).optional(),
			helpText: z.string().nullable().optional(),
			required: z.boolean().optional(),
			position: z.number().int().optional(),
			// #18 — optional correspondence to a coach (POPP) question.
			mapsToQuestionId: z.string().uuid().nullable().optional(),
			options: QuestionOptions.optional(),
		}),
	)
	.output(QuestionSchema)
	.handler(async ({ input, context }) => {
		const [q] = await context.db
			.select()
			.from(formQuestion)
			.where(eq(formQuestion.id, input.id));
		if (!q) throw new ORPCError("NOT_FOUND");
		await assertCanManageTemplate(context, q.templateId);
		const { id, options, ...patch } = input;
		const [row] = await context.db
			.update(formQuestion)
			.set({
				...patch,
				...(options !== undefined ? { options: options as never } : {}),
				updatedAt: new Date(),
			})
			.where(eq(formQuestion.id, id))
			.returning();
		if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");
		publishTo(
			{ type: "coachplan.template.changed", payload: { id: q.templateId } },
			[context.actor.userId],
		);
		return questionDto(row);
	});

const questionsRemove = protectedProcedure
	.use(withPolicy(policies.manageForms, (c) => ({ organizationId: c.actor.organizationId })))
	.route({ method: "DELETE", path: "/coachplan/questions/{id}", tags: ["coachplan"] })
	.input(z.object({ id: z.string().uuid() }))
	.output(z.object({ id: z.string() }))
	.handler(async ({ input, context }) => {
		const [q] = await context.db
			.select()
			.from(formQuestion)
			.where(eq(formQuestion.id, input.id));
		if (!q) throw new ORPCError("NOT_FOUND");
		await assertCanManageTemplate(context, q.templateId);
		await context.db.delete(formQuestion).where(eq(formQuestion.id, input.id));
		publishTo(
			{ type: "coachplan.template.changed", payload: { id: q.templateId } },
			[context.actor.userId],
		);
		return { id: input.id };
	});

// ---------------------------------------------------------------------------
// #10 — School default + per-leerling assignment
// ---------------------------------------------------------------------------

/** Set (or clear) the school default template (#10). One default per tenant. */
const setSchoolDefault = protectedProcedure
	.use(withPolicy(policies.manageForms, (c) => ({ organizationId: c.actor.organizationId })))
	.route({ method: "POST", path: "/coachplan/school-default", tags: ["coachplan"] })
	.input(z.object({ templateId: z.string().uuid() }))
	.output(z.object({ templateId: z.string() }))
	.handler(async ({ input, context }) => {
		const { actor } = context;
		const [tpl] = await context.db
			.select()
			.from(formTemplate)
			.where(eq(formTemplate.id, input.templateId));
		if (!tpl) throw new ORPCError("NOT_FOUND");
		if (!can(actor, policies.manageForms, tpl) || tpl.scope !== "school") {
			throw new ORPCError("FORBIDDEN");
		}
		// Clear any other default in the tenant, then set this one.
		await context.db
			.update(formTemplate)
			.set({ isSchoolDefault: false })
			.where(eq(formTemplate.organizationId, tpl.organizationId ?? ""));
		await context.db
			.update(formTemplate)
			.set({ isSchoolDefault: true, updatedAt: new Date() })
			.where(eq(formTemplate.id, input.templateId));
		publishTo(
			{ type: "coachplan.template.changed", payload: { id: input.templateId } },
			[context.actor.userId],
		);
		return { templateId: input.templateId };
	});

/** Assign a specific template to a leerling, overriding the school default (#10). */
const assignToLeerling = protectedProcedure
	.use(withPolicy(policies.manageForms, (c) => ({ organizationId: c.actor.organizationId })))
	.route({ method: "POST", path: "/coachplan/assignments", tags: ["coachplan"] })
	.input(z.object({ leerlingId: z.string(), templateId: z.string().uuid() }))
	.output(z.object({ id: z.string() }))
	.handler(async ({ input, context }) => {
		const { actor } = context;
		const organizationId = actor.organizationId;
		if (!organizationId) throw new ORPCError("BAD_REQUEST", { message: "No tenant" });
		// Leerling must be in the tenant.
		const [ll] = await context.db
			.select({ id: user.id, organizationId: user.organizationId })
			.from(user)
			.where(eq(user.id, input.leerlingId));
		if (!ll || !sameTenant(actor, ll)) throw new ORPCError("FORBIDDEN");
		// Template must be in the tenant.
		const [tpl] = await context.db
			.select()
			.from(formTemplate)
			.where(eq(formTemplate.id, input.templateId));
		if (!tpl || tpl.scope !== "school" || !sameTenant(actor, tpl)) {
			throw new ORPCError("FORBIDDEN");
		}
		// Upsert (one assignment per leerling).
		const [existing] = await context.db
			.select({ id: formAssignment.id })
			.from(formAssignment)
			.where(
				and(
					eq(formAssignment.organizationId, organizationId),
					eq(formAssignment.leerlingId, input.leerlingId),
				),
			);
		if (existing) {
			await context.db
				.update(formAssignment)
				.set({ templateId: input.templateId, updatedAt: new Date() })
				.where(eq(formAssignment.id, existing.id));
			return { id: existing.id };
		}
		const [row] = await context.db
			.insert(formAssignment)
			.values({ organizationId, leerlingId: input.leerlingId, templateId: input.templateId })
			.returning({ id: formAssignment.id });
		if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");
		return { id: row.id };
	});

// ---------------------------------------------------------------------------
// #11 — Leerling: start/fill a submission with autosave
// ---------------------------------------------------------------------------

/** Resolve which template applies to a leerling: assignment > school default. */
async function resolveTemplateForLeerling(
	db: typeof import("@incluvo/drizzle").db,
	organizationId: string,
	leerlingId: string,
): Promise<string | null> {
	const [assignment] = await db
		.select({ templateId: formAssignment.templateId })
		.from(formAssignment)
		.where(
			and(
				eq(formAssignment.organizationId, organizationId),
				eq(formAssignment.leerlingId, leerlingId),
			),
		);
	if (assignment) return assignment.templateId;
	const [def] = await db
		.select({ id: formTemplate.id })
		.from(formTemplate)
		.where(
			and(
				eq(formTemplate.organizationId, organizationId),
				eq(formTemplate.isSchoolDefault, true),
			),
		);
	return def?.id ?? null;
}

/**
 * Start (or resume) the leerling's current draft submission (#11). Returns the
 * submission, its template (with questions) and any answers already autosaved.
 */
const startMine = protectedProcedure
	.route({ method: "POST", path: "/coachplan/start", tags: ["coachplan"] })
	.output(
		z.object({
			submission: SubmissionSchema,
			template: TemplateWithQuestionsSchema,
			answers: z.array(AnswerSchema),
		}),
	)
	.handler(async ({ context }) => {
		const { actor } = context;
		const organizationId = actor.organizationId;
		if (!organizationId) throw new ORPCError("BAD_REQUEST", { message: "No tenant" });

		// Resume an existing draft if present.
		let [submission] = await context.db
			.select()
			.from(formSubmission)
			.where(
				and(
					eq(formSubmission.leerlingId, actor.userId),
					eq(formSubmission.status, "draft"),
				),
			)
			.orderBy(desc(formSubmission.createdAt));

		if (!submission) {
			const templateId = await resolveTemplateForLeerling(
				context.db,
				organizationId,
				actor.userId,
			);
			if (!templateId) {
				throw new ORPCError("NOT_FOUND", {
					message: "Geen formulier gekoppeld aan deze leerling",
				});
			}
			[submission] = await context.db
				.insert(formSubmission)
				.values({
					templateId,
					organizationId,
					leerlingId: actor.userId,
					status: "draft",
				})
				.returning();
		}
		if (!submission) throw new ORPCError("INTERNAL_SERVER_ERROR");

		const [tpl] = await context.db
			.select()
			.from(formTemplate)
			.where(eq(formTemplate.id, submission.templateId));
		if (!tpl) throw new ORPCError("NOT_FOUND");
		const questions = await context.db
			.select()
			.from(formQuestion)
			.where(eq(formQuestion.templateId, tpl.id))
			.orderBy(asc(formQuestion.position));
		const answers = await context.db
			.select()
			.from(formAnswer)
			.where(eq(formAnswer.submissionId, submission.id));

		return {
			submission: submissionDto(submission),
			template: { ...templateDto(tpl), questions: questions.map(questionDto) },
			answers: answers.map(answerDto),
		};
	});

/** Load a submission row and assert the actor may fill it (own + tenant). */
async function loadFillable(context: AuthedContext, submissionId: string) {
	const [sub] = await context.db
		.select()
		.from(formSubmission)
		.where(eq(formSubmission.id, submissionId));
	if (!sub) throw new ORPCError("NOT_FOUND");
	if (!can(context.actor, policies.fillCoachplan, sub)) {
		throw new ORPCError("FORBIDDEN");
	}
	if (sub.status !== "draft") {
		throw new ORPCError("CONFLICT", { message: "Inzending is al verstuurd" });
	}
	return sub;
}

/**
 * Per-question autosave (#11) + flags (#12 discuss, #13 skip). Upserts one
 * `form_answer` per (submission, question). The wizard calls this on every
 * change so nothing is lost.
 */
const saveAnswer = protectedProcedure
	.route({ method: "POST", path: "/coachplan/answers", tags: ["coachplan"] })
	.input(
		z.object({
			submissionId: z.string().uuid(),
			questionId: z.string().uuid(),
			value: z.string().nullable().optional(),
			valueJson: z.unknown().optional(),
			discussWithCoach: z.boolean().optional(),
			deliberatelySkipped: z.boolean().optional(),
		}),
	)
	.output(AnswerSchema)
	.handler(async ({ input, context }) => {
		await loadFillable(context, input.submissionId);
		// Question must belong to the submission's template.
		const [q] = await context.db
			.select({ id: formQuestion.id })
			.from(formQuestion)
			.where(eq(formQuestion.id, input.questionId));
		if (!q) throw new ORPCError("NOT_FOUND");

		const [existing] = await context.db
			.select()
			.from(formAnswer)
			.where(
				and(
					eq(formAnswer.submissionId, input.submissionId),
					eq(formAnswer.questionId, input.questionId),
				),
			);

		const patch = {
			...(input.value !== undefined ? { value: input.value } : {}),
			...(input.valueJson !== undefined
				? { valueJson: input.valueJson as never }
				: {}),
			...(input.discussWithCoach !== undefined
				? { discussWithCoach: input.discussWithCoach }
				: {}),
			...(input.deliberatelySkipped !== undefined
				? { deliberatelySkipped: input.deliberatelySkipped }
				: {}),
		};

		let row: typeof formAnswer.$inferSelect | undefined;
		if (existing) {
			[row] = await context.db
				.update(formAnswer)
				.set({ ...patch, updatedAt: new Date() })
				.where(eq(formAnswer.id, existing.id))
				.returning();
		} else {
			[row] = await context.db
				.insert(formAnswer)
				.values({
					submissionId: input.submissionId,
					questionId: input.questionId,
					value: input.value ?? null,
					valueJson: (input.valueJson ?? null) as never,
					discussWithCoach: input.discussWithCoach ?? false,
					deliberatelySkipped: input.deliberatelySkipped ?? false,
				})
				.returning();
		}
		if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");
		// Touch the submission so coach lists re-sort.
		await context.db
			.update(formSubmission)
			.set({ updatedAt: new Date() })
			.where(eq(formSubmission.id, input.submissionId));
		return answerDto(row);
	});

/**
 * Submit the wizard (#11/#14): flips status to `submitted`, stamps
 * `submittedAt`, attaches the assigned coach, and notifies them (#15).
 */
/** Transaction handle type (same query-builder surface as `db`). */
type CoachplanTx = Parameters<
	Parameters<(typeof import("@incluvo/drizzle").db)["transaction"]>[0]
>[0];

/**
 * #18 — apply the template-level leerling→coach correspondences for a submission.
 *
 * For every leerling question that declares `mapsToQuestionId`, point the
 * leerling's answer at the corresponding coach (POPP) question via an
 * `answerCoachMapping` row, so the coach-gedeelte opens pre-filled. Idempotent
 * and non-destructive: it never overwrites an existing mapping (a coach edit),
 * and skips empty or deliberately-skipped answers.
 */
async function applyCorrespondenceMappings(
	tx: CoachplanTx,
	submission: typeof formSubmission.$inferSelect,
): Promise<void> {
	const corr = await tx
		.select({
			leerlingQuestionId: formQuestion.id,
			coachQuestionId: formQuestion.mapsToQuestionId,
		})
		.from(formQuestion)
		.where(
			and(
				eq(formQuestion.templateId, submission.templateId),
				eq(formQuestion.section, "leerling"),
				isNotNull(formQuestion.mapsToQuestionId),
			),
		);
	if (corr.length === 0) return;

	const leerlingQIds = corr.map((c) => c.leerlingQuestionId);
	const answers = await tx
		.select({
			id: formAnswer.id,
			questionId: formAnswer.questionId,
			value: formAnswer.value,
			skipped: formAnswer.deliberatelySkipped,
		})
		.from(formAnswer)
		.where(
			and(
				eq(formAnswer.submissionId, submission.id),
				inArray(formAnswer.questionId, leerlingQIds),
			),
		);
	const answerByQuestion = new Map(answers.map((a) => [a.questionId, a]));

	// Never overwrite a coach's existing mapping for a coach question.
	const existing = await tx
		.select({ coachQuestionId: answerCoachMapping.coachQuestionId })
		.from(answerCoachMapping)
		.where(eq(answerCoachMapping.submissionId, submission.id));
	const alreadyMapped = new Set(existing.map((m) => m.coachQuestionId));

	const toInsert: (typeof answerCoachMapping.$inferInsert)[] = [];
	for (const c of corr) {
		if (!c.coachQuestionId || alreadyMapped.has(c.coachQuestionId)) continue;
		const ans = answerByQuestion.get(c.leerlingQuestionId);
		if (!ans || ans.skipped || !ans.value || !ans.value.trim()) continue;
		toInsert.push({
			submissionId: submission.id,
			sourceAnswerId: ans.id,
			coachQuestionId: c.coachQuestionId,
		});
	}
	if (toInsert.length > 0) {
		await tx.insert(answerCoachMapping).values(toInsert);
	}
}

const submit = protectedProcedure
	.route({ method: "POST", path: "/coachplan/submit", tags: ["coachplan"] })
	.input(z.object({ submissionId: z.string().uuid() }))
	.output(SubmissionSchema)
	.handler(async ({ input, context }) => {
		const sub = await loadFillable(context, input.submissionId);
		const [row] = await context.db.transaction(async (tx) => {
			const [updated] = await tx
				.update(formSubmission)
				.set({ status: "submitted", submittedAt: new Date(), updatedAt: new Date() })
				.where(eq(formSubmission.id, sub.id))
				.returning();
			// #18 — auto-prefill the coach (POPP) fields from corresponding leerling
			// answers. For every leerling question that declares a `mapsToQuestionId`,
			// create an `answerCoachMapping` pointing the leerling's answer at the
			// coach question (idempotent; the coach can still override the value).
			await applyCorrespondenceMappings(tx, sub);
			return [updated];
		});
		if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");
		// Realtime to the leerling's coach(es) only (C1) — they're the audience
		// for a freshly submitted plan.
		publishTo(
			{
				type: "coachplan.submitted",
				payload: { id: row.id, leerlingId: row.leerlingId },
			},
			await coachIdsFor(context, row.leerlingId),
		);
		// Notify the leerling's coach(es) that a coachplan was submitted (#3/#15).
		// Best-effort: a notify failure must never break the submit mutation.
		try {
			const [leerling] = await context.db
				.select({ name: user.name })
				.from(user)
				.where(eq(user.id, row.leerlingId));
			const coaches = await context.db
				.select({ coachId: coachAssignment.coachId })
				.from(coachAssignment)
				.where(eq(coachAssignment.leerlingId, row.leerlingId));
			const coachIds = [...new Set(coaches.map((c) => c.coachId))];
			for (const coachId of coachIds) {
				await notify(context.db, {
					userId: coachId,
					organizationId: row.organizationId,
					type: "coachplan_submitted",
					title: "Nieuw coachplan ontvangen",
					body: `${leerling?.name ?? "Een leerling"} heeft een coachplan ingediend.`,
					entity: { type: "form_submission", id: row.id },
				});
			}
		} catch (err) {
			console.error("notify(coachplan_submitted) failed", err);
		}
		return submissionDto(row);
	});

// ---------------------------------------------------------------------------
// #14 — Leerling overview (read own submission with answers)
// ---------------------------------------------------------------------------

/** Build the answer-overview payload (questions + answers) for a submission. */
async function buildOverview(
	db: typeof import("@incluvo/drizzle").db,
	submission: typeof formSubmission.$inferSelect,
) {
	const [tpl] = await db
		.select()
		.from(formTemplate)
		.where(eq(formTemplate.id, submission.templateId));
	const questions = tpl
		? await db
				.select()
				.from(formQuestion)
				.where(eq(formQuestion.templateId, tpl.id))
				.orderBy(asc(formQuestion.position))
		: [];
	const answers = await db
		.select()
		.from(formAnswer)
		.where(eq(formAnswer.submissionId, submission.id));
	const prefs = await db
		.select({ label: learningPreferenceLabel.label })
		.from(learningPreferenceLabel)
		.where(eq(learningPreferenceLabel.submissionId, submission.id));
	return {
		submission: submissionDto(submission),
		template: tpl ? templateDto(tpl) : null,
		questions: questions.map(questionDto),
		answers: answers.map(answerDto),
		learningPreferences: prefs.map((p) => p.label),
	};
}

const OverviewSchema = z.object({
	submission: SubmissionSchema,
	template: TemplateSchema.nullable(),
	questions: z.array(QuestionSchema),
	answers: z.array(AnswerSchema),
	learningPreferences: z.array(z.string()),
});

/** Read one submission with everything to render it (#14 leerling, #15 coach). */
const getSubmission = protectedProcedure
	.route({ method: "GET", path: "/coachplan/submissions/{id}", tags: ["coachplan"] })
	.input(z.object({ id: z.string().uuid() }))
	.output(OverviewSchema)
	.handler(async ({ input, context }) => {
		const { actor } = context;
		// Bound headless-Chromium load: a fresh browser launches per PDF (H3).
		if (!rateLimit(`pdf:${actor.userId}`, { max: 10, windowMs: 60_000 })) {
			throw new ORPCError("TOO_MANY_REQUESTS", {
				message: "Te veel PDF-aanvragen. Wacht even en probeer opnieuw.",
			});
		}
		const [sub] = await context.db
			.select()
			.from(formSubmission)
			.where(eq(formSubmission.id, input.id));
		if (!sub) throw new ORPCError("NOT_FOUND");
		if (!can(actor, policies.readCoachplan, sub)) throw new ORPCError("FORBIDDEN");
		return buildOverview(context.db, sub);
	});

/** List the leerling's own submissions (latest first). */
const listMine = protectedProcedure
	.route({ method: "GET", path: "/coachplan/mine", tags: ["coachplan"] })
	.output(z.array(SubmissionSchema))
	.handler(async ({ context }) => {
		const rows = await context.db
			.select()
			.from(formSubmission)
			.where(eq(formSubmission.leerlingId, context.actor.userId))
			.orderBy(desc(formSubmission.createdAt));
		return rows.map(submissionDto);
	});

// ---------------------------------------------------------------------------
// #15 — Coach: inbox of submitted plans
// ---------------------------------------------------------------------------

const InboxRowSchema = z.object({
	submission: SubmissionSchema,
	leerlingName: z.string(),
	templateName: z.string(),
	discussCount: z.number().int(),
});

/** Submissions in the coach's tenant that need review or are in review (#15). */
const inbox = protectedProcedure
	.use(withPolicy(policies.reviewCoachplan, (c) => ({ organizationId: c.actor.organizationId })))
	.route({ method: "GET", path: "/coachplan/inbox", tags: ["coachplan"] })
	.output(z.array(InboxRowSchema))
	.handler(async ({ context }) => {
		const { actor } = context;
		const organizationId = actor.organizationId;
		if (!organizationId && !isSuperadmin(actor.role)) return [];
		const rows = await context.db
			.select({
				submission: formSubmission,
				leerlingName: user.name,
				templateName: formTemplate.name,
			})
			.from(formSubmission)
			.innerJoin(user, eq(user.id, formSubmission.leerlingId))
			.innerJoin(formTemplate, eq(formTemplate.id, formSubmission.templateId))
			.where(
				isSuperadmin(actor.role)
					? inArray(formSubmission.status, [
							"submitted",
							"coach_review",
							"shared_with_leerling",
							"completed",
						])
					: and(
							eq(formSubmission.organizationId, organizationId ?? ""),
							inArray(formSubmission.status, [
								"submitted",
								"coach_review",
								"shared_with_leerling",
								"completed",
							]),
						),
			)
			.orderBy(desc(formSubmission.submittedAt));

		// Count discuss-flagged answers per submission.
		const ids = rows.map((r) => r.submission.id);
		const flags = ids.length
			? await context.db
					.select({ submissionId: formAnswer.submissionId })
					.from(formAnswer)
					.where(
						and(
							inArray(formAnswer.submissionId, ids),
							eq(formAnswer.discussWithCoach, true),
						),
					)
			: [];
		const counts = new Map<string, number>();
		for (const f of flags) {
			counts.set(f.submissionId, (counts.get(f.submissionId) ?? 0) + 1);
		}
		return rows
			.filter((r) => sameTenant(actor, r.submission))
			.map((r) => ({
				submission: submissionDto(r.submission),
				leerlingName: r.leerlingName,
				templateName: r.templateName,
				discussCount: counts.get(r.submission.id) ?? 0,
			}));
	});

// ---------------------------------------------------------------------------
// #16 — Answer → coach-question mapping (with editable overrides)
// ---------------------------------------------------------------------------

const MappingSchema = z.object({
	id: z.string(),
	submissionId: z.string(),
	sourceAnswerId: z.string().nullable(),
	coachQuestionId: z.string(),
	overrideValue: z.string().nullable(),
});

/** Load a submission + assert the coach may review it (tenant + role). */
async function loadReviewable(context: AuthedContext, submissionId: string) {
	const [sub] = await context.db
		.select()
		.from(formSubmission)
		.where(eq(formSubmission.id, submissionId));
	if (!sub) throw new ORPCError("NOT_FOUND");
	if (!can(context.actor, policies.reviewCoachplan, sub)) {
		throw new ORPCError("FORBIDDEN");
	}
	return sub;
}

/** List mappings for a submission (#16). */
const listMappings = protectedProcedure
	.route({ method: "GET", path: "/coachplan/submissions/{id}/mappings", tags: ["coachplan"] })
	.input(z.object({ id: z.string().uuid() }))
	.output(z.array(MappingSchema))
	.handler(async ({ input, context }) => {
		await loadReviewable(context, input.id);
		const rows = await context.db
			.select()
			.from(answerCoachMapping)
			.where(eq(answerCoachMapping.submissionId, input.id));
		return rows.map((m) => ({
			id: m.id,
			submissionId: m.submissionId,
			sourceAnswerId: m.sourceAnswerId,
			coachQuestionId: m.coachQuestionId,
			overrideValue: m.overrideValue,
		}));
	});

/**
 * Upsert a mapping of a leerling answer onto a coach question, capturing the
 * coach's editable override (#16). Passing a null sourceAnswerId / overrideValue
 * lets the coach author the mapped value from scratch.
 */
const upsertMapping = protectedProcedure
	.route({ method: "POST", path: "/coachplan/mappings", tags: ["coachplan"] })
	.input(
		z.object({
			submissionId: z.string().uuid(),
			coachQuestionId: z.string().uuid(),
			sourceAnswerId: z.string().uuid().nullable().optional(),
			overrideValue: z.string().nullable().optional(),
		}),
	)
	.output(MappingSchema)
	.handler(async ({ input, context }) => {
		const sub = await loadReviewable(context, input.submissionId);
		// Atomic: the review-state flip + the mapping upsert must commit together (H2).
		const row = await context.db.transaction(async (tx) => {
			// Flip into review state on first coach edit.
			if (sub.status === "submitted") {
				await tx
					.update(formSubmission)
					.set({
						status: "coach_review",
						coachId: sub.coachId ?? context.actor.userId,
						updatedAt: new Date(),
					})
					.where(eq(formSubmission.id, sub.id));
			}
			const [existing] = await tx
				.select()
				.from(answerCoachMapping)
				.where(
					and(
						eq(answerCoachMapping.submissionId, input.submissionId),
						eq(answerCoachMapping.coachQuestionId, input.coachQuestionId),
					),
				);
			if (existing) {
				const [updated] = await tx
					.update(answerCoachMapping)
					.set({
						...(input.sourceAnswerId !== undefined
							? { sourceAnswerId: input.sourceAnswerId }
							: {}),
						...(input.overrideValue !== undefined
							? { overrideValue: input.overrideValue }
							: {}),
						updatedAt: new Date(),
					})
					.where(eq(answerCoachMapping.id, existing.id))
					.returning();
				return updated;
			}
			const [inserted] = await tx
				.insert(answerCoachMapping)
				.values({
					submissionId: input.submissionId,
					coachQuestionId: input.coachQuestionId,
					sourceAnswerId: input.sourceAnswerId ?? null,
					overrideValue: input.overrideValue ?? null,
				})
				.returning();
			return inserted;
		});
		if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");
		return {
			id: row.id,
			submissionId: row.submissionId,
			sourceAnswerId: row.sourceAnswerId,
			coachQuestionId: row.coachQuestionId,
			overrideValue: row.overrideValue,
		};
	});

// ---------------------------------------------------------------------------
// #17 — Coach vragenlijst (fill coach-section answers, then offer to leerling)
// ---------------------------------------------------------------------------

/**
 * Coach fills/updates an answer in the coach-gedeelte (#17). Stored as a
 * `form_answer` keyed by the coach question; the leerling-fill autosave path is
 * separate (it asserts ownership), so we keep a dedicated coach writer here.
 */
const saveCoachAnswer = protectedProcedure
	.route({ method: "POST", path: "/coachplan/coach-answers", tags: ["coachplan"] })
	.input(
		z.object({
			submissionId: z.string().uuid(),
			questionId: z.string().uuid(),
			value: z.string().nullable().optional(),
			valueJson: z.unknown().optional(),
		}),
	)
	.output(AnswerSchema)
	.handler(async ({ input, context }) => {
		const sub = await loadReviewable(context, input.submissionId);
		// Must be a coach-section question.
		const [q] = await context.db
			.select({ section: formQuestion.section })
			.from(formQuestion)
			.where(eq(formQuestion.id, input.questionId));
		if (!q) throw new ORPCError("NOT_FOUND");
		if (q.section !== "coach") {
			throw new ORPCError("BAD_REQUEST", { message: "Geen coachvraag" });
		}
		// Atomic: the review-state flip + the coach-answer upsert commit together (H2).
		const row = await context.db.transaction(async (tx) => {
			if (sub.status === "submitted") {
				await tx
					.update(formSubmission)
					.set({
						status: "coach_review",
						coachId: sub.coachId ?? context.actor.userId,
						updatedAt: new Date(),
					})
					.where(eq(formSubmission.id, sub.id));
			}
			const [existing] = await tx
				.select()
				.from(formAnswer)
				.where(
					and(
						eq(formAnswer.submissionId, input.submissionId),
						eq(formAnswer.questionId, input.questionId),
					),
				);
			if (existing) {
				const [updated] = await tx
					.update(formAnswer)
					.set({
						...(input.value !== undefined ? { value: input.value } : {}),
						...(input.valueJson !== undefined
							? { valueJson: input.valueJson as never }
							: {}),
						updatedAt: new Date(),
					})
					.where(eq(formAnswer.id, existing.id))
					.returning();
				return updated;
			}
			const [inserted] = await tx
				.insert(formAnswer)
				.values({
					submissionId: input.submissionId,
					questionId: input.questionId,
					value: input.value ?? null,
					valueJson: (input.valueJson ?? null) as never,
				})
				.returning();
			return inserted;
		});
		if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");
		return answerDto(row);
	});

/** Offer the completed plan back to the leerling (#17). */
const shareWithLeerling = protectedProcedure
	.route({ method: "POST", path: "/coachplan/share", tags: ["coachplan"] })
	.input(z.object({ submissionId: z.string().uuid() }))
	.output(SubmissionSchema)
	.handler(async ({ input, context }) => {
		const sub = await loadReviewable(context, input.submissionId);
		const [row] = await context.db.transaction(async (tx) =>
			tx
				.update(formSubmission)
				.set({ status: "shared_with_leerling", updatedAt: new Date() })
				.where(eq(formSubmission.id, sub.id))
				.returning(),
		);
		if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");
		// Realtime to the leerling (+ the acting coach) only (C1).
		publishTo(
			{
				type: "coachplan.shared",
				payload: { id: row.id, leerlingId: row.leerlingId },
			},
			[row.leerlingId, context.actor.userId],
		);
		// Notify the leerling that their coach shared the plan back (#3/#17).
		// Best-effort: a notify failure must never break the share mutation.
		try {
			await notify(context.db, {
				userId: row.leerlingId,
				organizationId: row.organizationId,
				type: "coachplan_shared",
				title: "Je coachplan is gedeeld",
				body: "Je coach heeft je coachplan met je gedeeld.",
				entity: { type: "form_submission", id: row.id },
			});
		} catch (err) {
			console.error("notify(coachplan_shared) failed", err);
		}
		return submissionDto(row);
	});

// ---------------------------------------------------------------------------
// #19 — Leervoorkeur / standaardlabels
// ---------------------------------------------------------------------------

/** Default standaardlabels the coach UI offers (#19). */
const defaultLabels = protectedProcedure
	.route({ method: "GET", path: "/coachplan/default-labels", tags: ["coachplan"] })
	.output(z.array(z.object({ value: z.string(), label: z.string() })))
	.handler(async () => DEFAULT_LEERVOORKEUR_LABELS);

/** Replace the leervoorkeur label set for a submission (#19). Coach-driven. */
const setLearningPreferences = protectedProcedure
	.route({ method: "POST", path: "/coachplan/learning-preferences", tags: ["coachplan"] })
	.input(z.object({ submissionId: z.string().uuid(), labels: z.array(z.string()) }))
	.output(z.array(z.string()))
	.handler(async ({ input, context }) => {
		const sub = await loadReviewable(context, input.submissionId);
		const unique = [...new Set(input.labels.filter((l) => l.trim()))];
		// Atomic delete-all-then-insert so a failed insert never wipes the
		// leerling's existing leervoorkeuren (H2 - highest data-loss risk).
		await context.db.transaction(async (tx) => {
			await tx
				.delete(learningPreferenceLabel)
				.where(eq(learningPreferenceLabel.submissionId, sub.id));
			if (unique.length) {
				await tx.insert(learningPreferenceLabel).values(
					unique.map((label) => ({ submissionId: sub.id, label })),
				);
			}
		});
		// Realtime to the leerling (+ acting coach) only (C1); leervoorkeuren
		// drive the leerling's course recommendations.
		publishTo(
			{ type: "coachplan.preferences", payload: { id: sub.id } },
			[sub.leerlingId, context.actor.userId],
		);
		return unique;
	});

// ---------------------------------------------------------------------------
// #21 — "Afgestemd met ouders" toggle
// ---------------------------------------------------------------------------

const setApprovedWithParents = protectedProcedure
	.route({ method: "POST", path: "/coachplan/approved-with-parents", tags: ["coachplan"] })
	.input(z.object({ submissionId: z.string().uuid(), approved: z.boolean() }))
	.output(SubmissionSchema)
	.handler(async ({ input, context }) => {
		const sub = await loadReviewable(context, input.submissionId);
		const [row] = await context.db
			.update(formSubmission)
			.set({ approvedWithParents: input.approved, updatedAt: new Date() })
			.where(eq(formSubmission.id, sub.id))
			.returning();
		if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");
		return submissionDto(row);
	});

// ---------------------------------------------------------------------------
// #20 — PDF of a submission (Playwright HTML → PDF)
// ---------------------------------------------------------------------------

/** Humanise an answer value for the PDF, resolving choice labels. */
function renderAnswer(
	answer: typeof formAnswer.$inferSelect | undefined,
	question: typeof formQuestion.$inferSelect,
): string | null {
	if (!answer) return null;
	if (answer.deliberatelySkipped) return null;
	const opts = (question.options ?? null) as {
		choices?: { value: string; label: string }[];
	} | null;
	const choiceLabel = (v: string) =>
		opts?.choices?.find((c) => c.value === v)?.label ?? v;
	const json = answer.valueJson as unknown;
	if (Array.isArray(json)) {
		return json.map((v) => choiceLabel(String(v))).join(", ");
	}
	if (answer.value) {
		if (
			question.type === "single_choice" ||
			question.type === "leervoorkeur"
		) {
			return choiceLabel(answer.value);
		}
		return answer.value;
	}
	return null;
}

const generatePdf = protectedProcedure
	.route({ method: "POST", path: "/coachplan/submissions/{id}/pdf", tags: ["coachplan"] })
	.input(z.object({ id: z.string().uuid() }))
	.output(
		z.object({
			filename: z.string(),
			contentType: z.string(),
			base64: z.string(),
			bytes: z.number().int(),
		}),
	)
	.handler(async ({ input, context }) => {
		const { actor } = context;
		const [sub] = await context.db
			.select()
			.from(formSubmission)
			.where(eq(formSubmission.id, input.id));
		if (!sub) throw new ORPCError("NOT_FOUND");
		if (!can(actor, policies.readCoachplan, sub)) throw new ORPCError("FORBIDDEN");

		const [tpl] = await context.db
			.select()
			.from(formTemplate)
			.where(eq(formTemplate.id, sub.templateId));
		const questions = tpl
			? await context.db
					.select()
					.from(formQuestion)
					.where(eq(formQuestion.templateId, tpl.id))
					.orderBy(asc(formQuestion.position))
			: [];
		const answers = await context.db
			.select()
			.from(formAnswer)
			.where(eq(formAnswer.submissionId, sub.id));
		const answerByQ = new Map(answers.map((a) => [a.questionId, a]));
		const prefs = await context.db
			.select({ label: learningPreferenceLabel.label })
			.from(learningPreferenceLabel)
			.where(eq(learningPreferenceLabel.submissionId, sub.id));

		const [leerling] = await context.db
			.select({ name: user.name })
			.from(user)
			.where(eq(user.id, sub.leerlingId));
		const coach = sub.coachId
			? (
					await context.db
						.select({ name: user.name })
						.from(user)
						.where(eq(user.id, sub.coachId))
				)[0]
			: undefined;
		const [org] = await context.db
			.select({ name: organization.name })
			.from(organization)
			.where(eq(organization.id, sub.organizationId));

		const prefValues = new Set(prefs.map((p) => p.label));
		const prefLabels = prefValues.size
			? [...prefValues].map(
					(v) =>
						DEFAULT_LEERVOORKEUR_LABELS.find((d) => d.value === v)?.label ?? v,
				)
			: [];

		const pdfQuestions: PdfQuestion[] = questions.map((q) => {
			const a = answerByQ.get(q.id);
			const theme = (q.options as { theme?: string } | null)?.theme;
			return {
				label: q.label,
				helpText: q.helpText,
				theme: q.section === "coach" ? `Coach · ${theme ?? "Vragenlijst"}` : theme,
				section: q.section,
				answer: renderAnswer(a, q),
				discussWithCoach: a?.discussWithCoach ?? false,
				deliberatelySkipped: a?.deliberatelySkipped ?? false,
			};
		});

		const plan: PdfPlan = {
			templateName: tpl?.name ?? "Coachplan",
			leerlingName: leerling?.name ?? "Leerling",
			coachName: coach?.name ?? null,
			organizationName: org?.name ?? null,
			approvedWithParents: sub.approvedWithParents,
			learningPreferences: prefLabels,
			generatedAt: new Date(),
			questions: pdfQuestions,
		};

		const bytes = await renderPlanPdf(plan);
		return {
			filename: `coachplan-${(leerling?.name ?? "leerling").replace(/\s+/g, "-").toLowerCase()}.pdf`,
			contentType: "application/pdf",
			base64: Buffer.from(bytes).toString("base64"),
			bytes: bytes.byteLength,
		};
	});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const templatesRouter = base.router({
	list: templatesList,
	get: templatesGet,
	create: templatesCreate,
	update: templatesUpdate,
	copyToSchool: templatesCopyToSchool,
	setSchoolDefault,
	assignToLeerling,
});

const questionsRouter = base.router({
	create: questionsCreate,
	update: questionsUpdate,
	remove: questionsRemove,
});

export const coachplanRouter = base.router({
	templates: templatesRouter,
	questions: questionsRouter,
	// Leerling fill flow (#11–#14)
	startMine,
	saveAnswer,
	submit,
	listMine,
	getSubmission,
	// Coach review flow (#15–#21)
	inbox,
	listMappings,
	upsertMapping,
	saveCoachAnswer,
	shareWithLeerling,
	defaultLabels,
	setLearningPreferences,
	setApprovedWithParents,
	generatePdf,
});
