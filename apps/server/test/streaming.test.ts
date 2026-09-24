/**
 * Fix plan 1.3 — a streaming handler (`async function*`) returns its generator
 * before its body runs. The request's pinned DB connection must stay checked
 * out until the stream ends, and be released exactly once however it ends.
 */
import { db } from "@incluvo/drizzle";
import { formSubmission, formTemplate } from "@incluvo/drizzle/schema";
import { describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { releaseAfterStream } from "../src/procedures/base";
import { asUser } from "./harness";

function tracked() {
	const events: string[] = [];
	let releases = 0;
	async function* body() {
		events.push("body started");
		yield 1;
		yield 2;
		events.push("body finished");
	}
	const release = async () => {
		releases++;
		events.push("released");
	};
	return { events, body, release, releases: () => releases };
}

describe("releaseAfterStream", () => {
	test("keeps the connection while the body runs, releases once at the end", async () => {
		const t = tracked();
		const stream = releaseAfterStream(t.body(), t.release);
		expect(t.releases()).toBe(0); // returned, but the body hasn't run yet
		const seen: number[] = [];
		for await (const v of stream) {
			seen.push(v);
			expect(t.releases()).toBe(0);
		}
		expect(seen).toEqual([1, 2]);
		expect(t.events).toEqual(["body started", "body finished", "released"]);
		expect(t.releases()).toBe(1);
	});

	test("releases when the client cancels mid-stream", async () => {
		const t = tracked();
		const stream = releaseAfterStream(t.body(), t.release);
		await stream.next();
		await stream.return?.();
		expect(t.releases()).toBe(1);
	});

	test("releases when cancelled before the stream started", async () => {
		const t = tracked();
		const stream = releaseAfterStream(t.body(), t.release);
		await stream.return?.();
		expect(t.events).toEqual(["released"]);
		expect(t.releases()).toBe(1);
	});

	test("releases when the body throws", async () => {
		let releases = 0;
		async function* failing() {
			yield 1;
			throw new Error("provider down");
		}
		const stream = releaseAfterStream(failing(), async () => {
			releases++;
		});
		await stream.next();
		await expect(stream.next()).rejects.toThrow("provider down");
		expect(releases).toBe(1);
		await stream.return?.();
		expect(releases).toBe(1);
	});
});

describe("ai.assistant through the app", () => {
	test("streams advice grounded in a coachplan read inside the stream", async () => {
		const leerling = await asUser("leerling");
		const [template] = await db
			.select({ id: formTemplate.id, organizationId: formTemplate.organizationId })
			.from(formTemplate)
			.where(and(eq(formTemplate.scope, "school"), eq(formTemplate.isSchoolDefault, true)));
		const [plan] = await db
			.insert(formSubmission)
			.values({
				templateId: template!.id,
				organizationId: template!.organizationId!,
				leerlingId: leerling.id,
				status: "submitted",
				submittedAt: new Date(),
			})
			.returning({ id: formSubmission.id });

		const coach = await asUser("coach");
		const frames: unknown[] = [];
		const stream = await coach.client.ai.assistant({
			submissionId: plan!.id,
			messages: [{ role: "user", content: "Hoe help ik deze leerling plannen?" }],
		});
		for await (const frame of stream) frames.push(frame);

		expect(frames[0]).toMatchObject({ meta: { mock: true } });
		expect(frames.some((f) => typeof (f as { delta?: unknown }).delta === "string")).toBe(true);
		expect(frames.at(-1)).toEqual({ done: true });
	});
});
