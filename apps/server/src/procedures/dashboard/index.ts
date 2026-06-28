import {
	coachAssignment,
	contentBlock,
	contentProgress,
	conversation,
	conversationMember,
	course,
	courseSection,
	formAnswer,
	formSubmission,
	learningPreferenceLabel,
	task,
	user,
} from "@incluvo/drizzle/schema";
import { isSuperadmin, policies, sameTenant } from "@incluvo/permissions";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
	type AuthedContext,
	base,
	ownTenant,
	protectedProcedure,
	withPolicy,
} from "../base";

/**
 * Coach dashboard domain (backlog #42–#44).
 *
 * Read-only aggregations for a coach over the leerlingen assigned to them
 * (`coach_assignment`, same tenant):
 *   - `overview` (#42): one row per assigned leerling with coachplan status,
 *     last activity, task progress, an aandacht-indicatie and quick-action
 *     targets (chat conversation, plan link);
 *   - `quickpanel` (#43): per-leerling leervoorkeuren, today's tasks and active
 *     courses with progress;
 *   - `profile` (#44): the above plus recent submissions and assignments.
 *
 * Gating: every procedure is coach+ (`policies.readUsers`, tenant-scoped) and
 * each handler re-asserts the leerling is assigned to *this* coach within the
 * tenant (`assertAssigned`), so a coach can never reach an unassigned or
 * cross-tenant leerling. The superadmin (Ondivera) is exempt from the
 * assignment check but still tenant-true everywhere via `sameTenant`.
 *
 * Courses (Epic 4) may be built in parallel; this router queries the course
 * tables directly and defends against an empty/absent dataset (optional rows,
 * empty arrays) rather than calling `orpc.courses.*`.
 */

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

/** Coachplan status surfaced to the coach UI. */
const PlanStatus = z.enum([
	"niet_ingevuld", // no submission yet
	"draft", // leerling still filling
	"submitted", // sent, needs review
	"coach_review", // coach working on it
	"shared_with_leerling", // offered back
	"completed",
]);

const PlanSummarySchema = z.object({
	/** Coarse status for the badge. */
	status: PlanStatus,
	/** Latest submission id (for the "Naar plan" link), if any. */
	submissionId: z.string().nullable(),
	/** Number of answers flagged "bespreken met coach" (#12). */
	discussCount: z.number().int(),
	/** When the latest submission was submitted, if at all. */
	submittedAt: z.date().nullable(),
	updatedAt: z.date().nullable(),
});

const TaskProgressSchema = z.object({
	open: z.number().int(),
	done: z.number().int(),
	overdue: z.number().int(),
});

const LeerlingRefSchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string(),
});

const OverviewRowSchema = z.object({
	leerling: LeerlingRefSchema,
	plan: PlanSummarySchema,
	tasks: TaskProgressSchema,
	/** Most recent signal across plan/task/course activity. */
	lastActivityAt: z.date().nullable(),
	/** True when this leerling needs the coach's attention (#42). */
	aandacht: z.boolean(),
	/** Human-readable reasons behind `aandacht` (Dutch, for the UI). */
	aandachtRedenen: z.array(z.string()),
	/** Quick-action targets (#42 snelacties). */
	snelacties: z.object({
		/** Existing 1:1 conversation id, if one exists (else start one client-side). */
		conversationId: z.string().nullable(),
		/** Latest plan submission to open, if any. */
		planSubmissionId: z.string().nullable(),
	}),
});

const CourseProgressSchema = z.object({
	id: z.string(),
	title: z.string(),
	/** 0–100 over content blocks that count for progress (#24). */
	progress: z.number().int(),
	blocksDone: z.number().int(),
	blocksTotal: z.number().int(),
});

const TaskLineSchema = z.object({
	id: z.string(),
	title: z.string(),
	dueAt: z.date().nullable(),
	done: z.boolean(),
	overdue: z.boolean(),
});

const QuickpanelSchema = z.object({
	leerling: LeerlingRefSchema,
	leervoorkeuren: z.array(z.string()),
	tasksToday: z.array(TaskLineSchema),
	courses: z.array(CourseProgressSchema),
	plan: PlanSummarySchema,
});

const SubmissionLineSchema = z.object({
	id: z.string(),
	status: z.string(),
	submittedAt: z.date().nullable(),
	updatedAt: z.date(),
	discussCount: z.number().int(),
});

const AssignmentLineSchema = z.object({
	coachId: z.string(),
	coachName: z.string(),
	taskListHidden: z.boolean(),
	createdAt: z.date(),
});

const ProfileSchema = z.object({
	leerling: LeerlingRefSchema,
	leervoorkeuren: z.array(z.string()),
	plan: PlanSummarySchema,
	tasks: TaskProgressSchema,
	tasksToday: z.array(TaskLineSchema),
	courses: z.array(CourseProgressSchema),
	recentSubmissions: z.array(SubmissionLineSchema),
	assignments: z.array(AssignmentLineSchema),
	lastActivityAt: z.date().nullable(),
	aandacht: z.boolean(),
	aandachtRedenen: z.array(z.string()),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RECENT_ACTIVITY_DAYS = 7;

function daysAgo(n: number): Date {
	const d = new Date();
	d.setDate(d.getDate() - n);
	return d;
}

/** Map a raw submission status onto the coarse PlanStatus used by the UI. */
function planStatusFor(
	row: typeof formSubmission.$inferSelect | undefined,
): z.infer<typeof PlanStatus> {
	if (!row) return "niet_ingevuld";
	switch (row.status) {
		case "draft":
			return "draft";
		case "submitted":
			return "submitted";
		case "coach_review":
			return "coach_review";
		case "shared_with_leerling":
			return "shared_with_leerling";
		case "completed":
			return "completed";
		default:
			return "niet_ingevuld";
	}
}

/**
 * Assert the leerling is assigned to this coach within the tenant. Loads the
 * leerling row so cross-tenant access is rejected even for the superadmin's
 * own-tenant safety, then (for non-superadmins) requires a `coach_assignment`
 * linking actor→leerling. Returns the leerling row.
 */
async function assertAssigned(context: AuthedContext, leerlingId: string) {
	const { actor } = context;
	const [leerling] = await context.db
		.select({
			id: user.id,
			name: user.name,
			email: user.email,
			organizationId: user.organizationId,
		})
		.from(user)
		.where(eq(user.id, leerlingId));
	if (!leerling) throw new ORPCError("NOT_FOUND");
	if (!sameTenant(actor, leerling)) throw new ORPCError("FORBIDDEN");
	if (!isSuperadmin(actor.role)) {
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
	return leerling;
}

/** Latest submission (any status) for a leerling, with its discuss-flag count. */
async function latestPlan(
	context: AuthedContext,
	leerlingId: string,
): Promise<z.infer<typeof PlanSummarySchema>> {
	const [sub] = await context.db
		.select()
		.from(formSubmission)
		.where(eq(formSubmission.leerlingId, leerlingId))
		.orderBy(desc(formSubmission.updatedAt))
		.limit(1);
	let discussCount = 0;
	if (sub) {
		const flags = await context.db
			.select({ id: formAnswer.id })
			.from(formAnswer)
			.where(
				and(
					eq(formAnswer.submissionId, sub.id),
					eq(formAnswer.discussWithCoach, true),
				),
			);
		discussCount = flags.length;
	}
	return {
		status: planStatusFor(sub),
		submissionId: sub?.id ?? null,
		discussCount,
		submittedAt: sub?.submittedAt ?? null,
		updatedAt: sub?.updatedAt ?? null,
	};
}

/** Open/done/overdue task counts for a leerling. */
async function taskProgress(
	context: AuthedContext,
	leerlingId: string,
): Promise<{
	progress: z.infer<typeof TaskProgressSchema>;
	lastTouched: Date | null;
}> {
	const rows = await context.db
		.select({
			done: task.done,
			dueAt: task.dueAt,
			updatedAt: task.updatedAt,
		})
		.from(task)
		.where(eq(task.leerlingId, leerlingId));
	const now = new Date();
	let open = 0;
	let done = 0;
	let overdue = 0;
	let lastTouched: Date | null = null;
	for (const r of rows) {
		if (r.done) done++;
		else {
			open++;
			if (r.dueAt && r.dueAt < now) overdue++;
		}
		if (!lastTouched || r.updatedAt > lastTouched) lastTouched = r.updatedAt;
	}
	return { progress: { open, done, overdue }, lastTouched };
}

/** Today's (or pinned / overdue) open tasks for a leerling. */
async function tasksTodayFor(
	context: AuthedContext,
	leerlingId: string,
): Promise<z.infer<typeof TaskLineSchema>[]> {
	const rows = await context.db
		.select({
			id: task.id,
			title: task.title,
			dueAt: task.dueAt,
			done: task.done,
			pinnedForToday: task.pinnedForToday,
		})
		.from(task)
		.where(eq(task.leerlingId, leerlingId));
	const now = new Date();
	const startOfDay = new Date(now);
	startOfDay.setHours(0, 0, 0, 0);
	const endOfDay = new Date(startOfDay);
	endOfDay.setDate(endOfDay.getDate() + 1);
	return rows
		.filter(
			(r) =>
				!r.done &&
				(r.pinnedForToday ||
					(r.dueAt !== null && r.dueAt < endOfDay)),
		)
		.map((r) => ({
			id: r.id,
			title: r.title,
			dueAt: r.dueAt,
			done: r.done,
			overdue: r.dueAt !== null && r.dueAt < now,
		}))
		.sort((a, b) => (a.dueAt?.getTime() ?? 0) - (b.dueAt?.getTime() ?? 0));
}

/**
 * Active courses for a leerling with progress over content blocks. A course is
 * "active" for a leerling when it is their `student_execution` course, or when
 * it carries content-progress rows for them. Defends against the courses domain
 * being empty (returns []).
 */
async function coursesFor(
	context: AuthedContext,
	leerlingId: string,
): Promise<{
	courses: z.infer<typeof CourseProgressSchema>[];
	lastTouched: Date | null;
}> {
	let lastTouched: Date | null = null;
	try {
		const execCourses = await context.db
			.select({ id: course.id, title: course.title })
			.from(course)
			.where(eq(course.leerlingId, leerlingId));
		if (execCourses.length === 0) {
			return { courses: [], lastTouched: null };
		}
		const courseIds = execCourses.map((c) => c.id);

		// All counting content blocks for these courses, in one pass.
		const blocks = await context.db
			.select({
				blockId: contentBlock.id,
				courseId: courseSection.courseId,
				counts: contentBlock.countsForProgress,
			})
			.from(contentBlock)
			.innerJoin(
				courseSection,
				eq(courseSection.id, contentBlock.sectionId),
			)
			.where(inArray(courseSection.courseId, courseIds));

		const blockToCourse = new Map<string, string>();
		const totalByCourse = new Map<string, number>();
		const countingBlockIds: string[] = [];
		for (const b of blocks) {
			blockToCourse.set(b.blockId, b.courseId);
			if (b.counts) {
				totalByCourse.set(
					b.courseId,
					(totalByCourse.get(b.courseId) ?? 0) + 1,
				);
				countingBlockIds.push(b.blockId);
			}
		}

		const doneByCourse = new Map<string, number>();
		if (countingBlockIds.length) {
			const progressRows = await context.db
				.select({
					contentBlockId: contentProgress.contentBlockId,
					completed: contentProgress.completed,
					updatedAt: contentProgress.updatedAt,
				})
				.from(contentProgress)
				.where(
					and(
						eq(contentProgress.leerlingId, leerlingId),
						inArray(contentProgress.contentBlockId, countingBlockIds),
					),
				);
			for (const p of progressRows) {
				if (!lastTouched || p.updatedAt > lastTouched) {
					lastTouched = p.updatedAt;
				}
				if (p.completed) {
					const cid = blockToCourse.get(p.contentBlockId);
					if (cid) doneByCourse.set(cid, (doneByCourse.get(cid) ?? 0) + 1);
				}
			}
		}

		const courses = execCourses.map((c) => {
			const total = totalByCourse.get(c.id) ?? 0;
			const blocksDone = doneByCourse.get(c.id) ?? 0;
			const progress =
				total > 0 ? Math.round((blocksDone / total) * 100) : 0;
			return {
				id: c.id,
				title: c.title,
				progress,
				blocksDone,
				blocksTotal: total,
			};
		});
		return { courses, lastTouched };
	} catch {
		// Courses domain not ready / schema mismatch — degrade gracefully.
		return { courses: [], lastTouched: null };
	}
}

/** Most recent of a set of timestamps (nulls ignored). */
function mostRecent(...dates: (Date | null)[]): Date | null {
	let max: Date | null = null;
	for (const d of dates) {
		if (d && (!max || d > max)) max = d;
	}
	return max;
}

/**
 * Compute the aandacht-indicatie (#42): a leerling needs attention when they
 * have overdue tasks, unread "bespreken met coach" flags on a submitted plan,
 * or no recent activity at all.
 */
function computeAandacht(args: {
	plan: z.infer<typeof PlanSummarySchema>;
	tasks: z.infer<typeof TaskProgressSchema>;
	lastActivityAt: Date | null;
}): { aandacht: boolean; redenen: string[] } {
	const redenen: string[] = [];
	if (args.tasks.overdue > 0) {
		redenen.push(
			`${args.tasks.overdue} ${args.tasks.overdue === 1 ? "taak" : "taken"} over tijd`,
		);
	}
	if (
		args.plan.discussCount > 0 &&
		(args.plan.status === "submitted" || args.plan.status === "coach_review")
	) {
		redenen.push(
			`${args.plan.discussCount} vraag te bespreken in coachplan`,
		);
	}
	if (args.plan.status === "submitted") {
		redenen.push("Coachplan wacht op beoordeling");
	}
	const recentCutoff = daysAgo(RECENT_ACTIVITY_DAYS);
	if (!args.lastActivityAt || args.lastActivityAt < recentCutoff) {
		redenen.push("Geen recente activiteit");
	}
	return { aandacht: redenen.length > 0, redenen };
}

/** Resolve the existing 1:1 conversation id between coach and leerling, if any. */
async function existingDirectConversation(
	context: AuthedContext,
	coachId: string,
	leerlingId: string,
): Promise<string | null> {
	const mine = await context.db
		.select({ conversationId: conversationMember.conversationId })
		.from(conversationMember)
		.innerJoin(
			conversation,
			eq(conversation.id, conversationMember.conversationId),
		)
		.where(
			and(
				eq(conversationMember.userId, coachId),
				eq(conversation.kind, "direct"),
			),
		);
	const ids = mine.map((r) => r.conversationId);
	if (!ids.length) return null;
	const [shared] = await context.db
		.select({ conversationId: conversationMember.conversationId })
		.from(conversationMember)
		.where(
			and(
				eq(conversationMember.userId, leerlingId),
				inArray(conversationMember.conversationId, ids),
			),
		);
	return shared?.conversationId ?? null;
}

// ---------------------------------------------------------------------------
// overview (#42)
// ---------------------------------------------------------------------------

const overview = protectedProcedure
	.use(withPolicy(policies.readUsers, ownTenant))
	.route({ method: "GET", path: "/dashboard/overview", tags: ["dashboard"] })
	.output(z.array(OverviewRowSchema))
	.handler(async ({ context }) => {
		const { actor } = context;

		// Assigned leerlingen for this coach (superadmin: all in tenant).
		let leerlingRows: {
			id: string;
			name: string;
			email: string;
			organizationId: string | null;
		}[];
		if (isSuperadmin(actor.role)) {
			leerlingRows = await context.db
				.select({
					id: user.id,
					name: user.name,
					email: user.email,
					organizationId: user.organizationId,
				})
				.from(user)
				.where(eq(user.role, "leerling"));
		} else {
			const assigned = await context.db
				.select({
					id: user.id,
					name: user.name,
					email: user.email,
					organizationId: user.organizationId,
				})
				.from(coachAssignment)
				.innerJoin(user, eq(user.id, coachAssignment.leerlingId))
				.where(eq(coachAssignment.coachId, actor.userId));
			leerlingRows = assigned;
		}

		// Defence in depth: never leak cross-tenant leerlingen.
		leerlingRows = leerlingRows.filter((l) => sameTenant(actor, l));

		const rows: z.infer<typeof OverviewRowSchema>[] = [];
		for (const l of leerlingRows) {
			const plan = await latestPlan(context, l.id);
			const { progress, lastTouched: taskTouched } = await taskProgress(
				context,
				l.id,
			);
			const { lastTouched: courseTouched } = await coursesFor(context, l.id);
			const lastActivityAt = mostRecent(
				plan.updatedAt,
				plan.submittedAt,
				taskTouched,
				courseTouched,
			);
			const { aandacht, redenen } = computeAandacht({
				plan,
				tasks: progress,
				lastActivityAt,
			});
			const conversationId = await existingDirectConversation(
				context,
				actor.userId,
				l.id,
			);
			rows.push({
				leerling: { id: l.id, name: l.name, email: l.email },
				plan,
				tasks: progress,
				lastActivityAt,
				aandacht,
				aandachtRedenen: redenen,
				snelacties: {
					conversationId,
					planSubmissionId: plan.submissionId,
				},
			});
		}

		// Attention first, then most recently active.
		rows.sort((a, b) => {
			if (a.aandacht !== b.aandacht) return a.aandacht ? -1 : 1;
			return (
				(b.lastActivityAt?.getTime() ?? 0) -
				(a.lastActivityAt?.getTime() ?? 0)
			);
		});
		return rows;
	});

// ---------------------------------------------------------------------------
// quickpanel (#43)
// ---------------------------------------------------------------------------

/** Leervoorkeur labels for a leerling (latest submission that carries them). */
async function leervoorkeurenFor(
	context: AuthedContext,
	leerlingId: string,
): Promise<string[]> {
	const subs = await context.db
		.select({ id: formSubmission.id })
		.from(formSubmission)
		.where(eq(formSubmission.leerlingId, leerlingId))
		.orderBy(desc(formSubmission.updatedAt));
	for (const s of subs) {
		const labels = await context.db
			.select({ label: learningPreferenceLabel.label })
			.from(learningPreferenceLabel)
			.where(eq(learningPreferenceLabel.submissionId, s.id));
		if (labels.length) return labels.map((l) => l.label);
	}
	return [];
}

const quickpanel = protectedProcedure
	.use(withPolicy(policies.readUsers, ownTenant))
	.route({
		method: "GET",
		path: "/dashboard/quickpanel/{leerlingId}",
		tags: ["dashboard"],
	})
	.input(z.object({ leerlingId: z.string() }))
	.output(QuickpanelSchema)
	.handler(async ({ input, context }) => {
		const leerling = await assertAssigned(context, input.leerlingId);
		const [leervoorkeuren, tasksToday, courseInfo, plan] = await Promise.all([
			leervoorkeurenFor(context, leerling.id),
			tasksTodayFor(context, leerling.id),
			coursesFor(context, leerling.id),
			latestPlan(context, leerling.id),
		]);
		return {
			leerling: {
				id: leerling.id,
				name: leerling.name,
				email: leerling.email,
			},
			leervoorkeuren,
			tasksToday,
			courses: courseInfo.courses,
			plan,
		};
	});

// ---------------------------------------------------------------------------
// profile (#44)
// ---------------------------------------------------------------------------

const profile = protectedProcedure
	.use(withPolicy(policies.readUsers, ownTenant))
	.route({
		method: "GET",
		path: "/dashboard/profile/{leerlingId}",
		tags: ["dashboard"],
	})
	.input(z.object({ leerlingId: z.string() }))
	.output(ProfileSchema)
	.handler(async ({ input, context }) => {
		const leerling = await assertAssigned(context, input.leerlingId);

		const [
			leervoorkeuren,
			plan,
			{ progress, lastTouched: taskTouched },
			tasksToday,
			courseInfo,
		] = await Promise.all([
			leervoorkeurenFor(context, leerling.id),
			latestPlan(context, leerling.id),
			taskProgress(context, leerling.id),
			tasksTodayFor(context, leerling.id),
			coursesFor(context, leerling.id),
		]);

		// Recent submissions (#44) with discuss-flag counts.
		const subRows = await context.db
			.select()
			.from(formSubmission)
			.where(eq(formSubmission.leerlingId, leerling.id))
			.orderBy(desc(formSubmission.updatedAt))
			.limit(10);
		const subIds = subRows.map((s) => s.id);
		const discussRows = subIds.length
			? await context.db
					.select({ submissionId: formAnswer.submissionId })
					.from(formAnswer)
					.where(
						and(
							inArray(formAnswer.submissionId, subIds),
							eq(formAnswer.discussWithCoach, true),
						),
					)
			: [];
		const discussBySub = new Map<string, number>();
		for (const r of discussRows) {
			discussBySub.set(
				r.submissionId,
				(discussBySub.get(r.submissionId) ?? 0) + 1,
			);
		}
		const recentSubmissions = subRows.map((s) => ({
			id: s.id,
			status: s.status,
			submittedAt: s.submittedAt,
			updatedAt: s.updatedAt,
			discussCount: discussBySub.get(s.id) ?? 0,
		}));

		// Coach assignments for this leerling (#44).
		const assignRows = await context.db
			.select({
				coachId: coachAssignment.coachId,
				coachName: user.name,
				taskListHidden: coachAssignment.taskListHidden,
				createdAt: coachAssignment.createdAt,
			})
			.from(coachAssignment)
			.innerJoin(user, eq(user.id, coachAssignment.coachId))
			.where(eq(coachAssignment.leerlingId, leerling.id));

		const lastActivityAt = mostRecent(
			plan.updatedAt,
			plan.submittedAt,
			taskTouched,
			courseInfo.lastTouched,
		);
		const { aandacht, redenen } = computeAandacht({
			plan,
			tasks: progress,
			lastActivityAt,
		});

		return {
			leerling: {
				id: leerling.id,
				name: leerling.name,
				email: leerling.email,
			},
			leervoorkeuren,
			plan,
			tasks: progress,
			tasksToday,
			courses: courseInfo.courses,
			recentSubmissions,
			assignments: assignRows,
			lastActivityAt,
			aandacht,
			aandachtRedenen: redenen,
		};
	});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const dashboardRouter = base.router({
	overview,
	quickpanel,
	profile,
});
