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
 */
import {
	coachplan,
	formAnswer,
	formSubmission,
	learningPreferenceLabel,
} from "@incluvo/drizzle/schema";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@incluvo/drizzle";

type Db = Pick<Database, "select" | "insert" | "update" | "delete">;
export type Submission = typeof formSubmission.$inferSelect;
export type Coachplan = typeof coachplan.$inferSelect;
export type Status = Submission["status"];

/** The leerling fills these in. */
export const FILLABLE: readonly Status[] = ["draft"];
/** The coach works on these (coach answers, leervoorkeuren, sharing). */
export const REVIEWABLE: readonly Status[] = ["submitted", "coach_review"];
/** Shared with the leerling: read-only. `completed` is legacy. */
export const SHARED: readonly Status[] = ["shared_with_leerling", "completed"];

/** The leerling's coachplan, created on first use. */
export async function ensurePlan(
	db: Db,
	organizationId: string,
	leerlingId: string,
): Promise<Coachplan> {
	await db
		.insert(coachplan)
		.values({ organizationId, leerlingId })
		.onConflictDoNothing();
	const [plan] = await db
		.select()
		.from(coachplan)
		.where(and(eq(coachplan.organizationId, organizationId), eq(coachplan.leerlingId, leerlingId)));
	if (!plan) throw new ORPCError("INTERNAL_SERVER_ERROR");
	return plan;
}

/** The newest version of a leerling's plan, or null. */
export async function latestVersion(db: Db, leerlingId: string): Promise<Submission | null> {
	const [row] = await db
		.select()
		.from(formSubmission)
		.where(eq(formSubmission.leerlingId, leerlingId))
		.orderBy(desc(formSubmission.version))
		.limit(1);
	return row ?? null;
}

/** The version the coach last shared ("the plan"), or null. */
export async function currentVersion(db: Db, leerlingId: string): Promise<Submission | null> {
	const [row] = await db
		.select({ submission: formSubmission })
		.from(coachplan)
		.innerJoin(formSubmission, eq(formSubmission.id, coachplan.currentVersionId))
		.where(eq(coachplan.leerlingId, leerlingId))
		.limit(1);
	return row?.submission ?? null;
}

/**
 * The version to show a coach for this leerling: the newest one the leerling
 * has handed in (so a revision still being drafted doesn't hide the plan),
 * else the newest draft.
 */
export async function versionForCoach(db: Db, leerlingId: string): Promise<Submission | null> {
	const [handedIn] = await db
		.select()
		.from(formSubmission)
		.where(and(eq(formSubmission.leerlingId, leerlingId), sql`${formSubmission.status} <> 'draft'`))
		.orderBy(desc(formSubmission.version))
		.limit(1);
	return handedIn ?? (await latestVersion(db, leerlingId));
}

/** Leervoorkeuren of the current (shared) plan; [] before the first share. */
export async function currentLeervoorkeuren(db: Db, leerlingId: string): Promise<string[]> {
	const current = await currentVersion(db, leerlingId);
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
 * the revised plan hasn't been discussed yet.
 */
export async function createVersion(
	db: Db,
	plan: Coachplan,
	templateId: string,
	copyFrom?: Submission,
): Promise<Submission> {
	const latest = await latestVersion(db, plan.leerlingId);
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
		const now = await latestVersion(db, plan.leerlingId);
		if (now?.status === "draft") return now;
		throw new ORPCError("CONFLICT", { message: "Probeer het opnieuw" });
	}
	if (copyFrom) {
		const answers = await db
			.select()
			.from(formAnswer)
			.where(eq(formAnswer.submissionId, copyFrom.id));
		if (answers.length) {
			await db.insert(formAnswer).values(
				answers.map((a) => ({
					submissionId: created.id,
					questionId: a.questionId,
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
		.where(and(eq(formSubmission.id, submissionId), inArray(formSubmission.status, [...from])))
		.returning();
	if (!row) {
		const [now] = await db.select().from(formSubmission).where(eq(formSubmission.id, submissionId));
		if (!now) throw new ORPCError("NOT_FOUND");
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
