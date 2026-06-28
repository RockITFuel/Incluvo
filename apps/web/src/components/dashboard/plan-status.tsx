import { Badge } from "../ui/badge";

/** Coarse coachplan status as returned by `dashboard.*`. */
export type PlanStatus =
	| "niet_ingevuld"
	| "draft"
	| "submitted"
	| "coach_review"
	| "shared_with_leerling"
	| "completed";

const LABELS: Record<PlanStatus, string> = {
	niet_ingevuld: "Niet ingevuld",
	draft: "Wordt ingevuld",
	submitted: "Ingeleverd",
	coach_review: "In behandeling",
	shared_with_leerling: "Gedeeld",
	completed: "Afgerond",
};

const VARIANTS: Record<
	PlanStatus,
	"neutral" | "primary" | "accent" | "success" | "warning"
> = {
	niet_ingevuld: "neutral",
	draft: "neutral",
	submitted: "warning",
	coach_review: "primary",
	shared_with_leerling: "primary",
	completed: "success",
};

/** Calm status badge for a leerling's coachplan. */
export function PlanStatusBadge(props: { status: PlanStatus }) {
	return (
		<Badge variant={VARIANTS[props.status]}>{LABELS[props.status]}</Badge>
	);
}

/** Relative-time helper, Dutch, used across the dashboard. */
export function relativeTime(date: Date | string | null): string {
	if (!date) return "—";
	const d = typeof date === "string" ? new Date(date) : date;
	const diff = Date.now() - d.getTime();
	const min = Math.round(diff / 60000);
	if (min < 1) return "zojuist";
	if (min < 60) return `${min} min geleden`;
	const hours = Math.round(min / 60);
	if (hours < 24) return `${hours} uur geleden`;
	const days = Math.round(hours / 24);
	if (days === 1) return "gisteren";
	if (days < 7) return `${days} dagen geleden`;
	return d.toLocaleDateString("nl-NL", {
		day: "numeric",
		month: "short",
	});
}
