/**
 * Daily "taken voor vandaag" notification (backlog #3, `task_due_today`).
 * From 07:00 Dutch time, each leerling with open tasks due today (or already
 * overdue) gets one notification per day. Not for a leerling whose list a
 * coach has hidden, nor for an archived school.
 */
import { db as rootDb, type Database } from "@incluvo/drizzle";
import { coachAssignment, notification, organization, task, user } from "@incluvo/drizzle/schema";
import { and, count, eq, gte, isNull, lt, notExists, or } from "drizzle-orm";
import { dutchDay } from "../time";
import { notify } from "./notify";

const SEND_FROM_HOUR = 7;

/** Send today's notifications that haven't gone out yet. Returns how many were sent. */
export async function sendTaskDueToday(db: Database = rootDb, now = new Date()): Promise<number> {
	const { start, end, hour } = dutchDay(now);
	if (hour < SEND_FROM_HOUR) return 0;

	const due = await db
		.select({
			leerlingId: task.leerlingId,
			organizationId: task.organizationId,
			value: count(),
		})
		.from(task)
		.innerJoin(user, eq(user.id, task.leerlingId))
		.innerJoin(organization, eq(organization.id, task.organizationId))
		.where(
			and(
				eq(task.done, false),
				// Due today or earlier, or pinned for today.
				or(lt(task.dueAt, end), eq(task.pinnedForToday, true)),
				eq(user.role, "leerling"),
				isNull(organization.archivedAt),
				// Not when a coach has hidden the list.
				notExists(
					db
						.select({ id: coachAssignment.id })
						.from(coachAssignment)
						.where(
							and(
								eq(coachAssignment.leerlingId, task.leerlingId),
								eq(coachAssignment.taskListHidden, true),
							),
						),
				),
				// Once a day.
				notExists(
					db
						.select({ id: notification.id })
						.from(notification)
						.where(
							and(
								eq(notification.userId, task.leerlingId),
								eq(notification.type, "task_due_today"),
								gte(notification.createdAt, start),
							),
						),
				),
			),
		)
		.groupBy(task.leerlingId, task.organizationId);

	for (const row of due) {
		await notify(db, {
			userId: row.leerlingId,
			organizationId: row.organizationId,
			type: "task_due_today",
			title: "Je taken voor vandaag",
			body:
				row.value === 1
					? "Er staat 1 taak voor je klaar."
					: `Er staan ${row.value} taken voor je klaar.`,
		});
	}
	return due.length;
}

/** Check every hour; the once-a-day rule lives in `sendTaskDueToday`. */
export function scheduleTaskDueToday(): void {
	const run = async () => {
		try {
			const n = await sendTaskDueToday();
			if (n > 0) console.log(`[notifications] ${n} "taken voor vandaag" sent`);
		} catch (error) {
			console.error("[notifications] task_due_today failed", error);
		}
	};
	setTimeout(run, 90_000).unref();
	setInterval(run, 60 * 60_000).unref();
}
