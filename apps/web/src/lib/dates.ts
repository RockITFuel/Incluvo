/**
 * Typed date "DD/MM/JJJJ" (or with - or .) → a Date at local midnight, or
 * null when it isn't a real date. Empty → undefined (no due date).
 */
export function parseDutchDate(text: string): Date | null | undefined {
	const t = text.trim();
	if (!t) return undefined;
	const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
	if (!m) return null;
	const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
	const d = new Date(year, month - 1, day);
	return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day ? d : null;
}

const pad = (n: number) => String(n).padStart(2, "0");
/** "2026-10-15" → "15/10/2026" (empty when not a date). */
export const toDutchDate = (iso: string) => {
	const [y, m, d] = iso.split("-");
	return y && m && d ? `${d}/${m}/${y}` : "";
};
/** Date → "2026-10-15" in local time. */
export const toIsoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
