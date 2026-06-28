import { notification, notificationType } from "@incluvo/drizzle/schema";
import { ORPCError } from "@orpc/server";
import { and, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../env";
import { notify } from "../../notifications/notify";
import { base, protectedProcedure } from "../base";

/**
 * Notificaties domain (backlog #3). In-app notifications for leerling + coach:
 * coachplan verzonden/ontvangen, taken voor vandaag, nieuwe taken, activiteit
 * binnen de leeromgeving. Every endpoint is strictly user-scoped: a user only
 * ever sees and mutates their *own* notifications.
 *
 * The reusable `notify(db, {...})` helper that other epics call to emit a
 * notification (insert row + SSE `notification.new`) lives in
 * `apps/server/src/notifications/notify.ts`.
 */

// Source of truth for valid types: the pg-enum on the schema.
const NotificationTypeSchema = z.enum(notificationType.enumValues);

const NotificationSchema = z.object({
	id: z.string(),
	type: NotificationTypeSchema,
	title: z.string(),
	body: z.string().nullable(),
	entityType: z.string().nullable(),
	entityId: z.string().nullable(),
	read: z.boolean(),
	readAt: z.date().nullable(),
	createdAt: z.date(),
});

/**
 * List the current user's notifications (paginated, newest first). Optionally
 * filter to unread only (for the bell dropdown).
 */
const list = protectedProcedure
	.route({ method: "GET", path: "/notifications", tags: ["notifications"] })
	.input(
		z.object({
			limit: z.number().int().min(1).max(100).default(20),
			offset: z.number().int().min(0).default(0),
			unreadOnly: z.boolean().default(false),
		}),
	)
	.output(
		z.object({
			items: z.array(NotificationSchema),
			unreadCount: z.number().int(),
			hasMore: z.boolean(),
		}),
	)
	.handler(async ({ input, context }) => {
		const { actor } = context;

		const scope = input.unreadOnly
			? and(
					eq(notification.userId, actor.userId),
					eq(notification.read, false),
				)
			: eq(notification.userId, actor.userId);

		const rows = await context.db
			.select({
				id: notification.id,
				type: notification.type,
				title: notification.title,
				body: notification.body,
				entityType: notification.entityType,
				entityId: notification.entityId,
				read: notification.read,
				readAt: notification.readAt,
				createdAt: notification.createdAt,
			})
			.from(notification)
			.where(scope)
			// Fetch one extra row to compute `hasMore` without a second count.
			.orderBy(desc(notification.createdAt))
			.limit(input.limit + 1)
			.offset(input.offset);

		const hasMore = rows.length > input.limit;
		const items = hasMore ? rows.slice(0, input.limit) : rows;

		const [unread] = await context.db
			.select({ value: count() })
			.from(notification)
			.where(
				and(
					eq(notification.userId, actor.userId),
					eq(notification.read, false),
				),
			);

		return {
			items,
			unreadCount: unread?.value ?? 0,
			hasMore,
		};
	});

/** Just the unread count — cheap poll for the bell badge. */
const unreadCount = protectedProcedure
	.route({
		method: "GET",
		path: "/notifications/unread-count",
		tags: ["notifications"],
	})
	.output(z.object({ unreadCount: z.number().int() }))
	.handler(async ({ context }) => {
		const [row] = await context.db
			.select({ value: count() })
			.from(notification)
			.where(
				and(
					eq(notification.userId, context.actor.userId),
					eq(notification.read, false),
				),
			);
		return { unreadCount: row?.value ?? 0 };
	});

/** Mark a single notification (the user's own) as read. */
const markRead = protectedProcedure
	.route({
		method: "POST",
		path: "/notifications/mark-read",
		tags: ["notifications"],
	})
	.input(z.object({ id: z.string().uuid() }))
	.output(NotificationSchema)
	.handler(async ({ input, context }) => {
		const [row] = await context.db
			.update(notification)
			.set({ read: true, readAt: new Date() })
			// Ownership baked into the WHERE: can't touch another user's rows.
			.where(
				and(
					eq(notification.id, input.id),
					eq(notification.userId, context.actor.userId),
				),
			)
			.returning({
				id: notification.id,
				type: notification.type,
				title: notification.title,
				body: notification.body,
				entityType: notification.entityType,
				entityId: notification.entityId,
				read: notification.read,
				readAt: notification.readAt,
				createdAt: notification.createdAt,
			});
		if (!row) throw new ORPCError("NOT_FOUND");
		return row;
	});

/** Mark all of the user's unread notifications as read. */
const markAllRead = protectedProcedure
	.route({
		method: "POST",
		path: "/notifications/mark-all-read",
		tags: ["notifications"],
	})
	.output(z.object({ updated: z.number().int() }))
	.handler(async ({ context }) => {
		const rows = await context.db
			.update(notification)
			.set({ read: true, readAt: new Date() })
			.where(
				and(
					eq(notification.userId, context.actor.userId),
					eq(notification.read, false),
				),
			)
			.returning({ id: notification.id });
		return { updated: rows.length };
	});

/**
 * Dev-only: emit a test notification to *yourself* so the end-to-end flow
 * (insert → SSE → bell → list → markRead) is demoable now, before other epics
 * wire `notify()` into their events. Disabled outside development.
 */
const testEmit = protectedProcedure
	.route({
		method: "POST",
		path: "/notifications/test-emit",
		tags: ["notifications"],
	})
	.input(
		z.object({
			type: NotificationTypeSchema.default("generic"),
			title: z.string().min(1).default("Testnotificatie"),
			body: z.string().optional(),
		}),
	)
	.output(NotificationSchema)
	.handler(async ({ input, context }) => {
		if (env.NODE_ENV === "production") {
			throw new ORPCError("FORBIDDEN", {
				message: "testEmit is alleen in development beschikbaar",
			});
		}
		const { actor } = context;
		if (!actor.organizationId) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Geen organisatie voor deze gebruiker",
			});
		}
		return notify(context.db, {
			userId: actor.userId,
			organizationId: actor.organizationId,
			type: input.type,
			title: input.title,
			body: input.body ?? null,
		});
	});

export const notificationsRouter = base.router({
	list,
	unreadCount,
	markRead,
	markAllRead,
	testEmit,
});
