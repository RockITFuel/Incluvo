/**
 * Where a notification leads (INC-30). Every notification points loosely at
 * the row it is about (`entityType`/`entityId`); this turns that into a place
 * in the app for the person opening it, after checking the row still exists
 * and they may still see it. The web maps a target onto a route in one place
 * (components/notifications/notification-target.ts).
 */
import type { Notification } from "@incluvo/drizzle/schema";
import {
	assignment,
	assignmentSubmission,
	contentBlock,
	conversationMember,
	course,
	courseSection,
	formSubmission,
	task,
} from "@incluvo/drizzle/schema";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireLeerlingAccess } from "../access";
import type { AuthedContext } from "../procedures/base";

export const NotificationTargetSchema = z.discriminatedUnion("kind", [
	/** A coach opens a version of a leerling's plan. */
	z.object({ kind: z.literal("coachplan"), submissionId: z.string() }),
	/** A leerling opens their own plan; `planId` picks an earlier plan. */
	z.object({ kind: z.literal("mijn_plan"), planId: z.string() }),
	/** A takenlijst: the leerling's own (`leerlingId` null) or one a coach manages. */
	z.object({
		kind: z.literal("taken"),
		leerlingId: z.string().nullable(),
		taskId: z.string().nullable(),
	}),
	/** A course, on a tab, with the focus on a block (or the proposals). */
	z.object({
		kind: z.literal("cursus"),
		courseId: z.string(),
		tab: z.enum(["leren", "beoordelen"]),
		blockId: z.string().nullable(),
	}),
	z.object({ kind: z.literal("chat"), conversationId: z.string() }),
	/** The notification is about nothing to open (e.g. a general message). */
	z.object({ kind: z.literal("none") }),
	/** It was about something that is gone or no longer yours to see. */
	z.object({ kind: z.literal("unavailable"), message: z.string() }),
]);
export type NotificationTarget = z.infer<typeof NotificationTargetSchema>;

const GONE: Record<string, string> = {
	form_submission: "Dit coachplan bestaat niet meer, of je hebt er geen toegang meer toe.",
	task: "Deze taak bestaat niet meer, of je hebt er geen toegang meer toe.",
	assignment_submission: "Deze opdracht bestaat niet meer, of je hebt er geen toegang meer toe.",
	course: "Deze cursus bestaat niet meer, of je hebt er geen toegang meer toe.",
	conversation: "Dit gesprek bestaat niet meer, of je bent er geen deelnemer meer van.",
};

/** Thrown inside a resolver when the row is gone or out of reach. */
class Unavailable extends Error {}

/** The target for this notification, as seen by the actor (its recipient). */
export async function notificationTarget(
	context: AuthedContext,
	n: Pick<Notification, "type" | "entityType" | "entityId">,
): Promise<NotificationTarget> {
	// The daily "taken voor vandaag" is about the whole list.
	if (n.type === "task_due_today" && !n.entityId) {
		return { kind: "taken", leerlingId: null, taskId: null };
	}
	if (!n.entityType || !n.entityId) return { kind: "none" };
	const resolve = RESOLVERS[n.entityType];
	if (!resolve) return { kind: "none" };
	try {
		return await resolve(context, n.entityId);
	} catch (error) {
		const refused =
			error instanceof Unavailable ||
			(error instanceof ORPCError && ["FORBIDDEN", "NOT_FOUND"].includes(error.code));
		if (!refused) throw error;
		return {
			kind: "unavailable",
			message: GONE[n.entityType] ?? "Dit onderdeel bestaat niet meer.",
		};
	}
}

/** Ids are uuids in the database; anything else can't exist. */
const UUID = z.string().uuid();
function uuid(id: string): string {
	if (!UUID.safeParse(id).success) throw new Unavailable();
	return id;
}

type Resolver = (context: AuthedContext, id: string) => Promise<NotificationTarget>;

const RESOLVERS: Record<string, Resolver> = {
	async form_submission(context, id) {
		const [sub] = await context.db
			.select({
				id: formSubmission.id,
				leerlingId: formSubmission.leerlingId,
				coachplanId: formSubmission.coachplanId,
			})
			.from(formSubmission)
			.where(eq(formSubmission.id, uuid(id)));
		if (!sub) throw new Unavailable();
		if (sub.leerlingId === context.actor.userId) {
			return { kind: "mijn_plan", planId: sub.coachplanId };
		}
		// Coaches only reach the plans of leerlingen they coach.
		if (context.actor.role === "leerling") throw new Unavailable();
		await requireLeerlingAccess(context, sub.leerlingId);
		return { kind: "coachplan", submissionId: sub.id };
	},

	async task(context, id) {
		const [row] = await context.db
			.select({ id: task.id, leerlingId: task.leerlingId })
			.from(task)
			.where(eq(task.id, uuid(id)));
		if (!row) throw new Unavailable();
		if (row.leerlingId === context.actor.userId) {
			return { kind: "taken", leerlingId: null, taskId: row.id };
		}
		if (context.actor.role === "leerling") throw new Unavailable();
		await requireLeerlingAccess(context, row.leerlingId);
		return { kind: "taken", leerlingId: row.leerlingId, taskId: row.id };
	},

	async assignment_submission(context, id) {
		const [row] = await context.db
			.select({
				leerlingId: assignmentSubmission.leerlingId,
				blockId: assignment.contentBlockId,
				courseId: course.id,
			})
			.from(assignmentSubmission)
			.innerJoin(assignment, eq(assignment.id, assignmentSubmission.assignmentId))
			.innerJoin(contentBlock, eq(contentBlock.id, assignment.contentBlockId))
			.innerJoin(courseSection, eq(courseSection.id, contentBlock.sectionId))
			.innerJoin(course, eq(course.id, courseSection.courseId))
			.where(eq(assignmentSubmission.id, uuid(id)));
		if (!row) throw new Unavailable();
		// The leerling sees the grade at the opdracht; a coach grades it under
		// Beoordelen.
		if (row.leerlingId === context.actor.userId) {
			return { kind: "cursus", courseId: row.courseId, tab: "leren", blockId: row.blockId };
		}
		if (context.actor.role === "leerling") throw new Unavailable();
		await requireLeerlingAccess(context, row.leerlingId);
		return { kind: "cursus", courseId: row.courseId, tab: "beoordelen", blockId: row.blockId };
	},

	async course(context, id) {
		const [row] = await context.db
			.select({ id: course.id, kind: course.kind, leerlingId: course.leerlingId })
			.from(course)
			.where(eq(course.id, uuid(id)));
		if (!row) throw new Unavailable();
		// Course notifications are about a leerling's own course (a proposal).
		if (row.kind !== "student_execution" || !row.leerlingId) throw new Unavailable();
		if (row.leerlingId !== context.actor.userId) {
			if (context.actor.role === "leerling") throw new Unavailable();
			await requireLeerlingAccess(context, row.leerlingId);
		}
		return { kind: "cursus", courseId: row.id, tab: "leren", blockId: "voorstellen" };
	},

	async conversation(context, id) {
		const [member] = await context.db
			.select({ id: conversationMember.id })
			.from(conversationMember)
			.where(
				and(
					eq(conversationMember.conversationId, uuid(id)),
					eq(conversationMember.userId, context.actor.userId),
				),
			);
		if (!member) throw new Unavailable();
		return { kind: "chat", conversationId: id };
	},
};
