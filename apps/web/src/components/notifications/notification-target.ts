import { type NavigateOptions, useNavigate, useRouter } from "@tanstack/solid-router";
import { createAction } from "../../lib/action";
import { client, type Output } from "../../lib/orpc";
import { refresh } from "../../lib/refresh";
import { toast } from "../ui/toast";

/** Where a notification leads, as the server decided (notifications.open). */
export type NotificationTarget = Output<typeof client.notifications.open>["target"];

/**
 * Whether a notification is about something to open (INC-30). The rest —
 * a general message — is only marked read.
 */
export function opensSomething(n: {
	type: string;
	entityType: string | null;
	entityId: string | null;
}): boolean {
	return Boolean(n.entityType && n.entityId) || n.type === "task_due_today";
}

/** The route for a target: the one place that maps notifications onto pages. */
export function targetRoute(target: NotificationTarget): NavigateOptions | null {
	switch (target.kind) {
		case "coachplan":
			return { to: "/plan/$submissionId", params: { submissionId: target.submissionId } };
		case "mijn_plan":
			return { to: "/plan", search: { plan: target.planId } };
		case "taken":
			return target.leerlingId
				? {
						to: "/taken/$leerlingId",
						params: { leerlingId: target.leerlingId },
						search: { taak: target.taskId ?? undefined },
					}
				: { to: "/taken", search: { taak: target.taskId ?? undefined } };
		case "cursus":
			return {
				to: "/cursussen/$courseId",
				params: { courseId: target.courseId },
				search: { tab: target.tab, blok: target.blockId ?? undefined },
			};
		case "chat":
			return { to: "/chat", search: { conversationId: target.conversationId } };
		default:
			return null;
	}
}

/**
 * Opening a notification: the server marks it read and says where it leads;
 * we go there, or say why we can't.
 */
export function useOpenNotification() {
	const router = useRouter();
	const navigate = useNavigate();
	return createAction(
		async (id: string) => {
			const { target } = await client.notifications.open({ id });
			void refresh(router, "notifications");
			if (target.kind === "unavailable") {
				toast({ title: "Kan dit niet openen", description: target.message, tone: "neutral" });
				return;
			}
			const route = targetRoute(target);
			if (route) await navigate(route);
		},
		{ error: "Openen lukte niet" },
	);
}
