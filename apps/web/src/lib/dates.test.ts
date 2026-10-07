/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { parseDutchDate, toDutchDate, toIsoDate } from "./dates";

describe("dates (INC-5)", () => {
	test("reads DD/MM/JJJJ with / - or .", () => {
		for (const t of ["15/10/2026", "15-10-2026", "15.10.2026", "5/1/2027"]) {
			expect(parseDutchDate(t)).toBeInstanceOf(Date);
		}
		const d = parseDutchDate("15/10/2026")!;
		expect([d.getDate(), d.getMonth() + 1, d.getFullYear()]).toEqual([15, 10, 2026]);
	});

	test("empty is no date; nonsense and impossible dates are rejected", () => {
		expect(parseDutchDate("  ")).toBeUndefined();
		for (const t of ["31/02/2026", "10/15/2026", "morgen", "2026-10-15"]) {
			expect(parseDutchDate(t)).toBeNull();
		}
	});

	test("round-trips with the calendar's ISO value", () => {
		expect(toDutchDate("2026-10-15")).toBe("15/10/2026");
		expect(toIsoDate(parseDutchDate("05/01/2027")!)).toBe("2027-01-05");
	});
});
