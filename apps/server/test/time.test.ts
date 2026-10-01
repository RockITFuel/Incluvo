import { describe, expect, test } from "bun:test";
import { dutchDay } from "../src/time";

describe("dutchDay", () => {
	test("summer time: 00:30 Dutch time is still UTC yesterday", () => {
		// 1 Oct 2026 00:30 CEST = 30 Sep 22:30 UTC
		const d = dutchDay(new Date("2026-09-30T22:30:00Z"));
		expect(d.start.toISOString()).toBe("2026-09-30T22:00:00.000Z");
		expect(d.end.toISOString()).toBe("2026-10-01T22:00:00.000Z");
		expect(d.hour).toBe(0);
	});

	test("winter time", () => {
		const d = dutchDay(new Date("2026-12-15T12:00:00Z"));
		expect(d.start.toISOString()).toBe("2026-12-14T23:00:00.000Z");
		expect(d.end.toISOString()).toBe("2026-12-15T23:00:00.000Z");
		expect(d.hour).toBe(13);
	});

	test("the day summer time ends is 25 hours long", () => {
		const d = dutchDay(new Date("2026-10-25T10:00:00Z"));
		expect(d.start.toISOString()).toBe("2026-10-24T22:00:00.000Z");
		expect(d.end.toISOString()).toBe("2026-10-25T23:00:00.000Z");
	});
});
