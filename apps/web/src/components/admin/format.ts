/** Shared formatting helpers for the admin omgeving (#60). */

const dateTimeFmt = new Intl.DateTimeFormat("nl-NL", {
	dateStyle: "short",
	timeStyle: "short",
});

const dateFmt = new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" });

export function formatDateTime(value: Date | string | null | undefined): string {
	if (!value) return "—";
	const d = value instanceof Date ? value : new Date(value);
	return Number.isNaN(d.getTime()) ? "—" : dateTimeFmt.format(d);
}

export function formatDate(value: Date | string | null | undefined): string {
	if (!value) return "—";
	const d = value instanceof Date ? value : new Date(value);
	return Number.isNaN(d.getTime()) ? "—" : dateFmt.format(d);
}

/** Human label for an organization kind. */
export function kindLabel(kind: "ondivera" | "school"): string {
	return kind === "ondivera" ? "Ondivera" : "School";
}

/** Strip the `user:` prefix the audit log uses for actor tokens. */
export function actorLabel(actor: string): string {
	if (actor === "system") return "Systeem";
	return actor.startsWith("user:") ? actor.slice("user:".length) : actor;
}
