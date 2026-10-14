export type PersonKind = "leerling" | "coach";

/** The ID the keyuser sees: L-00012 for a leerling, C-00007 for a coach. */
export function personId(kind: PersonKind, number: number | null): string {
	if (number === null) return "Wordt aangemaakt bij opslaan";
	return `${kind === "leerling" ? "L" : "C"}-${String(number).padStart(5, "0")}`;
}

/** A YYYY-MM-DD date as 14-03-2026; empty when unknown. */
export function dutchDate(iso: string | null): string {
	if (!iso) return "";
	const [y, m, d] = iso.split("-");
	return `${d}-${m}-${y}`;
}
