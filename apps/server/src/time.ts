/**
 * Calendar days in the Netherlands. The server may run in UTC; "vandaag" for a
 * leerling is the Dutch day (Europe/Amsterdam, including summer time).
 */
const TZ = "Europe/Amsterdam";

const partsFmt = new Intl.DateTimeFormat("en-CA", {
	timeZone: TZ,
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
	hour: "2-digit",
	minute: "2-digit",
	second: "2-digit",
	hourCycle: "h23",
});

function parts(date: Date): Record<string, number> {
	const out: Record<string, number> = {};
	for (const p of partsFmt.formatToParts(date)) {
		if (p.type !== "literal") out[p.type] = Number(p.value);
	}
	return out;
}

/** Minutes the Dutch clock is ahead of UTC at `date` (60 or 120). */
function offsetMinutes(date: Date): number {
	const p = parts(date);
	const asUtc = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!);
	return Math.round((asUtc - date.getTime()) / 60_000);
}

/** Start and end (exclusive) of the Dutch calendar day containing `now`, and the Dutch hour. */
export function dutchDay(now: Date = new Date()): { start: Date; end: Date; hour: number } {
	const p = parts(now);
	const midnightAsUtc = Date.UTC(p.year!, p.month! - 1, p.day!);
	let start = midnightAsUtc - offsetMinutes(new Date(midnightAsUtc)) * 60_000;
	// Around a DST switch the offset at midnight can differ from the guess.
	start = midnightAsUtc - offsetMinutes(new Date(start)) * 60_000;
	const nextMidnightAsUtc = Date.UTC(p.year!, p.month! - 1, p.day! + 1);
	let end = nextMidnightAsUtc - offsetMinutes(new Date(nextMidnightAsUtc)) * 60_000;
	end = nextMidnightAsUtc - offsetMinutes(new Date(end)) * 60_000;
	return { start: new Date(start), end: new Date(end), hour: p.hour! };
}
