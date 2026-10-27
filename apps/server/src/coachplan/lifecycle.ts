/**
 * The coachplan lifecycle (fix plan 2.1, D2: one living plan with versions).
 *
 * A leerling has one `coachplan`; each `form_submission` is a version of it.
 * A version moves draft → submitted → coach_review → shared_with_leerling and
 * is read-only once shared. Revising the plan starts a new draft version,
 * pre-filled from the current one. The plan's `currentVersionId` is the
 * version the coach last shared: that is "the plan" for courses, dashboard
 * and AI. All status changes go through `transition`, which only succeeds
 * from an allowed status.
 *
 * INC-33: a coach can start a new plan (`startNewPlan`). It becomes the
 * actuele plan; the plan it replaces stays, with all its versions, as history
 * and can no longer change (`assertActueel`). "The leerling's plan" below
 * always means the actuele plan.
 */
import {
	coachplan,
	formAnswer,
	formQuestion,
	formSubmission,
	learningPreferenceLabel,
} from "@incluvo/drizzle/schema";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, inArray, isNotNull, isNull, max, sql } from "drizzle-orm";
import type { Database } from "@incluvo/drizzle";

type Db = Pick<Database, "select" | "insert" | "update" | "delete">;
export type Submission = typeof formSubmission.$inferSelect;
export type Coachplan = typeof coachplan.$inferSelect;
export type Status = Submission["status"];

/** The leerling fills these in. */
export const FILLABLE: readonly Status[] = ["draft"];
/**
 * The leerling may still change their answers (INC-14): while filling in, and
 * after handing in until the coach starts on the coach part or shares the
 * plan — both move the version on from `submitted`.
 */
export const LEERLING_EDITABLE: readonly Status[] = ["draft", "submitted"];
/** The coach works on these (coach answers, leervoorkeuren, sharing). */
export const REVIEWABLE: readonly Status[] = ["submitted", "coach_review"];
/** Shared with the leerling: read-only. `completed` is legacy. */
export const SHARED: readonly Status[] = ["shared_with_leerling", "completed"];

/** The leerling's actuele plan, or null before they have one. */
export async function actuelePlan(db: Db, leerlingId: string): Promise<Coachplan | null> {
	const [plan] = await db
		.select()
		.from(coachplan)
		.where(and(eq(coachplan.leerlingId, leerlingId), isNull(coachplan.replacedAt)))
		.limit(1);
	return plan ?? null;
}

/** The leerling's actuele plan, created on first use. */
export async function ensurePlan(
	db: Db,
	organizationId: string,
	leerlingId: string,
): Promise<Coachplan> {
	await db
		.insert(coachplan)
		.values({ organizationId, leerlingId })
		.onConflictDoNothing({
			target: [coachplan.organizationId, coachplan.leerlingId],
			where: isNull(coachplan.replacedAt),
		});
	const plan = await actuelePlan(db, leerlingId);
	if (!plan) throw new ORPCError("INTERNAL_SERVER_ERROR");
	return plan;
}

/** Versions of the actuele plan only. */
const inActuelePlan = (leerlingId: string) =>
	inArray(
		formSubmission.coachplanId,
		sql`(select ${coachplan.id} from ${coachplan} where ${coachplan.leerlingId} = ${leerlingId} and ${coachplan.replacedAt} is null)`,
	);

/** The newest version of the leerling's (actuele) plan, or null. */
export async function latestVersion(db: Db, leerlingId: string): Promise<Submission | null> {
	const [row] = await db
		.select()
		.from(formSubmission)
		.where(and(eq(formSubmission.leerlingId, leerlingId), inActuelePlan(leerlingId)))
		.orderBy(desc(formSubmission.version))
		.limit(1);
	return row ?? null;
}

/** The version the coach last shared of the actuele plan, or null. */
export async function currentVersion(db: Db, leerlingId: string): Promise<Submission | null> {
	const [row] = await db
		.select({ submission: formSubmission })
		.from(coachplan)
		.innerJoin(formSubmission, eq(formSubmission.id, coachplan.currentVersionId))
		.where(and(eq(coachplan.leerlingId, leerlingId), isNull(coachplan.replacedAt)))
		.limit(1);
	return row?.submission ?? null;
}

/**
 * The version to show a coach for this leerling: the newest one of the
 * actuele plan the leerling has handed in (so a revision still being drafted
 * doesn't hide the plan), else the newest draft.
 */
export async function versionForCoach(db: Db, leerlingId: string): Promise<Submission | null> {
	const [handedIn] = await db
		.select()
		.from(formSubmission)
		.where(
			and(
				eq(formSubmission.leerlingId, leerlingId),
				inActuelePlan(leerlingId),
				sql`${formSubmission.status} <> 'draft'`,
			),
		)
		.orderBy(desc(formSubmission.version))
		.limit(1);
	return handedIn ?? (await latestVersion(db, leerlingId));
}

/**
 * Leervoorkeuren of the plan the coach shared last; [] before the first share.
 * A new plan that hasn't been shared yet doesn't empty the leeromgeving: until
 * then the labels of the previous plan apply.
 */
export async function currentLeervoorkeuren(db: Db, leerlingId: string): Promise<string[]> {
	const [row] = await db
		.select({ submission: formSubmission })
		.from(coachplan)
		.innerJoin(formSubmission, eq(formSubmission.id, coachplan.currentVersionId))
		.where(and(eq(coachplan.leerlingId, leerlingId), isNotNull(coachplan.currentVersionId)))
		.orderBy(desc(coachplan.createdAt))
		.limit(1);
	const current = row?.submission;
	if (!current) return [];
	const rows = await db
		.select({ label: learningPreferenceLabel.label })
		.from(learningPreferenceLabel)
		.where(eq(learningPreferenceLabel.submissionId, current.id));
	return rows.map((r) => r.label);
}

/**
 * Start version n+1 as a draft. With `copyFrom`, the answers (leerling and
 * coach part) and leervoorkeuren carry over, so a revision edits the plan
 * rather than starting from scratch; "afgestemd met ouders" does not, because
 * the revised plan hasn't been discussed yet. When the new version uses a
 * newer form, answers move to the question with the same `key`; answers to
 * questions the new form dropped are left behind (they stay in the old
 * version).
 */
export async function createVersion(
	db: Db,
	plan: Coachplan,
	templateId: string,
	copyFrom?: Submission,
): Promise<Submission> {
	const [latest] = await db
		.select({ version: max(formSubmission.version) })
		.from(formSubmission)
		.where(eq(formSubmission.coachplanId, plan.id));
	const [created] = await db
		.insert(formSubmission)
		.values({
			coachplanId: plan.id,
			version: (latest?.version ?? 0) + 1,
			templateId,
			organizationId: plan.organizationId,
			leerlingId: plan.leerlingId,
			coachId: copyFrom?.coachId ?? null,
			status: "draft",
		})
		.onConflictDoNothing()
		.returning();
	if (!created) {
		// Another request created this version number first (two tabs).
		const [now] = await db
			.select()
			.from(formSubmission)
			.where(eq(formSubmission.coachplanId, plan.id))
			.orderBy(desc(formSubmission.version))
			.limit(1);
		if (now?.status === "draft") return now;
		throw new ORPCError("CONFLICT", { message: "Probeer het opnieuw" });
	}
	if (copyFrom) {
		const answers = await db
			.select()
			.from(formAnswer)
			.where(eq(formAnswer.submissionId, copyFrom.id));
		const toQuestion = await questionMap(db, copyFrom.templateId, templateId);
		const carried = answers.filter((a) => toQuestion.has(a.questionId));
		if (carried.length) {
			await db.insert(formAnswer).values(
				carried.map((a) => ({
					submissionId: created.id,
					questionId: toQuestion.get(a.questionId)!,
					value: a.value,
					valueJson: a.valueJson,
					discussWithCoach: a.discussWithCoach,
					deliberatelySkipped: a.deliberatelySkipped,
				})),
			);
		}
		const labels = await db
			.select({ label: learningPreferenceLabel.label })
			.from(learningPreferenceLabel)
			.where(eq(learningPreferenceLabel.submissionId, copyFrom.id));
		if (labels.length) {
			await db
				.insert(learningPreferenceLabel)
				.values(labels.map((l) => ({ submissionId: created.id, label: l.label })));
		}
	}
	return created;
}

/** Question id in `from` → the question with the same key in `to`. */
async function questionMap(db: Db, fromTemplateId: string, toTemplateId: string) {
	const rows = await db
		.select({ id: formQuestion.id, key: formQuestion.key, templateId: formQuestion.templateId })
		.from(formQuestion)
		.where(inArray(formQuestion.templateId, [fromTemplateId, toTemplateId]));
	const byKey = new Map(rows.filter((r) => r.templateId === toTemplateId).map((r) => [r.key, r.id]));
	const map = new Map<string, string>();
	for (const r of rows) {
		if (r.templateId !== fromTemplateId) continue;
		const target = byKey.get(r.key);
		if (target) map.set(r.id, target);
	}
	return map;
}

const MESSAGES: Partial<Record<Status, string>> = {
	draft: "Dit plan is nog niet ingeleverd",
	submitted: "Dit plan is al ingeleverd",
	coach_review: "Dit plan is al ingeleverd",
	shared_with_leerling: "Dit plan is al gedeeld en kan niet meer worden gewijzigd",
	completed: "Dit plan is al gedeeld en kan niet meer worden gewijzigd",
};

/** CONFLICT unless the version is in one of `allowed`. */
export function assertStatus(sub: Submission, allowed: readonly Status[]): void {
	if (!allowed.includes(sub.status)) {
		throw new ORPCError("CONFLICT", {
			message: MESSAGES[sub.status] ?? "Dit kan niet in deze fase van het plan",
		});
	}
}

/**
 * Move a version to `to`, only if it is still in one of `from` (a guarded
 * UPDATE, so two concurrent requests can't both make the same move).
 */
export async function transition(
	db: Db,
	submissionId: string,
	from: readonly Status[],
	to: Status,
	extra: Partial<Pick<Submission, "coachId" | "submittedAt">> = {},
): Promise<Submission> {
	const [row] = await db
		.update(formSubmission)
		.set({ status: to, updatedAt: new Date(), ...extra })
		.where(
			and(
				eq(formSubmission.id, submissionId),
				inArray(formSubmission.status, [...from]),
				// A replaced plan stays as it was (INC-33).
				inArray(
					formSubmission.coachplanId,
					sql`(select ${coachplan.id} from ${coachplan} where ${coachplan.replacedAt} is null)`,
				),
			),
		)
		.returning();
	if (!row) {
		const [now] = await db.select().from(formSubmission).where(eq(formSubmission.id, submissionId));
		if (!now) throw new ORPCError("NOT_FOUND");
		await assertActueel(db, now);
		assertStatus(now, from);
		throw new ORPCError("CONFLICT");
	}
	if (SHARED.includes(to)) {
		await db
			.update(coachplan)
			.set({ currentVersionId: row.id, updatedAt: new Date() })
			.where(eq(coachplan.id, row.coachplanId));
	}
	return row;
}

/** Someone else (or a second click) started a new plan first. */
const alreadyAssigned = () =>
	new ORPCError("CONFLICT", {
		message: "Er is net al een nieuw coachplan toegewezen. Bekijk de plannen opnieuw.",
	});

const REPLACED_MESSAGE =
	"Dit is een eerder coachplan. Er is een nieuw plan voor in de plaats gekomen, dus dit plan kan niet meer veranderen.";

/** CONFLICT when the version belongs to a plan that a newer plan replaced. */
export async function assertActueel(db: Db, sub: Pick<Submission, "coachplanId">): Promise<void> {
	const [plan] = await db
		.select({ replacedAt: coachplan.replacedAt })
		.from(coachplan)
		.where(eq(coachplan.id, sub.coachplanId));
	if (plan?.replacedAt) throw new ORPCError("CONFLICT", { message: REPLACED_MESSAGE });
}

/**
 * INC-33: start a new, empty plan for the leerling on `templateId`; it becomes
 * the actuele plan. `replacesPlanId` is the actuele plan the coach saw (null
 * when the leerling had none): if that is no longer the actuele plan — a
 * second click, another tab, the other coach — nothing changes (CONFLICT), so
 * one choice never makes two plans. Run it in a transaction: the replaced
 * plan and the new one commit together or not at all.
 */
export async function startNewPlan(
	db: Db,
	input: {
		organizationId: string;
		leerlingId: string;
		templateId: string;
		assignedById: string;
		replacesPlanId: string | null;
	},
): Promise<{ plan: Coachplan; version: Submission }> {
	if (input.replacesPlanId) {
		// An answer being saved on the old plan finishes first; one that comes
		// after sees the plan replaced and is refused (saveAnswer locks too).
		await db
			.select({ id: formSubmission.id })
			.from(formSubmission)
			.where(eq(formSubmission.coachplanId, input.replacesPlanId))
			.for("update");
		// Row lock: a concurrent assignment waits here, then finds the plan
		// already replaced.
		const [replaced] = await db
			.update(coachplan)
			.set({ replacedAt: new Date(), updatedAt: new Date() })
			.where(
				and(
					eq(coachplan.id, input.replacesPlanId),
					eq(coachplan.leerlingId, input.leerlingId),
					isNull(coachplan.replacedAt),
				),
			)
			.returning({ id: coachplan.id });
		if (!replaced) throw alreadyAssigned();
	}
	const [plan] = await db
		.insert(coachplan)
		.values({
			organizationId: input.organizationId,
			leerlingId: input.leerlingId,
			assignedById: input.assignedById,
		})
		.onConflictDoNothing({
			target: [coachplan.organizationId, coachplan.leerlingId],
			where: isNull(coachplan.replacedAt),
		})
		.returning();
	// The leerling already has an actuele plan the coach didn't see.
	if (!plan) throw alreadyAssigned();
	const version = await createVersion(db, plan, input.templateId);
	return { plan, version };
}
