import { coachAssignment, task, user } from "@incluvo/drizzle/schema";
import { atLeast, checkPermission, policies } from "@incluvo/permissions";
import { ORPCError } from "@orpc/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { notify } from "../../notifications/notify";
import { publishTo } from "../../sse";
import { type AuthedContext, base, protectedProcedure } from "../base";

/**
 * Takenlijst domain (backlog #37–#41). Register key: `tasks`.
 *
 * A leerling sees their own list split into **vandaag** (due today OR pinned for
 * today, #37/#38) and **toekomst** (#37). They can pin a future task into today
 * (#38), check tasks off (#40) and add tasks (#41). A coach may view & manage the
 * list of any leerling they're assigned to in the same tenant: add tasks (#41),
 * adjust due dates (#37) and temporarily hide the whole list (#39, stored on
 * `coach_assignment`).
 *
 * Everything is tenant-scoped via the `readTask` / `manageTask` policies, which
 * also encode "the leerling themselves, or a coach+" ownership. Mutations
 * SSE-publish `task.changed` so other open clients refresh in realtime.
 */

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

const TaskSchema = z.object({
	id: z.string(),
	leerlingId: z.string(),
	source: z.enum(["assignment", "manual"]),
	title: z.string(),
	description: z.string().nullable(),
	dueAt: z.date().nullable(),
	pinnedForToday: z.boolean(),
	done: z.boolean(),
	doneAt: z.date().nullable(),
	createdAt: z.date(),
});

const taskColumns = {
	id: task.id,
	leerlingId: task.leerlingId,
	organizationId: task.organizationId,
	source: task.source,
	title: task.title,
	description: task.description,
	dueAt: task.dueAt,
	pinnedForToday: task.pinnedForToday,
	done: task.done,
	doneAt: task.doneAt,
	createdAt: task.createdAt,
} as const;

/** A date falls "today" when it lands within the actor's calendar day. */
function isDueToday(dueAt: Date | null): boolean {
	if (!dueAt) return false;
	const now = new Date();
	return (
		dueAt.getFullYear() === now.getFullYear() &&
		dueAt.getMonth() === now.getMonth() &&
		dueAt.getDate() === now.getDate()
	);
}

/**
 * Resolve the target leerling for a request and authorize access against the
 * given policy. A leerling may only act on their own list; a coach+ may act on a
 * leerling within their own tenant. Returns the leerling row (id + tenant) so
 * callers can scope writes.
 */
async function resolveLeerling(
	context: AuthedContext,
	leerlingId: string | undefined,
	policy: typeof policies.readTask | typeof policies.manageTask,
): Promise<{ id: string; organizationId: string | null }> {
	const { actor } = context;
	const targetId = leerlingId ?? actor.userId;

	const [leerling] = await context.db
		.select({ id: user.id, organizationId: user.organizationId })
		.from(user)
		.where(eq(user.id, targetId));
	if (!leerling) throw new ORPCError("NOT_FOUND", { message: "Leerling niet gevonden" });

	const resource = {
		leerlingId: leerling.id,
		organizationId: leerling.organizationId,
	};
	if (!checkPermission(policy, actor, resource)) {
		throw new ORPCError("FORBIDDEN", {
			message: `Policy "${policy.name}" denied access`,
		});
	}
	return leerling;
}

/**
 * SSE recipients for a `task.changed` event (C1): the leerling whose list
 * changed, the acting user, and that leerling's assigned coach(es) — never a
 * global broadcast.
 */
async function taskRecipients(
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

/** The coach_assignment row binding the actor's chosen leerling, if any. */
async function findAssignment(
	context: AuthedContext,
	leerlingId: string,
): Promise<{ id: string; taskListHidden: boolean } | null> {
	const [row] = await context.db
		.select({
			id: coachAssignment.id,
			taskListHidden: coachAssignment.taskListHidden,
		})
		.from(coachAssignment)
		.where(eq(coachAssignment.leerlingId, leerlingId));
	return row ?? null;
}

// ---------------------------------------------------------------------------
// list — vandaag / toekomst (#37, #38, #39)
// ---------------------------------------------------------------------------

const list = protectedProcedure
	.route({ method: "GET", path: "/tasks", tags: ["tasks"] })
	.input(z.object({ leerlingId: z.string().optional() }).optional())
	.output(
		z.object({
			leerlingId: z.string(),
			listHidden: z.boolean(),
			vandaag: z.array(TaskSchema),
			toekomst: z.array(TaskSchema),
			klaar: z.array(TaskSchema),
		}),
	)
	.handler(async ({ input, context }) => {
		const leerling = await resolveLeerling(
			context,
			input?.leerlingId,
			policies.readTask,
		);

		const rows = await context.db
			.select(taskColumns)
			.from(task)
			.where(eq(task.leerlingId, leerling.id))
			.orderBy(asc(task.dueAt), asc(task.createdAt));

		const assignment = await findAssignment(context, leerling.id);

		const vandaag: typeof rows = [];
		const toekomst: typeof rows = [];
		const klaar: typeof rows = [];
		for (const row of rows) {
			if (row.done) {
				klaar.push(row);
			} else if (isDueToday(row.dueAt) || row.pinnedForToday) {
				vandaag.push(row);
			} else {
				toekomst.push(row);
			}
		}

		return {
			leerlingId: leerling.id,
			listHidden: assignment?.taskListHidden ?? false,
			vandaag,
			toekomst,
			klaar,
		};
	});

// ---------------------------------------------------------------------------
// add — leerling for self, or coach for their leerling (#41)
// ---------------------------------------------------------------------------

const add = protectedProcedure
	.route({ method: "POST", path: "/tasks", tags: ["tasks"] })
	.input(
		z.object({
			leerlingId: z.string().optional(),
			title: z.string().min(1),
			description: z.string().optional(),
			dueAt: z.coerce.date().optional(),
		}),
	)
	.output(TaskSchema)
	.handler(async ({ input, context }) => {
		const leerling = await resolveLeerling(
			context,
			input.leerlingId,
			policies.manageTask,
		);
		if (!leerling.organizationId) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Leerling heeft geen organisatie",
			});
		}

		const [row] = await context.db
			.insert(task)
			.values({
				organizationId: leerling.organizationId,
				leerlingId: leerling.id,
				source: "manual",
				createdById: context.actor.userId,
				title: input.title,
				description: input.description ?? null,
				dueAt: input.dueAt ?? null,
			})
			.returning(taskColumns);
		if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");

		publishTo(
			{ type: "task.changed", payload: { leerlingId: leerling.id } },
			await taskRecipients(context, leerling.id),
		);

		// Notify the leerling when a coach adds a task on their behalf (#3/#41).
		// (A leerling adding their own task notifies nobody.) Best-effort: a
		// notify failure must never break the add mutation.
		// TODO(#3): daily `task_due_today` digest needs a scheduler/cron job.
		if (context.actor.userId !== leerling.id) {
			try {
				await notify(context.db, {
					userId: leerling.id,
					organizationId: leerling.organizationId,
					type: "task_new",
					title: "Nieuwe taak",
					body: `Je coach heeft een taak toegevoegd: ${input.title}.`,
					entity: { type: "task", id: row.id },
				});
			} catch (err) {
				console.error("notify(task_new) failed", err);
			}
		}
		return row;
	});

// ---------------------------------------------------------------------------
// Per-task mutations: load row, re-check manageTask on the row's tenant/owner
// ---------------------------------------------------------------------------

/** Load a task and authorize the actor to manage it. */
async function loadManageable(context: AuthedContext, id: string) {
	const [row] = await context.db
		.select(taskColumns)
		.from(task)
		.where(eq(task.id, id));
	if (!row) throw new ORPCError("NOT_FOUND");
	if (!checkPermission(policies.manageTask, context.actor, row)) {
		throw new ORPCError("FORBIDDEN");
	}
	return row;
}

/** Toggle / set "pin to today" for a future task (#38). */
const setPinned = protectedProcedure
	.route({ method: "POST", path: "/tasks/{id}/pin", tags: ["tasks"] })
	.input(z.object({ id: z.string().uuid(), pinned: z.boolean() }))
	.output(TaskSchema)
	.handler(async ({ input, context }) => {
		const existing = await loadManageable(context, input.id);
		const [row] = await context.db
			.update(task)
			.set({ pinnedForToday: input.pinned, updatedAt: new Date() })
			.where(eq(task.id, input.id))
			.returning(taskColumns);
		if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");
		publishTo(
			{ type: "task.changed", payload: { leerlingId: existing.leerlingId } },
			await taskRecipients(context, existing.leerlingId),
		);
		return row;
	});

/** Mark a task done / undone (#40). */
const setDone = protectedProcedure
	.route({ method: "POST", path: "/tasks/{id}/done", tags: ["tasks"] })
	.input(z.object({ id: z.string().uuid(), done: z.boolean() }))
	.output(TaskSchema)
	.handler(async ({ input, context }) => {
		const existing = await loadManageable(context, input.id);
		const [row] = await context.db
			.update(task)
			.set({
				done: input.done,
				doneAt: input.done ? new Date() : null,
				updatedAt: new Date(),
			})
			.where(eq(task.id, input.id))
			.returning(taskColumns);
		if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");
		publishTo(
			{ type: "task.changed", payload: { leerlingId: existing.leerlingId } },
			await taskRecipients(context, existing.leerlingId),
		);
		return row;
	});

/**
 * Adjust a task's due date (#37). The coach may move any task — including one
 * sourced from the leeromgeving (assignment) — into/out of vandaag.
 */
const setDueDate = protectedProcedure
	.route({ method: "POST", path: "/tasks/{id}/due", tags: ["tasks"] })
	.input(z.object({ id: z.string().uuid(), dueAt: z.coerce.date().nullable() }))
	.output(TaskSchema)
	.handler(async ({ input, context }) => {
		const existing = await loadManageable(context, input.id);
		const [row] = await context.db
			.update(task)
			.set({ dueAt: input.dueAt, updatedAt: new Date() })
			.where(eq(task.id, input.id))
			.returning(taskColumns);
		if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");
		publishTo(
			{ type: "task.changed", payload: { leerlingId: existing.leerlingId } },
			await taskRecipients(context, existing.leerlingId),
		);
		return row;
	});

// ---------------------------------------------------------------------------
// setListHidden — coach temporarily hides a leerling's list (#39)
// ---------------------------------------------------------------------------

const setListHidden = protectedProcedure
	.route({ method: "POST", path: "/tasks/hide-list", tags: ["tasks"] })
	.input(z.object({ leerlingId: z.string(), hidden: z.boolean() }))
	.output(z.object({ leerlingId: z.string(), listHidden: z.boolean() }))
	.handler(async ({ input, context }) => {
		const { actor } = context;
		// Only a coach+ acts on this toggle; a leerling can't hide their own list.
		if (!atLeast(actor.role, "coach")) {
			throw new ORPCError("FORBIDDEN", {
				message: "Alleen een coach kan de takenlijst verbergen",
			});
		}

		const leerling = await resolveLeerling(
			context,
			input.leerlingId,
			policies.manageTask,
		);
		if (!leerling.organizationId) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Leerling heeft geen organisatie",
			});
		}

		const existing = await findAssignment(context, leerling.id);
		if (existing) {
			await context.db
				.update(coachAssignment)
				.set({ taskListHidden: input.hidden, updatedAt: new Date() })
				.where(eq(coachAssignment.id, existing.id));
		} else {
			// No assignment row yet: create one binding this coach to the leerling.
			await context.db.insert(coachAssignment).values({
				organizationId: leerling.organizationId,
				coachId: actor.userId,
				leerlingId: leerling.id,
				taskListHidden: input.hidden,
			});
		}

		publishTo(
			{ type: "task.changed", payload: { leerlingId: leerling.id } },
			await taskRecipients(context, leerling.id),
		);
		return { leerlingId: leerling.id, listHidden: input.hidden };
	});

// ---------------------------------------------------------------------------
// Domain router
// ---------------------------------------------------------------------------

export const tasksRouter = base.router({
	list,
	add,
	setPinned,
	setDone,
	setDueDate,
	setListHidden,
});
