import type { Database } from "@incluvo/drizzle";
import { type Notification, notification } from "@incluvo/drizzle/schema";
import { publishTo } from "../sse";

/**
 * Notification types other domains can emit (backlog #3). Mirrors the
 * `notification_type` pg-enum in `packages/drizzle/src/schema/notification.ts`.
 */
export type NotifyType = Notification["type"];

/** Loose deep-link to the originating row, so the UI can navigate on click. */
export interface NotifyEntity {
	type: string;
	id: string;
}

export interface NotifyInput {
	/** Recipient user id. */
	userId: string;
	/** Tenant the notification belongs to (defence in depth + scoping). */
	organizationId: string;
	type: NotifyType;
	/** Short headline, Dutch, calm. */
	title: string;
	/** Optional one-line body. */
	body?: string | null;
	/** Optional loose link to the source row for deep-linking. */
	entity?: NotifyEntity | null;
}

/**
 * Create one in-app notification and live-deliver it over SSE (backlog #3).
 *
 * Other epics (coachplan, taken, leeromgeving, chat) call this whenever
 * something notable happens for a leerling or coach. It:
 *   1. inserts a `notification` row (tenant + user scoped), and
 *   2. publishes a `notification.new` SSE event carrying `userId` so the
 *      recipient's `<NotificationsBell/>` updates instantly.
 *
 * The SSE hub (`apps/server/src/sse.ts`) delivers per-user: the
 * `notification.new` frame is sent ONLY to the recipient `userId`'s own
 * connections, so no other user ever sees it.
 *
 * Usage from another procedure (after wiring — see ORCHESTRATOR TODO):
 *
 *   import { notify } from "../../notifications/notify";
 *   await notify(context.db, {
 *     userId: coachId,
 *     organizationId: context.actor.organizationId!,
 *     type: "coachplan_submitted",
 *     title: "Nieuw coachplan ontvangen",
 *     body: `${leerlingName} heeft een coachplan ingediend.`,
 *     entity: { type: "form_submission", id: submissionId },
 *   });
 */
export async function notify(
	db: Database,
	input: NotifyInput,
): Promise<Notification> {
	const [row] = await db
		.insert(notification)
		.values({
			userId: input.userId,
			organizationId: input.organizationId,
			type: input.type,
			title: input.title,
			body: input.body ?? null,
			entityType: input.entity?.type ?? null,
			entityId: input.entity?.id ?? null,
		})
		.returning();

	if (!row) {
		throw new Error("Failed to create notification");
	}

	publishTo(
		{
			type: "notification.new",
			payload: {
				userId: row.userId,
				id: row.id,
				notificationType: row.type,
				title: row.title,
			},
		},
		[row.userId],
	);

	return row;
}
