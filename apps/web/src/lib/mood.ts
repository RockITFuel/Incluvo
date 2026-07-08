/**
 * The 0–4 mood scale, shared by the leerling check-in (welkom) and the coach
 * dashboard/profile. Index is the stored `mood` value; `e` is the emoji shown,
 * `label` the accessible Dutch name.
 */
export const MOODS = [
	{ e: "😞", label: "Niet zo" },
	{ e: "😕", label: "Matig" },
	{ e: "😐", label: "Oké" },
	{ e: "🙂", label: "Goed" },
	{ e: "😄", label: "Top" },
];

/** Safe lookup for a stored 0–4 mood value (clamped to a valid entry). */
export function moodMeta(i: number): { e: string; label: string } {
	return MOODS[i] ?? MOODS[2] ?? { e: "😐", label: "Oké" };
}
