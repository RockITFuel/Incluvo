import {
	Activity,
	Bell,
	ClipboardCheck,
	ListChecks,
	type LucideProps,
	MessageCircle,
	Send,
} from "lucide-solid";
import type { Component } from "solid-js";

/** The notification types as defined by the server's `notification_type` enum. */
export type NotificationType =
	| "coachplan_submitted"
	| "coachplan_shared"
	| "task_due_today"
	| "task_new"
	| "course_activity"
	| "chat_message"
	| "generic";

interface TypeMeta {
	/** Short Dutch label for the kind of notification. */
	label: string;
	icon: Component<LucideProps>;
	/** Tint class for the icon bubble (token-based, WCAG-AA safe). */
	tone: string;
}

/**
 * Presentation metadata per notification type: a calm Dutch label, an icon and
 * a soft tone. Falls back to a neutral "Melding" for unknown/`generic`.
 */
export const NOTIFICATION_META: Record<NotificationType, TypeMeta> = {
	coachplan_submitted: {
		label: "Coachplan ingediend",
		icon: ClipboardCheck,
		tone: "bg-accent-100 text-accent-700",
	},
	coachplan_shared: {
		label: "Coachplan gedeeld",
		icon: Send,
		tone: "bg-primary-100 text-primary-700",
	},
	task_due_today: {
		label: "Taak voor vandaag",
		icon: ListChecks,
		tone: "bg-success-100 text-success",
	},
	task_new: {
		label: "Nieuwe taak",
		icon: ListChecks,
		tone: "bg-primary-100 text-primary-700",
	},
	course_activity: {
		label: "Activiteit in de leeromgeving",
		icon: Activity,
		tone: "bg-accent-100 text-accent-700",
	},
	chat_message: {
		label: "Nieuw bericht",
		icon: MessageCircle,
		tone: "bg-primary-100 text-primary-700",
	},
	generic: {
		label: "Melding",
		icon: Bell,
		tone: "bg-line-2 text-ink-2",
	},
};

export function metaFor(type: string): TypeMeta {
	return (
		NOTIFICATION_META[type as NotificationType] ?? NOTIFICATION_META.generic
	);
}

/** Compact, accessible relative time in Dutch, e.g. "2 min geleden". */
export function relativeTime(date: Date | string): string {
	const d = typeof date === "string" ? new Date(date) : date;
	const seconds = Math.round((Date.now() - d.getTime()) / 1000);
	if (seconds < 45) return "zojuist";
	const minutes = Math.round(seconds / 60);
	if (minutes < 60)
		return `${minutes} min${minutes === 1 ? "" : "uten"} geleden`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours} uur geleden`;
	const days = Math.round(hours / 24);
	if (days < 7) return `${days} dag${days === 1 ? "" : "en"} geleden`;
	return d.toLocaleDateString("nl-NL", {
		day: "numeric",
		month: "short",
	});
}
