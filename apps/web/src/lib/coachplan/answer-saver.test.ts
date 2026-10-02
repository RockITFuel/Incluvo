/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { createAnswerSaver } from "./answer-saver";

/** A fake server: stores the last value it received per question. */
function fakeServer(delays: number[] = []) {
	const stored = new Map<string, Record<string, unknown>>();
	const sent: Record<string, unknown>[] = [];
	let call = 0;
	let failNext = 0;
	const send = async (id: string, patch: Record<string, unknown>) => {
		const delay = delays[call++ % Math.max(delays.length, 1)] ?? 0;
		sent.push(patch);
		await new Promise((r) => setTimeout(r, delay));
		if (failNext > 0) {
			failNext--;
			throw new Error("netwerk");
		}
		stored.set(id, { ...stored.get(id), ...patch });
	};
	return { stored, sent, send, failOnce: () => (failNext = 1) };
}

describe("answer saver (INC-1)", () => {
	test("a slow older save can't overwrite a newer value", async () => {
		// Every other request is slow, like a flaky school network.
		const server = fakeServer([60, 5]);
		const saver = createAnswerSaver(server.send);
		const text = "Snel getypt antwoord.";
		for (let i = 1; i <= text.length; i++) {
			saver.save("q1", { value: text.slice(0, i) });
			await new Promise((r) => setTimeout(r, 2));
		}
		expect(await saver.flush()).toBe(true);
		expect(server.stored.get("q1")?.value).toBe(text);
		// Coalesced: far fewer requests than keystrokes, never two at once.
		expect(server.sent.length).toBeLessThan(text.length);
	});

	test("flags and value for one question merge instead of dropping each other", async () => {
		const server = fakeServer([30]);
		const saver = createAnswerSaver(server.send);
		saver.save("q1", { value: "a" });
		saver.save("q1", { discussWithCoach: true });
		saver.save("q1", { value: "ab" });
		await saver.flush();
		expect(server.stored.get("q1")).toEqual({ value: "ab", discussWithCoach: true });
	});

	test("a failed save is kept and retried by flush", async () => {
		const server = fakeServer([5]);
		const errors: unknown[] = [];
		const saver = createAnswerSaver(server.send, (e) => errors.push(e));
		server.failOnce();
		saver.save("q1", { value: "bewaar mij" });
		await new Promise((r) => setTimeout(r, 20));
		expect(errors).toHaveLength(1);
		expect(saver.busy()).toBe(true);
		expect(await saver.flush()).toBe(true);
		expect(server.stored.get("q1")?.value).toBe("bewaar mij");
		expect(saver.busy()).toBe(false);
	});

	test("onSaved runs after the value reached the server", async () => {
		const server = fakeServer([10]);
		const saver = createAnswerSaver(server.send);
		let savedSeen: unknown;
		saver.save("q1", { value: "x" }, () => (savedSeen = server.stored.get("q1")?.value));
		await saver.flush();
		expect(savedSeen).toBe("x");
	});
});
