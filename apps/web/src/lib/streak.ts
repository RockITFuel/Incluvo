/**
 * "Dagen op rij": consecutive calendar days (ending today, or yesterday so a
 * streak survives until the day is over) with at least one afgeronde taak.
 * Derived from real `doneAt` timestamps — never a hardcoded demo number.
 */
export function doneStreak(
	doneDates: (Date | string | null | undefined)[],
): number {
	const key = (d: Date) =>
		`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
	const days = new Set<string>();
	for (const raw of doneDates) {
		if (!raw) continue;
		const d = new Date(raw);
		if (!Number.isNaN(d.getTime())) days.add(key(d));
	}
	const cursor = new Date();
	if (!days.has(key(cursor))) cursor.setDate(cursor.getDate() - 1);
	let streak = 0;
	while (days.has(key(cursor))) {
		streak++;
		cursor.setDate(cursor.getDate() - 1);
	}
	return streak;
}
