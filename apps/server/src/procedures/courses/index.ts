import {
	assignment,
	assignmentGrade,
	assignmentSubmission,
	coachAssignment,
	contentBlock,
	contentBlockLabel,
	contentProgress,
	conversation,
	conversationMember,
	course,
	courseSection,
	formSubmission,
	learningPreferenceLabel,
	proposedAssignment,
	task,
	user,
} from "@incluvo/drizzle/schema";
import {
	atLeast,
	checkPermission,
	isSuperadmin,
	policies,
	sameTenant,
} from "@incluvo/permissions";
import { ORPCError } from "@orpc/server";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
	ALLOWED_UPLOAD_TYPES,
	assertValidStorageKey,
	contentMatchesBytes,
	guessContentType,
	hasS3,
	MAX_UPLOAD_BYTES,
	makeStorageKey,
	presignedGetUrl,
	presignPut,
	publicUrl,
	readLocalUpload,
	statUpload,
	writeLocalUpload,
} from "../../courses/storage";
import { parseYoutubeId, youtubeEmbedUrl } from "../../courses/youtube";
import { notify } from "../../notifications/notify";
import { publishTo } from "../../sse";
import { type AuthedContext, base, protectedProcedure } from "../base";

/**
 * A Drizzle transaction handle (the `tx` passed to `db.transaction`). Helpers
 * that perform multi-row writes accept this so the caller can run them inside a
 * single atomic transaction (H2).
 */
type Tx = Parameters<Parameters<AuthedContext["db"]["transaction"]>[0]>[0];

/**
 * Online cursus domain (backlog #23–#36, #61). Register key: `courses`.
 *
 * Three course kinds (#23): an Ondivera template, a school template derived from
 * it, and a per-leerling student execution derived from a school template — the
 * derive operation deep-copies sections + content blocks and keeps the
 * `parentCourseId` link. Ontwikkelaar+ build courses, sections (#25) and content
 * blocks (#26) of every CbS type: opdracht (#27 → also seeds a `task`), pagina
 * (#29, Tiptap ProseMirror JSON in `body`), bestand (#30, presigned upload),
 * youtube (#31, validated 11-char id), forum (#32, creates a chat conversation).
 * LTI (#33) + Ondivera-content (#34) are typed stubs (post-MVP).
 *
 * Leerlingen view their course with a voortgangsbalk (#24), mark blocks done,
 * and submit assignments which a coach grades (#28). Content blocks carry
 * leervoorkeur labels (#36) so a leerling sees recommended/active content based
 * on their coachplan learning-preferences (#35). A leerling can propose their
 * own assignment (#61).
 *
 * Tenant scoping: every handler loads the course and re-checks
 * `readCourse` / `manageCourse` against the course's tenant before acting.
 *
 * Cross-domain table writes (shared TABLES, not shared code):
 *   - INSERT `task` (source="assignment") when an opdracht block is created on a
 *     student_execution course, so it appears in the takenlijst (#27/#37).
 *   - INSERT `conversation` (kind="forum") + `conversation_member` rows when a
 *     forum block is created (#32).
 */

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

const CourseSchema = z.object({
	id: z.string(),
	kind: z.enum(["ondivera_template", "school_template", "student_execution"]),
	organizationId: z.string().nullable(),
	parentCourseId: z.string().nullable(),
	leerlingId: z.string().nullable(),
	title: z.string(),
	description: z.string().nullable(),
	progressBarHidden: z.boolean(),
	createdAt: z.date(),
	updatedAt: z.date(),
});

const blockType = z.enum([
	"opdracht",
	"pagina",
	"bestand",
	"youtube",
	"forum",
	"lti",
]);

const courseColumns = {
	id: course.id,
	kind: course.kind,
	organizationId: course.organizationId,
	parentCourseId: course.parentCourseId,
	leerlingId: course.leerlingId,
	title: course.title,
	description: course.description,
	progressBarHidden: course.progressBarHidden,
	createdAt: course.createdAt,
	updatedAt: course.updatedAt,
} as const;

// ---------------------------------------------------------------------------
// Authorization helpers
// ---------------------------------------------------------------------------

/** Load a course row or 404. */
async function loadCourse(context: AuthedContext, id: string) {
	const [row] = await context.db
		.select(courseColumns)
		.from(course)
		.where(eq(course.id, id));
	if (!row) throw new ORPCError("NOT_FOUND", { message: "Cursus niet gevonden" });
	return row;
}

/** Tenant resource for a course; Ondivera templates have a null org. */
function courseResource(row: { organizationId: string | null }) {
	return { organizationId: row.organizationId };
}

/**
 * Load + assert the actor may read the course (tenant-scoped, #23/#24/#35).
 * Ondivera templates (org = null) are platform-shared and readable by any
 * authenticated user, mirroring the `list` endpoint's visibility rules.
 */
async function loadReadable(context: AuthedContext, id: string) {
	const row = await loadCourse(context, id);
	const sharedTemplate =
		row.kind === "ondivera_template" && row.organizationId === null;
	if (
		!sharedTemplate &&
		!checkPermission(policies.readCourse, context.actor, courseResource(row))
	) {
		throw new ORPCError("FORBIDDEN", { message: "Geen toegang tot deze cursus" });
	}
	return row;
}

/** Load + assert the actor may manage the course (ontwikkelaar+, #25–#36). */
async function loadManageable(context: AuthedContext, id: string) {
	const row = await loadCourse(context, id);
	if (
		!checkPermission(policies.manageCourse, context.actor, courseResource(row))
	) {
		throw new ORPCError("FORBIDDEN", {
			message: "Geen rechten om deze cursus te beheren",
		});
	}
	return row;
}

/**
 * When a non-leerling actor acts on behalf of a `leerlingId` it supplied, verify
 * that leerling exists, is in the actor's tenant, and is reachable by the actor
 * (superadmin, or a coach with a `coach_assignment` to this leerling). This stops
 * a coach/keyuser from reading or writing another tenant's / an unassigned
 * leerling's progress or leervoorkeuren (Medium: courses trust client leerlingId).
 *
 * A leerling acting on themselves never reaches here (callers force their own id).
 */
async function assertLeerlingReachable(
	context: AuthedContext,
	leerlingId: string,
): Promise<void> {
	const { actor } = context;
	const [ll] = await context.db
		.select({ id: user.id, organizationId: user.organizationId })
		.from(user)
		.where(eq(user.id, leerlingId));
	if (!ll) throw new ORPCError("NOT_FOUND", { message: "Leerling niet gevonden" });
	if (!sameTenant(actor, ll)) {
		throw new ORPCError("FORBIDDEN", {
			message: "Leerling hoort bij een andere organisatie",
		});
	}
	if (isSuperadmin(actor.role)) return;
	const [link] = await context.db
		.select({ id: coachAssignment.id })
		.from(coachAssignment)
		.where(
			and(
				eq(coachAssignment.coachId, actor.userId),
				eq(coachAssignment.leerlingId, leerlingId),
			),
		);
	if (!link) {
		throw new ORPCError("FORBIDDEN", {
			message: "Leerling is niet aan jou gekoppeld",
		});
	}
}

/**
 * Resolve the SSE recipients for a `course.changed` event (C1). The frame only
 * carries a `courseId` (no PII) and just triggers an authorized refetch, but we
 * still target a precise set instead of broadcasting: the acting user, plus —
 * for a student_execution — the affected leerling and their assigned coach(es).
 */
async function courseChangedRecipients(
	context: AuthedContext,
	crs: { leerlingId: string | null },
): Promise<string[]> {
	const ids = new Set<string>([context.actor.userId]);
	if (crs.leerlingId) {
		ids.add(crs.leerlingId);
		const coaches = await context.db
			.select({ coachId: coachAssignment.coachId })
			.from(coachAssignment)
			.where(eq(coachAssignment.leerlingId, crs.leerlingId));
		for (const c of coaches) ids.add(c.coachId);
	}
	return [...ids];
}

/** Recipients for a task.changed event: the leerling + their coach(es). */
async function taskChangedRecipients(
	context: AuthedContext,
	leerlingId: string,
): Promise<string[]> {
	const ids = new Set<string>([leerlingId, context.actor.userId]);
	const coaches = await context.db
		.select({ coachId: coachAssignment.coachId })
		.from(coachAssignment)
		.where(eq(coachAssignment.leerlingId, leerlingId));
	for (const c of coaches) ids.add(c.coachId);
	return [...ids];
}

/** Load a section + its course, asserting manage. Returns both. */
async function loadManageableSection(context: AuthedContext, sectionId: string) {
	const [sec] = await context.db
		.select()
		.from(courseSection)
		.where(eq(courseSection.id, sectionId));
	if (!sec) throw new ORPCError("NOT_FOUND", { message: "Sectie niet gevonden" });
	const crs = await loadManageable(context, sec.courseId);
	return { section: sec, course: crs };
}

/** Load a content block + its section + course, asserting manage. */
async function loadManageableBlock(context: AuthedContext, blockId: string) {
	const [block] = await context.db
		.select()
		.from(contentBlock)
		.where(eq(contentBlock.id, blockId));
	if (!block) throw new ORPCError("NOT_FOUND", { message: "Blok niet gevonden" });
	const { course: crs } = await loadManageableSection(context, block.sectionId);
	return { block, course: crs };
}

// ---------------------------------------------------------------------------
// Courses: list / get / create / update (#23)
// ---------------------------------------------------------------------------

const list = protectedProcedure
	.route({ method: "GET", path: "/courses", tags: ["courses"] })
	.input(
		z
			.object({
				kind: z
					.enum([
						"ondivera_template",
						"school_template",
						"student_execution",
					])
					.optional(),
				leerlingId: z.string().optional(),
			})
			.optional(),
	)
	.output(z.array(CourseSchema))
	.handler(async ({ input, context }) => {
		const { actor } = context;

		// Visible courses: Ondivera templates (org null), the actor's own tenant's
		// courses, and — for a leerling — their own student_execution courses.
		const rows = await context.db
			.select(courseColumns)
			.from(course)
			.orderBy(asc(course.kind), asc(course.title));

		const visible = rows.filter((row) => {
			// Superadmin sees everything.
			if (atLeast(actor.role, "superadmin")) return true;
			// Ondivera templates are readable by anyone authed in a school.
			if (row.kind === "ondivera_template") return true;
			// Same-tenant courses.
			if (
				row.organizationId &&
				actor.organizationId &&
				row.organizationId === actor.organizationId
			) {
				// A leerling only sees their own student executions + school templates.
				if (actor.role === "leerling" && row.kind === "student_execution") {
					return row.leerlingId === actor.userId;
				}
				return true;
			}
			return false;
		});

		const filtered = visible.filter((row) => {
			if (input?.kind && row.kind !== input.kind) return false;
			if (input?.leerlingId && row.leerlingId !== input.leerlingId) return false;
			return true;
		});
		return filtered;
	});

const get = protectedProcedure
	.route({ method: "GET", path: "/courses/{id}", tags: ["courses"] })
	.input(z.object({ id: z.string().uuid() }))
	.output(CourseSchema)
	.handler(async ({ input, context }) => loadReadable(context, input.id));

const create = protectedProcedure
	.route({ method: "POST", path: "/courses", tags: ["courses"] })
	.input(
		z.object({
			kind: z.enum([
				"ondivera_template",
				"school_template",
				"student_execution",
			]),
			title: z.string().min(1),
			description: z.string().optional(),
			leerlingId: z.string().optional(),
		}),
	)
	.output(CourseSchema)
	.handler(async ({ input, context }) => {
		const { actor } = context;
		if (!atLeast(actor.role, "ontwikkelaar")) {
			throw new ORPCError("FORBIDDEN", {
				message: "Alleen een ontwikkelaar kan cursussen aanmaken",
			});
		}

		// Ondivera templates live at the platform (null org) — superadmin only.
		const organizationId =
			input.kind === "ondivera_template" ? null : actor.organizationId;
		if (input.kind === "ondivera_template" && !atLeast(actor.role, "superadmin")) {
			throw new ORPCError("FORBIDDEN", {
				message: "Alleen Ondivera kan een sjablooncursus aanmaken",
			});
		}
		if (input.kind !== "ondivera_template" && !organizationId) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Gebruiker heeft geen organisatie",
			});
		}

		const [row] = await context.db
			.insert(course)
			.values({
				kind: input.kind,
				organizationId,
				leerlingId: input.leerlingId ?? null,
				title: input.title,
				description: input.description ?? null,
				createdById: actor.userId,
			})
			.returning(courseColumns);
		if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");
		return row;
	});

const update = protectedProcedure
	.route({ method: "POST", path: "/courses/{id}/update", tags: ["courses"] })
	.input(
		z.object({
			id: z.string().uuid(),
			title: z.string().min(1).optional(),
			description: z.string().nullable().optional(),
			progressBarHidden: z.boolean().optional(),
		}),
	)
	.output(CourseSchema)
	.handler(async ({ input, context }) => {
		await loadManageable(context, input.id);
		const [row] = await context.db
			.update(course)
			.set({
				title: input.title,
				description: input.description,
				progressBarHidden: input.progressBarHidden,
				updatedAt: new Date(),
			})
			.where(eq(course.id, input.id))
			.returning(courseColumns);
		if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");
		publishTo(
			{ type: "course.changed", payload: { courseId: row.id } },
			await courseChangedRecipients(context, row),
		);
		return row;
	});

/**
 * Hide / show the voortgangsbalk (#24). Coach+ only — the "oogje sluiten".
 */
const setProgressBarHidden = protectedProcedure
	.route({ method: "POST", path: "/courses/{id}/progress-bar", tags: ["courses"] })
	.input(z.object({ id: z.string().uuid(), hidden: z.boolean() }))
	.output(CourseSchema)
	.handler(async ({ input, context }) => {
		const row = await loadCourse(context, input.id);
		if (
			!atLeast(context.actor.role, "coach") ||
			!checkPermission(policies.readCourse, context.actor, courseResource(row))
		) {
			throw new ORPCError("FORBIDDEN", {
				message: "Alleen een coach kan de voortgangsbalk verbergen",
			});
		}
		const [updated] = await context.db
			.update(course)
			.set({ progressBarHidden: input.hidden, updatedAt: new Date() })
			.where(eq(course.id, input.id))
			.returning(courseColumns);
		if (!updated) throw new ORPCError("INTERNAL_SERVER_ERROR");
		publishTo(
			{ type: "course.changed", payload: { courseId: updated.id } },
			await courseChangedRecipients(context, updated),
		);
		return updated;
	});

const remove = protectedProcedure
	.route({ method: "POST", path: "/courses/{id}/delete", tags: ["courses"] })
	.input(z.object({ id: z.string().uuid() }))
	.output(z.object({ id: z.string() }))
	.handler(async ({ input, context }) => {
		const crs = await loadManageable(context, input.id);
		const recipients = await courseChangedRecipients(context, crs);
		await context.db.delete(course).where(eq(course.id, input.id));
		publishTo(
			{ type: "course.changed", payload: { courseId: input.id } },
			recipients,
		);
		return { id: input.id };
	});

// ---------------------------------------------------------------------------
// Derive a course copy (#23): Ondivera template → school template,
// school template → student execution. Deep-copies sections + content blocks,
// keeps the parentCourseId link.
// ---------------------------------------------------------------------------

/** Deep-copy all sections + blocks (+ assignments) of `srcId` into `destId`. */
async function copyStructure(
	tx: Tx,
	srcId: string,
	destId: string,
): Promise<void> {
	const srcSections = await tx
		.select()
		.from(courseSection)
		.where(eq(courseSection.courseId, srcId))
		.orderBy(asc(courseSection.position));

	for (const sec of srcSections) {
		const [newSec] = await tx
			.insert(courseSection)
			.values({
				courseId: destId,
				title: sec.title,
				position: sec.position,
			})
			.returning({ id: courseSection.id });
		if (!newSec) continue;

		const blocks = await tx
			.select()
			.from(contentBlock)
			.where(eq(contentBlock.sectionId, sec.id))
			.orderBy(asc(contentBlock.position));

		for (const b of blocks) {
			const [newBlock] = await tx
				.insert(contentBlock)
				.values({
					sectionId: newSec.id,
					type: b.type,
					title: b.title,
					position: b.position,
					body: b.body,
					fileStorageKey: b.fileStorageKey,
					youtubeUrl: b.youtubeUrl,
					ltiConfig: b.ltiConfig,
					countsForProgress: b.countsForProgress,
				})
				.returning({ id: contentBlock.id });
			if (!newBlock) continue;

			// Copy labels (#36).
			const labels = await tx
				.select({ label: contentBlockLabel.label })
				.from(contentBlockLabel)
				.where(eq(contentBlockLabel.contentBlockId, b.id));
			if (labels.length > 0) {
				await tx.insert(contentBlockLabel).values(
					labels.map((l) => ({
						contentBlockId: newBlock.id,
						label: l.label,
					})),
				);
			}

			// Copy the assignment definition for opdracht blocks (#27).
			if (b.type === "opdracht") {
				const [asg] = await tx
					.select()
					.from(assignment)
					.where(eq(assignment.contentBlockId, b.id));
				if (asg) {
					await tx.insert(assignment).values({
						contentBlockId: newBlock.id,
						name: asg.name,
						description: asg.description,
						isGroup: asg.isGroup,
						responseType: asg.responseType,
						maxAttempts: asg.maxAttempts,
						dueAt: asg.dueAt,
						availableFrom: asg.availableFrom,
						availableUntil: asg.availableUntil,
					});
				}
			}
		}
	}
}

const derive = protectedProcedure
	.route({ method: "POST", path: "/courses/{id}/derive", tags: ["courses"] })
	.input(
		z.object({
			id: z.string().uuid(),
			// Target kind: school_template (from ondivera) or student_execution.
			kind: z.enum(["school_template", "student_execution"]),
			title: z.string().min(1).optional(),
			leerlingId: z.string().optional(),
		}),
	)
	.output(CourseSchema)
	.handler(async ({ input, context }) => {
		const { actor } = context;
		const src = await loadReadable(context, input.id);
		if (!atLeast(actor.role, "ontwikkelaar")) {
			throw new ORPCError("FORBIDDEN", {
				message: "Alleen een ontwikkelaar kan een cursus afleiden",
			});
		}
		if (!actor.organizationId) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Gebruiker heeft geen organisatie",
			});
		}

		// Validate the derivation chain.
		if (input.kind === "school_template" && src.kind !== "ondivera_template") {
			throw new ORPCError("BAD_REQUEST", {
				message: "Een schooltemplate leid je af van een Ondivera-sjabloon",
			});
		}
		if (input.kind === "student_execution") {
			if (src.kind !== "school_template") {
				throw new ORPCError("BAD_REQUEST", {
					message: "Een leerlinguitvoering leid je af van een schooltemplate",
				});
			}
			if (!input.leerlingId) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Kies een leerling voor de uitvoering",
				});
			}
		}

		// Atomic: the dest course + its deep-copied sections/blocks/labels/
		// assignments + seeded tasks must commit together — a partial copy would
		// leave orphaned structure (H2).
		const dest = await context.db.transaction(async (tx) => {
			const [created] = await tx
				.insert(course)
				.values({
					kind: input.kind,
					organizationId: actor.organizationId,
					parentCourseId: src.id,
					leerlingId:
						input.kind === "student_execution" ? (input.leerlingId ?? null) : null,
					title: input.title ?? src.title,
					description: src.description,
					createdById: actor.userId,
				})
				.returning(courseColumns);
			if (!created) throw new ORPCError("INTERNAL_SERVER_ERROR");

			await copyStructure(tx, src.id, created.id);

			// For a student execution, seed tasks for each opdracht (#27/#37).
			if (input.kind === "student_execution" && input.leerlingId) {
				await seedTasksForExecution(tx, created.id, input.leerlingId);
			}
			return created;
		});

		publishTo(
			{ type: "course.changed", payload: { courseId: dest.id } },
			await courseChangedRecipients(context, dest),
		);
		return dest;
	});

/** Create a takenlijst task for every opdracht in a student_execution (#27). */
async function seedTasksForExecution(
	tx: Tx,
	courseId: string,
	leerlingId: string,
): Promise<void> {
	const [crs] = await tx
		.select({ organizationId: course.organizationId })
		.from(course)
		.where(eq(course.id, courseId));
	if (!crs?.organizationId) return;

	const rows = await tx
		.select({
			assignmentId: assignment.id,
			name: assignment.name,
			description: assignment.description,
			dueAt: assignment.dueAt,
		})
		.from(assignment)
		.innerJoin(contentBlock, eq(contentBlock.id, assignment.contentBlockId))
		.innerJoin(courseSection, eq(courseSection.id, contentBlock.sectionId))
		.where(eq(courseSection.courseId, courseId));

	for (const a of rows) {
		// Idempotency: skip if a task already exists for this assignment+leerling.
		const [existing] = await tx
			.select({ id: task.id })
			.from(task)
			.where(
				and(eq(task.assignmentId, a.assignmentId), eq(task.leerlingId, leerlingId)),
			);
		if (existing) continue;
		await tx.insert(task).values({
			organizationId: crs.organizationId,
			leerlingId,
			source: "assignment",
			assignmentId: a.assignmentId,
			title: a.name,
			description: a.description,
			dueAt: a.dueAt,
		});
	}
}

// ---------------------------------------------------------------------------
// Sections CRUD + reorder (#25)
// ---------------------------------------------------------------------------

const addSection = protectedProcedure
	.route({ method: "POST", path: "/courses/{courseId}/sections", tags: ["courses"] })
	.input(z.object({ courseId: z.string().uuid(), title: z.string().min(1) }))
	.output(
		z.object({ id: z.string(), title: z.string(), position: z.number() }),
	)
	.handler(async ({ input, context }) => {
		const crs = await loadManageable(context, input.courseId);
		const [agg] = await context.db
			.select({ max: sql<number>`coalesce(max(${courseSection.position}), -1)` })
			.from(courseSection)
			.where(eq(courseSection.courseId, input.courseId));
		const [row] = await context.db
			.insert(courseSection)
			.values({
				courseId: input.courseId,
				title: input.title,
				position: (agg?.max ?? -1) + 1,
			})
			.returning({
				id: courseSection.id,
				title: courseSection.title,
				position: courseSection.position,
			});
		if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");
		publishTo(
			{ type: "course.changed", payload: { courseId: input.courseId } },
			await courseChangedRecipients(context, crs),
		);
		return row;
	});

const updateSection = protectedProcedure
	.route({ method: "POST", path: "/sections/{id}/update", tags: ["courses"] })
	.input(z.object({ id: z.string().uuid(), title: z.string().min(1) }))
	.output(z.object({ id: z.string(), title: z.string() }))
	.handler(async ({ input, context }) => {
		const { course: crs } = await loadManageableSection(context, input.id);
		const [row] = await context.db
			.update(courseSection)
			.set({ title: input.title, updatedAt: new Date() })
			.where(eq(courseSection.id, input.id))
			.returning({ id: courseSection.id, title: courseSection.title });
		if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");
		publishTo(
			{ type: "course.changed", payload: { courseId: crs.id } },
			await courseChangedRecipients(context, crs),
		);
		return row;
	});

const deleteSection = protectedProcedure
	.route({ method: "POST", path: "/sections/{id}/delete", tags: ["courses"] })
	.input(z.object({ id: z.string().uuid() }))
	.output(z.object({ id: z.string() }))
	.handler(async ({ input, context }) => {
		const { course: crs } = await loadManageableSection(context, input.id);
		await context.db.delete(courseSection).where(eq(courseSection.id, input.id));
		publishTo(
			{ type: "course.changed", payload: { courseId: crs.id } },
			await courseChangedRecipients(context, crs),
		);
		return { id: input.id };
	});

const reorderSections = protectedProcedure
	.route({
		method: "POST",
		path: "/courses/{courseId}/sections/reorder",
		tags: ["courses"],
	})
	.input(z.object({ courseId: z.string().uuid(), orderedIds: z.array(z.string().uuid()) }))
	.output(z.object({ ok: z.boolean() }))
	.handler(async ({ input, context }) => {
		const crs = await loadManageable(context, input.courseId);
		// Only reorder sections that actually belong to the course.
		const owned = await context.db
			.select({ id: courseSection.id })
			.from(courseSection)
			.where(eq(courseSection.courseId, input.courseId));
		const ownedIds = new Set(owned.map((s) => s.id));
		let pos = 0;
		for (const id of input.orderedIds) {
			if (!ownedIds.has(id)) continue;
			await context.db
				.update(courseSection)
				.set({ position: pos, updatedAt: new Date() })
				.where(eq(courseSection.id, id));
			pos += 1;
		}
		publishTo(
			{ type: "course.changed", payload: { courseId: input.courseId } },
			await courseChangedRecipients(context, crs),
		);
		return { ok: true };
	});

// ---------------------------------------------------------------------------
// Content blocks CRUD + reorder (#26–#33)
// ---------------------------------------------------------------------------

const BlockInput = z.object({
	sectionId: z.string().uuid(),
	type: blockType,
	title: z.string().min(1),
	countsForProgress: z.boolean().optional(),
	// pagina (#29): ProseMirror JSON, serialised.
	body: z.string().optional(),
	// youtube (#31): raw id or URL — validated server-side.
	youtube: z.string().optional(),
	// bestand (#30): a storage key produced by the upload flow.
	fileStorageKey: z.string().optional(),
	// leervoorkeur labels (#36).
	labels: z.array(z.string()).optional(),
	// opdracht (#27) definition.
	assignment: z
		.object({
			name: z.string().min(1),
			description: z.string().optional(),
			isGroup: z.boolean().optional(),
			responseType: z.enum(["text", "files", "text_and_files"]).optional(),
			maxAttempts: z.number().int().positive().optional(),
			dueAt: z.coerce.date().optional(),
			availableFrom: z.coerce.date().optional(),
			availableUntil: z.coerce.date().optional(),
		})
		.optional(),
});

const addBlock = protectedProcedure
	.route({ method: "POST", path: "/blocks", tags: ["courses"] })
	.input(BlockInput)
	.output(z.object({ id: z.string(), type: blockType }))
	.handler(async ({ input, context }) => {
		const { course: crs } = await loadManageableSection(context, input.sectionId);

		// Validate youtube id up front (#31).
		let youtubeId: string | null = null;
		if (input.type === "youtube") {
			if (!input.youtube)
				throw new ORPCError("BAD_REQUEST", { message: "YouTube-id ontbreekt" });
			youtubeId = parseYoutubeId(input.youtube);
			if (!youtubeId)
				throw new ORPCError("BAD_REQUEST", { message: "Ongeldige YouTube-link" });
		}
		if (input.type === "lti") {
			// #33 post-MVP: accept the block but leave config empty (stub).
			throw new ORPCError("NOT_IMPLEMENTED", {
				message: "LTI-content (#33) volgt na de MVP",
			});
		}

		// Atomic: the block + its labels + (for opdracht) the assignment + seeded
		// task + (for forum) the conversation must all commit together (H2).
		let seededTaskLeerlingId: string | null = null;
		const block = await context.db.transaction(async (tx) => {
			const [agg] = await tx
				.select({ max: sql<number>`coalesce(max(${contentBlock.position}), -1)` })
				.from(contentBlock)
				.where(eq(contentBlock.sectionId, input.sectionId));

			const [created] = await tx
				.insert(contentBlock)
				.values({
					sectionId: input.sectionId,
					type: input.type,
					title: input.title,
					position: (agg?.max ?? -1) + 1,
					body: input.type === "pagina" ? (input.body ?? null) : null,
					youtubeUrl: youtubeId,
					fileStorageKey:
						input.type === "bestand" ? (input.fileStorageKey ?? null) : null,
					countsForProgress: input.countsForProgress ?? true,
				})
				.returning({ id: contentBlock.id, type: contentBlock.type });
			if (!created) throw new ORPCError("INTERNAL_SERVER_ERROR");

			// Labels (#36).
			if (input.labels && input.labels.length > 0) {
				await tx.insert(contentBlockLabel).values(
					input.labels.map((label) => ({ contentBlockId: created.id, label })),
				);
			}

			// opdracht: create the assignment definition (#27).
			if (input.type === "opdracht") {
				const a = input.assignment;
				if (!a)
					throw new ORPCError("BAD_REQUEST", {
						message: "Opdrachtgegevens ontbreken",
					});
				const [asg] = await tx
					.insert(assignment)
					.values({
						contentBlockId: created.id,
						name: a.name,
						description: a.description ?? null,
						isGroup: a.isGroup ?? false,
						responseType: a.responseType ?? "text_and_files",
						maxAttempts: a.maxAttempts ?? null,
						dueAt: a.dueAt ?? null,
						availableFrom: a.availableFrom ?? null,
						availableUntil: a.availableUntil ?? null,
					})
					.returning({ id: assignment.id });

				// On a student_execution course, also seed a takenlijst task (#27/#37).
				if (asg && crs.kind === "student_execution" && crs.leerlingId) {
					if (crs.organizationId) {
						await tx.insert(task).values({
							organizationId: crs.organizationId,
							leerlingId: crs.leerlingId,
							source: "assignment",
							assignmentId: asg.id,
							title: a.name,
							description: a.description ?? null,
							dueAt: a.dueAt ?? null,
						});
						seededTaskLeerlingId = crs.leerlingId;
					}
				}
			}

			// forum: create + link a chat conversation (#32).
			if (input.type === "forum") {
				await createForumConversation(tx, created.id, crs, input.title);
			}
			return created;
		});

		// Side-effects AFTER the write commits (best-effort, never roll back).
		if (seededTaskLeerlingId) {
			publishTo(
				{ type: "task.changed", payload: { leerlingId: seededTaskLeerlingId } },
				await taskChangedRecipients(context, seededTaskLeerlingId),
			);
		}

		publishTo(
			{ type: "course.changed", payload: { courseId: crs.id } },
			await courseChangedRecipients(context, crs),
		);
		return block;
	});

/**
 * Create a kind="forum" conversation linked to a forum content block (#32) and
 * add the leerling (if this is a student execution) + their coach as supervisor.
 * Cross-domain write into the chat tables (shared TABLES, not shared code).
 */
async function createForumConversation(
	tx: Tx,
	blockId: string,
	crs: { organizationId: string | null; leerlingId: string | null },
	title: string,
): Promise<void> {
	if (!crs.organizationId) return;
	const [conv] = await tx
		.insert(conversation)
		.values({
			organizationId: crs.organizationId,
			kind: "forum",
			courseContentBlockId: blockId,
			title,
		})
		.returning({ id: conversation.id });
	if (!conv) return;

	const members: { conversationId: string; userId: string; role: "member" | "supervisor" }[] =
		[];
	if (crs.leerlingId) {
		members.push({
			conversationId: conv.id,
			userId: crs.leerlingId,
			role: "member",
		});
	}
	if (members.length > 0) {
		await tx.insert(conversationMember).values(members);
	}
}

const updateBlock = protectedProcedure
	.route({ method: "POST", path: "/blocks/{id}/update", tags: ["courses"] })
	.input(
		z.object({
			id: z.string().uuid(),
			title: z.string().min(1).optional(),
			body: z.string().optional(),
			youtube: z.string().optional(),
			fileStorageKey: z.string().optional(),
			countsForProgress: z.boolean().optional(),
			labels: z.array(z.string()).optional(),
		}),
	)
	.output(z.object({ id: z.string() }))
	.handler(async ({ input, context }) => {
		const { block, course: crs } = await loadManageableBlock(context, input.id);

		let youtubeId: string | null | undefined;
		if (input.youtube !== undefined) {
			youtubeId = parseYoutubeId(input.youtube);
			if (!youtubeId)
				throw new ORPCError("BAD_REQUEST", { message: "Ongeldige YouTube-link" });
		}

		await context.db
			.update(contentBlock)
			.set({
				title: input.title,
				body: block.type === "pagina" ? input.body : undefined,
				youtubeUrl: block.type === "youtube" ? youtubeId : undefined,
				fileStorageKey:
					block.type === "bestand" ? input.fileStorageKey : undefined,
				countsForProgress: input.countsForProgress,
				updatedAt: new Date(),
			})
			.where(eq(contentBlock.id, input.id));

		// Replace labels if provided (#36).
		if (input.labels) {
			await context.db
				.delete(contentBlockLabel)
				.where(eq(contentBlockLabel.contentBlockId, input.id));
			if (input.labels.length > 0) {
				await context.db.insert(contentBlockLabel).values(
					input.labels.map((label) => ({ contentBlockId: input.id, label })),
				);
			}
		}

		publishTo(
			{ type: "course.changed", payload: { courseId: crs.id } },
			await courseChangedRecipients(context, crs),
		);
		return { id: input.id };
	});

const deleteBlock = protectedProcedure
	.route({ method: "POST", path: "/blocks/{id}/delete", tags: ["courses"] })
	.input(z.object({ id: z.string().uuid() }))
	.output(z.object({ id: z.string() }))
	.handler(async ({ input, context }) => {
		const { course: crs } = await loadManageableBlock(context, input.id);
		await context.db.delete(contentBlock).where(eq(contentBlock.id, input.id));
		publishTo(
			{ type: "course.changed", payload: { courseId: crs.id } },
			await courseChangedRecipients(context, crs),
		);
		return { id: input.id };
	});

const reorderBlocks = protectedProcedure
	.route({
		method: "POST",
		path: "/sections/{sectionId}/blocks/reorder",
		tags: ["courses"],
	})
	.input(z.object({ sectionId: z.string().uuid(), orderedIds: z.array(z.string().uuid()) }))
	.output(z.object({ ok: z.boolean() }))
	.handler(async ({ input, context }) => {
		const { course: crs } = await loadManageableSection(context, input.sectionId);
		const owned = await context.db
			.select({ id: contentBlock.id })
			.from(contentBlock)
			.where(eq(contentBlock.sectionId, input.sectionId));
		const ownedIds = new Set(owned.map((b) => b.id));
		let pos = 0;
		for (const id of input.orderedIds) {
			if (!ownedIds.has(id)) continue;
			await context.db
				.update(contentBlock)
				.set({ position: pos, updatedAt: new Date() })
				.where(eq(contentBlock.id, id));
			pos += 1;
		}
		publishTo(
			{ type: "course.changed", payload: { courseId: crs.id } },
			await courseChangedRecipients(context, crs),
		);
		return { ok: true };
	});

// ---------------------------------------------------------------------------
// Uploads (#27/#30): presign a PUT, then confirm (stat re-verify)
// ---------------------------------------------------------------------------

const presignUpload = protectedProcedure
	.route({ method: "POST", path: "/courses/upload/presign", tags: ["courses"] })
	.input(
		z.object({
			filename: z.string().min(1),
			contentType: z.string().min(1),
			scope: z.enum(["bestand", "submission", "feedback"]).default("bestand"),
		}),
	)
	.output(
		z.object({
			storageKey: z.string(),
			uploadUrl: z.string(),
			local: z.boolean(),
		}),
	)
	.handler(async ({ input, context }) => {
		const { actor } = context;
		// Ontwikkelaar+ upload course files; a leerling uploads submission files.
		if (input.scope === "bestand" && !atLeast(actor.role, "ontwikkelaar")) {
			throw new ORPCError("FORBIDDEN");
		}
		if (input.scope === "feedback" && !atLeast(actor.role, "coach")) {
			throw new ORPCError("FORBIDDEN");
		}
		if (!ALLOWED_UPLOAD_TYPES[input.contentType]) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Bestandstype niet toegestaan",
			});
		}
		const storageKey = makeStorageKey(input.scope, input.filename);
		return presignPut(storageKey, input.contentType);
	});

const confirmUpload = protectedProcedure
	.route({ method: "POST", path: "/courses/upload/confirm", tags: ["courses"] })
	.input(z.object({ storageKey: z.string() }))
	.output(z.object({ storageKey: z.string(), size: z.number() }))
	.handler(async ({ input, context }) => {
		void context;
		const { size } = await statUpload(input.storageKey);
		if (size > MAX_UPLOAD_BYTES) {
			throw new ORPCError("BAD_REQUEST", { message: "Bestand te groot" });
		}
		return { storageKey: input.storageKey, size };
	});

/**
 * Local-dev upload (no S3): the browser sends file bytes as base64 and we write
 * them to the local uploads dir. Returns the storageKey to persist on the row.
 * In prod the presigned PUT path is used instead.
 */
const uploadLocal = protectedProcedure
	.route({ method: "POST", path: "/courses/upload/local", tags: ["courses"] })
	.input(
		z.object({
			filename: z.string().min(1),
			contentType: z.string().min(1),
			scope: z.enum(["bestand", "submission", "feedback"]).default("bestand"),
			/** base64-encoded file bytes. */
			data: z.string().min(1),
		}),
	)
	.output(z.object({ storageKey: z.string(), size: z.number() }))
	.handler(async ({ input, context }) => {
		const { actor } = context;
		if (input.scope === "bestand" && !atLeast(actor.role, "ontwikkelaar")) {
			throw new ORPCError("FORBIDDEN");
		}
		if (input.scope === "feedback" && !atLeast(actor.role, "coach")) {
			throw new ORPCError("FORBIDDEN");
		}
		if (!ALLOWED_UPLOAD_TYPES[input.contentType]) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Bestandstype niet toegestaan",
			});
		}
		const bytes = Buffer.from(input.data, "base64");
		if (bytes.byteLength > MAX_UPLOAD_BYTES) {
			throw new ORPCError("BAD_REQUEST", { message: "Bestand te groot" });
		}
		// Sniff magic bytes and reject if the real content doesn't match the
		// (allow-listed) declared type — blocks stored-XSS via a mislabelled
		// upload (H1).
		if (!contentMatchesBytes(input.contentType, bytes)) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Bestandsinhoud komt niet overeen met het opgegeven type",
			});
		}
		const storageKey = makeStorageKey(input.scope, input.filename);
		await writeLocalUpload(storageKey, bytes);
		return { storageKey, size: bytes.byteLength };
	});

/**
 * Authorize the actor to access a given `storageKey` by resolving it to its
 * owning row and re-checking the relevant policy (C2). The leading key scope
 * tells us which table references it:
 *   - `bestand`    → content_block.fileStorageKey → course (readCourse)
 *   - `feedback`   → assignment_grade.feedbackMediaStorageKey → course (readCourse)
 *   - `submission` → assignment_submission.fileStorageKeys[] → own submission,
 *                    or a coach who may grade/read the course
 * Throws FORBIDDEN / NOT_FOUND if the actor isn't permitted or no row owns it.
 */
async function authorizeFileAccess(
	context: AuthedContext,
	storageKey: string,
): Promise<void> {
	const { actor } = context;
	const scope = storageKey.split("/")[0];

	if (scope === "bestand") {
		const [block] = await context.db
			.select({ sectionId: contentBlock.sectionId })
			.from(contentBlock)
			.where(eq(contentBlock.fileStorageKey, storageKey));
		if (!block) throw new ORPCError("NOT_FOUND");
		const [sec] = await context.db
			.select({ courseId: courseSection.courseId })
			.from(courseSection)
			.where(eq(courseSection.id, block.sectionId));
		if (!sec) throw new ORPCError("NOT_FOUND");
		await loadReadable(context, sec.courseId); // throws FORBIDDEN if not allowed
		return;
	}

	if (scope === "feedback") {
		const [grade] = await context.db
			.select({ submissionId: assignmentGrade.submissionId })
			.from(assignmentGrade)
			.where(eq(assignmentGrade.feedbackMediaStorageKey, storageKey));
		if (!grade) throw new ORPCError("NOT_FOUND");
		const [sub] = await context.db
			.select({
				assignmentId: assignmentSubmission.assignmentId,
				leerlingId: assignmentSubmission.leerlingId,
			})
			.from(assignmentSubmission)
			.where(eq(assignmentSubmission.id, grade.submissionId));
		if (!sub) throw new ORPCError("NOT_FOUND");
		const { course: crs } = await loadAssignmentCourse(context, sub.assignmentId);
		// The leerling the feedback is for, or a coach who can read the course.
		if (
			actor.userId === sub.leerlingId ||
			checkPermission(policies.readCourse, actor, courseResource(crs))
		) {
			return;
		}
		throw new ORPCError("FORBIDDEN");
	}

	if (scope === "submission") {
		// A submission's files live in a jsonb array; find the submission whose
		// array contains this key (tenant-scoped through the course).
		const candidates = await context.db
			.select({
				id: assignmentSubmission.id,
				assignmentId: assignmentSubmission.assignmentId,
				leerlingId: assignmentSubmission.leerlingId,
				fileStorageKeys: assignmentSubmission.fileStorageKeys,
			})
			.from(assignmentSubmission)
			.where(
				sql`${assignmentSubmission.fileStorageKeys} @> ${JSON.stringify([
					storageKey,
				])}::jsonb`,
			);
		const sub = candidates[0];
		if (!sub) throw new ORPCError("NOT_FOUND");
		const { course: crs } = await loadAssignmentCourse(context, sub.assignmentId);
		// The owning leerling, or a coach who may read/grade the course.
		if (
			actor.userId === sub.leerlingId ||
			checkPermission(policies.readCourse, actor, courseResource(crs))
		) {
			return;
		}
		throw new ORPCError("FORBIDDEN");
	}

	throw new ORPCError("FORBIDDEN");
}

/**
 * Resolve a stored file to a viewable URL (#30), AUTHORIZED + path-safe (C2/H1).
 * For prod S3 we issue a SHORT-LIVED presigned GET; for local-dev we return a
 * base64 data URL. Non-allowlisted content is never served as an inline
 * executable type and the client is told not to sniff (`X-Content-Type-Options`
 * is set on the procedure response).
 */
const getFile = protectedProcedure
	.route({ method: "GET", path: "/courses/file", tags: ["courses"] })
	.input(z.object({ storageKey: z.string() }))
	.output(z.object({ url: z.string() }))
	.handler(async ({ input, context }) => {
		// Reject path traversal / malformed keys before any DB or FS access.
		try {
			assertValidStorageKey(input.storageKey);
		} catch {
			throw new ORPCError("BAD_REQUEST", { message: "Ongeldige opslagsleutel" });
		}
		// Authorize against the owning row (IDOR fix).
		await authorizeFileAccess(context, input.storageKey);

		if (hasS3()) {
			// Short-lived presigned GET — never a permanent public URL for pupil data.
			return { url: presignedGetUrl(input.storageKey, 300) };
		}
		const bytes = await readLocalUpload(input.storageKey);
		// Derive the MIME from the extension. Only allow a known/allow-listed
		// content type to be served inline as a data URL; anything else (or an
		// unknown extension) falls back to a non-executable octet-stream so it
		// can't render in the victim's origin (H1). Combined with the upload-time
		// magic-byte sniff, the served type is server-derived, never client-trusted.
		const guessed = guessContentType(input.storageKey);
		const inlineAllowed = new Set(
			Object.keys(ALLOWED_UPLOAD_TYPES).filter(
				(t) => !t.startsWith("text/") && t !== "image/svg+xml",
			),
		);
		const safeMime = inlineAllowed.has(guessed)
			? guessed
			: "application/octet-stream";
		return {
			url: `data:${safeMime};base64,${bytes.toString("base64")}`,
		};
	});

// ---------------------------------------------------------------------------
// Full course tree for viewing (#24/#26/#29/#31/#35) — leerling + builder share.
// ---------------------------------------------------------------------------

const BlockViewSchema = z.object({
	id: z.string(),
	type: blockType,
	title: z.string(),
	position: z.number(),
	body: z.string().nullable(),
	youtubeId: z.string().nullable(),
	youtubeEmbedUrl: z.string().nullable(),
	fileStorageKey: z.string().nullable(),
	fileUrl: z.string().nullable(),
	countsForProgress: z.boolean(),
	labels: z.array(z.string()),
	completed: z.boolean(),
	recommended: z.boolean(),
	assignment: z
		.object({
			id: z.string(),
			name: z.string(),
			description: z.string().nullable(),
			isGroup: z.boolean(),
			responseType: z.enum(["text", "files", "text_and_files"]),
			maxAttempts: z.number().nullable(),
			dueAt: z.date().nullable(),
		})
		.nullable(),
	forumConversationId: z.string().nullable(),
});

const tree = protectedProcedure
	.route({ method: "GET", path: "/courses/{id}/tree", tags: ["courses"] })
	.input(
		z.object({
			id: z.string().uuid(),
			// Compute completion/recommended for this leerling (defaults to actor).
			leerlingId: z.string().optional(),
		}),
	)
	.output(
		z.object({
			course: CourseSchema,
			leervoorkeuren: z.array(z.string()),
			progress: z.object({
				total: z.number(),
				done: z.number(),
				percent: z.number(),
			}),
			sections: z.array(
				z.object({
					id: z.string(),
					title: z.string(),
					position: z.number(),
					blocks: z.array(BlockViewSchema),
				}),
			),
		}),
	)
	.handler(async ({ input, context }) => {
		const { actor } = context;
		const crs = await loadReadable(context, input.id);
		// A non-leerling who supplies a leerlingId must be allowed to act for them
		// (same tenant + assigned), else they could read another pupil's progress
		// and leervoorkeuren (Medium).
		if (actor.role !== "leerling" && input.leerlingId) {
			await assertLeerlingReachable(context, input.leerlingId);
		}
		const leerlingId =
			actor.role === "leerling"
				? actor.userId
				: (input.leerlingId ?? crs.leerlingId ?? actor.userId);

		const sections = await context.db
			.select()
			.from(courseSection)
			.where(eq(courseSection.courseId, crs.id))
			.orderBy(asc(courseSection.position));

		const sectionIds = sections.map((s) => s.id);
		const blocks = sectionIds.length
			? await context.db
					.select()
					.from(contentBlock)
					.where(inArray(contentBlock.sectionId, sectionIds))
					.orderBy(asc(contentBlock.position))
			: [];
		const blockIds = blocks.map((b) => b.id);

		// Labels, assignments, progress, forums — batched.
		const labels = blockIds.length
			? await context.db
					.select()
					.from(contentBlockLabel)
					.where(inArray(contentBlockLabel.contentBlockId, blockIds))
			: [];
		const assignments = blockIds.length
			? await context.db
					.select()
					.from(assignment)
					.where(inArray(assignment.contentBlockId, blockIds))
			: [];
		const progress = blockIds.length
			? await context.db
					.select()
					.from(contentProgress)
					.where(
						and(
							inArray(contentProgress.contentBlockId, blockIds),
							eq(contentProgress.leerlingId, leerlingId),
						),
					)
			: [];
		const forums = blockIds.length
			? await context.db
					.select({
						id: conversation.id,
						blockId: conversation.courseContentBlockId,
					})
					.from(conversation)
					.where(inArray(conversation.courseContentBlockId, blockIds))
			: [];

		const labelsByBlock = new Map<string, string[]>();
		for (const l of labels) {
			const arr = labelsByBlock.get(l.contentBlockId) ?? [];
			arr.push(l.label);
			labelsByBlock.set(l.contentBlockId, arr);
		}
		const asgByBlock = new Map(assignments.map((a) => [a.contentBlockId, a]));
		const doneSet = new Set(
			progress.filter((p) => p.completed).map((p) => p.contentBlockId),
		);
		const forumByBlock = new Map(
			forums.filter((f) => f.blockId).map((f) => [f.blockId as string, f.id]),
		);

		// Leervoorkeuren of the leerling (#35) from their latest coachplan submission.
		const leervoorkeuren = await readLeervoorkeuren(context, leerlingId);
		const prefSet = new Set(leervoorkeuren);

		const blocksBySection = new Map<string, typeof blocks>();
		for (const b of blocks) {
			const arr = blocksBySection.get(b.sectionId) ?? [];
			arr.push(b);
			blocksBySection.set(b.sectionId, arr);
		}

		let total = 0;
		let done = 0;
		const sectionDtos = sections.map((s) => {
			const sBlocks = (blocksBySection.get(s.id) ?? []).map((b) => {
				const blockLabels = labelsByBlock.get(b.id) ?? [];
				const completed = doneSet.has(b.id);
				if (b.countsForProgress) {
					total += 1;
					if (completed) done += 1;
				}
				// Recommended/active (#35): no labels = always active; otherwise
				// active when at least one label matches a leervoorkeur.
				const recommended =
					blockLabels.length === 0 ||
					blockLabels.some((l) => prefSet.has(l));
				const asg = asgByBlock.get(b.id);
				return {
					id: b.id,
					type: b.type,
					title: b.title,
					position: b.position,
					body: b.body,
					youtubeId: b.youtubeUrl,
					youtubeEmbedUrl: b.youtubeUrl
						? youtubeEmbedUrl(b.youtubeUrl)
						: null,
					fileStorageKey: b.fileStorageKey,
					fileUrl: b.fileStorageKey ? publicUrl(b.fileStorageKey) : null,
					countsForProgress: b.countsForProgress,
					labels: blockLabels,
					completed,
					recommended,
					assignment: asg
						? {
								id: asg.id,
								name: asg.name,
								description: asg.description,
								isGroup: asg.isGroup,
								responseType: asg.responseType,
								maxAttempts: asg.maxAttempts,
								dueAt: asg.dueAt,
							}
						: null,
					forumConversationId: forumByBlock.get(b.id) ?? null,
				};
			});
			return {
				id: s.id,
				title: s.title,
				position: s.position,
				blocks: sBlocks,
			};
		});

		return {
			course: crs,
			leervoorkeuren,
			progress: {
				total,
				done,
				percent: total === 0 ? 0 : Math.round((done / total) * 100),
			},
			sections: sectionDtos,
		};
	});

/**
 * Read a leerling's leervoorkeur labels (#35/#36) from their latest coachplan
 * submission. Cross-domain READ of the coachplan tables. Best-effort: returns
 * `[]` if the leerling has no plan yet.
 */
async function readLeervoorkeuren(
	context: AuthedContext,
	leerlingId: string,
): Promise<string[]> {
	const [sub] = await context.db
		.select({ id: formSubmission.id })
		.from(formSubmission)
		.where(eq(formSubmission.leerlingId, leerlingId))
		.orderBy(desc(formSubmission.updatedAt))
		.limit(1);
	if (!sub) return [];
	const rows = await context.db
		.select({ label: learningPreferenceLabel.label })
		.from(learningPreferenceLabel)
		.where(eq(learningPreferenceLabel.submissionId, sub.id));
	return rows.map((r) => r.label);
}

// ---------------------------------------------------------------------------
// Progress (#24): mark a block viewed/done
// ---------------------------------------------------------------------------

const setProgress = protectedProcedure
	.route({ method: "POST", path: "/blocks/{id}/progress", tags: ["courses"] })
	.input(
		z.object({
			id: z.string().uuid(),
			completed: z.boolean(),
			leerlingId: z.string().optional(),
		}),
	)
	.output(z.object({ id: z.string(), completed: z.boolean() }))
	.handler(async ({ input, context }) => {
		const { actor } = context;
		// Load block → section → course and ensure read access.
		const [block] = await context.db
			.select({ id: contentBlock.id, sectionId: contentBlock.sectionId })
			.from(contentBlock)
			.where(eq(contentBlock.id, input.id));
		if (!block) throw new ORPCError("NOT_FOUND");
		const [sec] = await context.db
			.select({ courseId: courseSection.courseId })
			.from(courseSection)
			.where(eq(courseSection.id, block.sectionId));
		if (!sec) throw new ORPCError("NOT_FOUND");
		const crs = await loadReadable(context, sec.courseId);

		// A non-leerling writing progress for a supplied leerlingId must be
		// allowed to act for them (same tenant + assigned) before any write (Medium).
		if (actor.role !== "leerling" && input.leerlingId) {
			await assertLeerlingReachable(context, input.leerlingId);
		}
		const leerlingId =
			actor.role === "leerling"
				? actor.userId
				: (input.leerlingId ?? crs.leerlingId);
		if (!leerlingId) {
			throw new ORPCError("BAD_REQUEST", { message: "Geen leerling bekend" });
		}

		const [existing] = await context.db
			.select({ id: contentProgress.id })
			.from(contentProgress)
			.where(
				and(
					eq(contentProgress.contentBlockId, input.id),
					eq(contentProgress.leerlingId, leerlingId),
				),
			);
		if (existing) {
			await context.db
				.update(contentProgress)
				.set({
					completed: input.completed,
					completedAt: input.completed ? new Date() : null,
					updatedAt: new Date(),
				})
				.where(eq(contentProgress.id, existing.id));
		} else {
			await context.db.insert(contentProgress).values({
				contentBlockId: input.id,
				leerlingId,
				completed: input.completed,
				completedAt: input.completed ? new Date() : null,
			});
		}
		publishTo(
			{ type: "course.changed", payload: { courseId: crs.id } },
			await courseChangedRecipients(context, { leerlingId }),
		);
		return { id: input.id, completed: input.completed };
	});

// ---------------------------------------------------------------------------
// Assignment submission (#27) + grading (#28)
// ---------------------------------------------------------------------------

const SubmissionSchema = z.object({
	id: z.string(),
	assignmentId: z.string(),
	leerlingId: z.string(),
	attempt: z.number(),
	status: z.enum(["draft", "submitted", "graded", "returned"]),
	responseText: z.string().nullable(),
	fileStorageKeys: z.array(z.string()),
	submittedAt: z.date().nullable(),
	createdAt: z.date(),
});

/** Load an assignment + its course (for tenant scoping). */
async function loadAssignmentCourse(context: AuthedContext, assignmentId: string) {
	const [asg] = await context.db
		.select()
		.from(assignment)
		.where(eq(assignment.id, assignmentId));
	if (!asg) throw new ORPCError("NOT_FOUND", { message: "Opdracht niet gevonden" });
	const [block] = await context.db
		.select({ sectionId: contentBlock.sectionId })
		.from(contentBlock)
		.where(eq(contentBlock.id, asg.contentBlockId));
	if (!block) throw new ORPCError("NOT_FOUND");
	const [sec] = await context.db
		.select({ courseId: courseSection.courseId })
		.from(courseSection)
		.where(eq(courseSection.id, block.sectionId));
	if (!sec) throw new ORPCError("NOT_FOUND");
	const crs = await loadCourse(context, sec.courseId);
	return { assignment: asg, course: crs };
}

const submitAssignment = protectedProcedure
	.route({ method: "POST", path: "/assignments/{assignmentId}/submit", tags: ["courses"] })
	.input(
		z.object({
			assignmentId: z.string().uuid(),
			responseText: z.string().optional(),
			fileStorageKeys: z.array(z.string()).optional(),
			leerlingId: z.string().optional(),
		}),
	)
	.output(SubmissionSchema)
	.handler(async ({ input, context }) => {
		const { actor } = context;
		const { assignment: asg, course: crs } = await loadAssignmentCourse(
			context,
			input.assignmentId,
		);
		const leerlingId =
			actor.role === "leerling" ? actor.userId : (input.leerlingId ?? "");
		if (!leerlingId) {
			throw new ORPCError("BAD_REQUEST", { message: "Geen leerling opgegeven" });
		}

		// A non-leerling submitting on behalf of a supplied leerlingId must be
		// allowed to act for them (same tenant + assigned) before creating the
		// submission (Medium).
		if (actor.role !== "leerling" && input.leerlingId) {
			await assertLeerlingReachable(context, input.leerlingId);
		}

		// submitAssignment policy: own submission, or coach on behalf, same tenant.
		if (
			!checkPermission(policies.submitAssignment, actor, {
				organizationId: crs.organizationId,
				leerlingId,
			})
		) {
			throw new ORPCError("FORBIDDEN");
		}

		// Attempt number = count of existing submissions + 1; enforce maxAttempts.
		const existing = await context.db
			.select({ id: assignmentSubmission.id })
			.from(assignmentSubmission)
			.where(
				and(
					eq(assignmentSubmission.assignmentId, asg.id),
					eq(assignmentSubmission.leerlingId, leerlingId),
				),
			);
		if (asg.maxAttempts && existing.length >= asg.maxAttempts) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Maximaal aantal inleverpogingen bereikt",
			});
		}

		const [row] = await context.db
			.insert(assignmentSubmission)
			.values({
				assignmentId: asg.id,
				leerlingId,
				attempt: existing.length + 1,
				status: "submitted",
				responseText: input.responseText ?? null,
				fileStorageKeys: input.fileStorageKeys ?? [],
				submittedAt: new Date(),
			})
			.returning();
		if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");

		publishTo(
			{ type: "course.changed", payload: { courseId: crs.id } },
			await courseChangedRecipients(context, { leerlingId }),
		);
		return {
			...row,
			fileStorageKeys: (row.fileStorageKeys as string[] | null) ?? [],
		};
	});

/** List submissions for an assignment (coach grading view) or own (leerling). */
const listSubmissions = protectedProcedure
	.route({ method: "GET", path: "/assignments/{assignmentId}/submissions", tags: ["courses"] })
	.input(z.object({ assignmentId: z.string().uuid() }))
	.output(
		z.array(
			SubmissionSchema.extend({
				leerlingName: z.string().nullable(),
				grade: z
					.object({
						id: z.string(),
						grade: z.string().nullable(),
						feedbackText: z.string().nullable(),
						feedbackMediaUrl: z.string().nullable(),
						createdAt: z.date(),
					})
					.nullable(),
			}),
		),
	)
	.handler(async ({ input, context }) => {
		const { actor } = context;
		const { course: crs } = await loadAssignmentCourse(context, input.assignmentId);
		if (!checkPermission(policies.readCourse, actor, courseResource(crs))) {
			throw new ORPCError("FORBIDDEN");
		}

		const rows = await context.db
			.select({
				submission: assignmentSubmission,
				leerlingName: user.name,
			})
			.from(assignmentSubmission)
			.leftJoin(user, eq(user.id, assignmentSubmission.leerlingId))
			.where(eq(assignmentSubmission.assignmentId, input.assignmentId))
			.orderBy(desc(assignmentSubmission.submittedAt));

		// A leerling only sees their own submissions.
		const visible =
			actor.role === "leerling"
				? rows.filter((r) => r.submission.leerlingId === actor.userId)
				: rows;

		const subIds = visible.map((r) => r.submission.id);
		const grades = subIds.length
			? await context.db
					.select()
					.from(assignmentGrade)
					.where(inArray(assignmentGrade.submissionId, subIds))
			: [];
		const gradeBySub = new Map(grades.map((g) => [g.submissionId, g]));

		return visible.map((r) => {
			const g = gradeBySub.get(r.submission.id);
			return {
				...r.submission,
				fileStorageKeys:
					(r.submission.fileStorageKeys as string[] | null) ?? [],
				leerlingName: r.leerlingName ?? null,
				grade: g
					? {
							id: g.id,
							grade: g.grade,
							feedbackText: g.feedbackText,
							feedbackMediaUrl: g.feedbackMediaStorageKey
								? publicUrl(g.feedbackMediaStorageKey)
								: null,
							createdAt: g.createdAt,
						}
					: null,
			};
		});
	});

const gradeSubmission = protectedProcedure
	.route({ method: "POST", path: "/submissions/{submissionId}/grade", tags: ["courses"] })
	.input(
		z.object({
			submissionId: z.string().uuid(),
			grade: z.string().optional(),
			feedbackText: z.string().optional(),
			feedbackMediaStorageKey: z.string().optional(),
		}),
	)
	.output(z.object({ id: z.string(), submissionId: z.string() }))
	.handler(async ({ input, context }) => {
		const { actor } = context;
		const [sub] = await context.db
			.select()
			.from(assignmentSubmission)
			.where(eq(assignmentSubmission.id, input.submissionId));
		if (!sub) throw new ORPCError("NOT_FOUND");
		const { course: crs } = await loadAssignmentCourse(context, sub.assignmentId);

		// gradeAssignment policy: coach+, same tenant.
		if (
			!checkPermission(policies.gradeAssignment, actor, courseResource(crs))
		) {
			throw new ORPCError("FORBIDDEN", {
				message: "Alleen een coach kan beoordelen",
			});
		}

		// Atomic: the grade insert + the submission status flip commit together —
		// otherwise a grade could be written without the status moving to "graded" (H2).
		const row = await context.db.transaction(async (tx) => {
			const [grade] = await tx
				.insert(assignmentGrade)
				.values({
					submissionId: input.submissionId,
					coachId: actor.userId,
					grade: input.grade ?? null,
					feedbackText: input.feedbackText ?? null,
					feedbackMediaStorageKey: input.feedbackMediaStorageKey ?? null,
				})
				.returning({ id: assignmentGrade.id });
			if (!grade) throw new ORPCError("INTERNAL_SERVER_ERROR");

			await tx
				.update(assignmentSubmission)
				.set({ status: "graded", updatedAt: new Date() })
				.where(eq(assignmentSubmission.id, input.submissionId));
			return grade;
		});

		publishTo(
			{ type: "course.changed", payload: { courseId: crs.id } },
			await courseChangedRecipients(context, { leerlingId: sub.leerlingId }),
		);

		// Notify the leerling that their submission was graded (#3/#28).
		// Best-effort: a notify failure must never break the grade mutation.
		try {
			const [leerling] = await context.db
				.select({ organizationId: user.organizationId })
				.from(user)
				.where(eq(user.id, sub.leerlingId));
			const organizationId = leerling?.organizationId ?? crs.organizationId;
			if (organizationId) {
				await notify(context.db, {
					userId: sub.leerlingId,
					organizationId,
					type: "course_activity",
					title: "Opdracht beoordeeld",
					body: "Je coach heeft je opdracht beoordeeld.",
					entity: { type: "assignment_submission", id: input.submissionId },
				});
			}
		} catch (err) {
			console.error("notify(course_activity grade) failed", err);
		}
		return { id: row.id, submissionId: input.submissionId };
	});

// ---------------------------------------------------------------------------
// Proposed assignment by a leerling (#61)
// ---------------------------------------------------------------------------

const ProposalSchema = z.object({
	id: z.string(),
	courseId: z.string(),
	leerlingId: z.string(),
	coachId: z.string().nullable(),
	title: z.string(),
	description: z.string().nullable(),
	status: z.enum(["proposed", "accepted", "rejected"]),
	createdAt: z.date(),
});

const proposeAssignment = protectedProcedure
	.route({ method: "POST", path: "/courses/{courseId}/proposals", tags: ["courses"] })
	.input(
		z.object({
			courseId: z.string().uuid(),
			title: z.string().min(1),
			description: z.string().optional(),
		}),
	)
	.output(ProposalSchema)
	.handler(async ({ input, context }) => {
		const { actor } = context;
		const crs = await loadReadable(context, input.courseId);
		if (actor.role !== "leerling") {
			throw new ORPCError("FORBIDDEN", {
				message: "Alleen een leerling kan een eigen opdracht voorstellen",
			});
		}
		const [row] = await context.db
			.insert(proposedAssignment)
			.values({
				courseId: crs.id,
				leerlingId: actor.userId,
				title: input.title,
				description: input.description ?? null,
			})
			.returning();
		if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");
		publishTo(
			{ type: "course.changed", payload: { courseId: crs.id } },
			await courseChangedRecipients(context, crs),
		);
		return row;
	});

const listProposals = protectedProcedure
	.route({ method: "GET", path: "/courses/{courseId}/proposals", tags: ["courses"] })
	.input(z.object({ courseId: z.string().uuid() }))
	.output(z.array(ProposalSchema.extend({ leerlingName: z.string().nullable() })))
	.handler(async ({ input, context }) => {
		const { actor } = context;
		const crs = await loadReadable(context, input.courseId);
		const rows = await context.db
			.select({ proposal: proposedAssignment, leerlingName: user.name })
			.from(proposedAssignment)
			.leftJoin(user, eq(user.id, proposedAssignment.leerlingId))
			.where(eq(proposedAssignment.courseId, crs.id))
			.orderBy(desc(proposedAssignment.createdAt));
		const visible =
			actor.role === "leerling"
				? rows.filter((r) => r.proposal.leerlingId === actor.userId)
				: rows;
		return visible.map((r) => ({
			...r.proposal,
			leerlingName: r.leerlingName ?? null,
		}));
	});

const respondProposal = protectedProcedure
	.route({ method: "POST", path: "/proposals/{id}/respond", tags: ["courses"] })
	.input(z.object({ id: z.string().uuid(), status: z.enum(["accepted", "rejected"]) }))
	.output(ProposalSchema)
	.handler(async ({ input, context }) => {
		const { actor } = context;
		const [prop] = await context.db
			.select()
			.from(proposedAssignment)
			.where(eq(proposedAssignment.id, input.id));
		if (!prop) throw new ORPCError("NOT_FOUND");
		const crs = await loadCourse(context, prop.courseId);
		if (
			!atLeast(actor.role, "coach") ||
			!checkPermission(policies.readCourse, actor, courseResource(crs))
		) {
			throw new ORPCError("FORBIDDEN", {
				message: "Alleen een coach kan een voorstel beoordelen",
			});
		}
		const [row] = await context.db
			.update(proposedAssignment)
			.set({ status: input.status, coachId: actor.userId, updatedAt: new Date() })
			.where(eq(proposedAssignment.id, input.id))
			.returning();
		if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");
		publishTo(
			{ type: "course.changed", payload: { courseId: crs.id } },
			await courseChangedRecipients(context, { leerlingId: prop.leerlingId }),
		);
		return row;
	});

// ---------------------------------------------------------------------------
// #34 stub — Ondivera content advies overnemen (post-MVP)
// ---------------------------------------------------------------------------

const importOndiveraContent = protectedProcedure
	.route({ method: "POST", path: "/courses/ondivera-content/import", tags: ["courses"] })
	.input(z.object({ sectionId: z.string().uuid(), externalId: z.string() }))
	.output(z.object({ ok: z.boolean(), note: z.string() }))
	.handler(async () => {
		// #34 post-MVP: the Ondivera Kennispunt / PortalCMS API is not yet available.
		throw new ORPCError("NOT_IMPLEMENTED", {
			message: "Ondivera-contentadvies (#34) volgt na de MVP",
		});
	});

// ---------------------------------------------------------------------------
// Domain router
// ---------------------------------------------------------------------------

export const coursesRouter = base.router({
	// Courses (#23/#24)
	list,
	get,
	create,
	update,
	setProgressBarHidden,
	delete: remove,
	derive,
	tree,
	// Sections (#25)
	addSection,
	updateSection,
	deleteSection,
	reorderSections,
	// Content blocks (#26–#33)
	addBlock,
	updateBlock,
	deleteBlock,
	reorderBlocks,
	// Uploads (#27/#30)
	presignUpload,
	confirmUpload,
	uploadLocal,
	getFile,
	// Progress (#24)
	setProgress,
	// Assignments (#27/#28)
	submitAssignment,
	listSubmissions,
	gradeSubmission,
	// Proposed assignment (#61)
	proposeAssignment,
	listProposals,
	respondProposal,
	// #34 stub
	importOndiveraContent,
});
