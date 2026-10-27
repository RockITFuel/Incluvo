/**
 * Form editor (Formulieren): inserting a question at a chosen place (INC-34),
 * a separate leerling wording (INC-31) and the options of a multiple choice
 * question with its three variants (INC-29).
 */
import { describe, expect, mock, test } from "bun:test";
import type { PdfPlan } from "../src/coachplan/pdf";
import { db } from "@incluvo/drizzle";
import { formTemplate } from "@incluvo/drizzle/schema";
import { and, eq } from "drizzle-orm";
import { answerText } from "../src/coachplan/answers";
import { copyQuestions } from "../src/coachplan/templates";
import { createAccount } from "../src/users";
import { asUser, type TestUser } from "./harness";

/**
 * A new school form (a concept) with the questions of the demo school's
 * default form. Its own form, so publishing it leaves the default alone for
 * the other tests.
 */
async function concept(keyuser: TestUser) {
	const me = await keyuser.client.account.me();
	const [current] = await db
		.select()
		.from(formTemplate)
		.where(
			and(
				eq(formTemplate.organizationId, me.organization!.id),
				eq(formTemplate.isSchoolDefault, true),
			),
		);
	const draft = await keyuser.client.coachplan.templates.create({ name: "Formulierbouwer test" });
	await copyQuestions(db, current!.id, draft.id);
	return { current: current!, draft };
}

const questionsOf = async (keyuser: TestUser, id: string) =>
	(await keyuser.client.coachplan.templates.get({ id })).questions;

/** A client for a leerling without a demo session (see form-visibility.test). */
async function leerlingClient(leerlingId: string, like: TestUser) {
	const { auth } = await import("../src/auth");
	const { token } = await (await auth.$context).internalAdapter.createSession(leerlingId);
	const { createORPCClient } = await import("@orpc/client");
	const { RPCLink } = await import("@orpc/client/fetch");
	const { handleRequest } = await import("../src/app");
	return createORPCClient(
		new RPCLink({
			url: "http://localhost:3200/rpc",
			fetch: (input, init) => {
				const req = new Request(input, init);
				req.headers.set("authorization", `Bearer ${token}`);
				req.headers.set("origin", "http://localhost:3200");
				return handleRequest(req);
			},
		}),
	) as typeof like.client;
}

async function expectBadRequest(fn: () => Promise<unknown>, message?: RegExp) {
	let error: unknown;
	try {
		await fn();
	} catch (e) {
		error = e;
	}
	expect(error, "expected the call to be refused").toBeDefined();
	expect((error as { code?: string }).code).toBe("BAD_REQUEST");
	if (message) expect(String((error as Error).message)).toMatch(message);
}

describe("INC-34: insert a question before or after another", () => {
	test("before the first, between two and after the last; the others keep their order", async () => {
		const keyuser = await asUser("keyuser");
		const { draft } = await concept(keyuser);
		try {
			const before = await questionsOf(keyuser, draft.id);
			const first = before[0]!;
			const second = before[1]!;
			const last = before.at(-1)!;

			const atStart = await keyuser.client.coachplan.questions.create({
				templateId: draft.id,
				label: "Nieuw begin",
				anchor: { questionId: first.id, place: "before" },
			});
			const between = await keyuser.client.coachplan.questions.create({
				templateId: draft.id,
				label: "Nieuw tussen",
				anchor: { questionId: first.id, place: "after" },
			});
			const atEnd = await keyuser.client.coachplan.questions.create({
				templateId: draft.id,
				label: "Nieuw eind",
				anchor: { questionId: last.id, place: "after" },
			});

			const after = await questionsOf(keyuser, draft.id);
			const ids = after.map((q) => q.id);
			expect(ids).toEqual([
				atStart.id,
				first.id,
				between.id,
				...before.slice(1).map((q) => q.id),
				atEnd.id,
			]);
			// Positions are unique and follow the order.
			expect(after.map((q) => q.position)).toEqual(after.map((_, i) => i));
			// Existing questions keep their content and settings (AC3, AC6).
			for (const q of before) {
				const now = after.find((x) => x.id === q.id)!;
				expect({ ...now, position: 0 }).toEqual({ ...q, position: 0 });
			}
			// The new question takes the part and theme of its neighbour, and
			// no correspondence (AC6).
			expect(between.section).toBe(first.section);
			expect(between.options?.theme).toBe(first.options?.theme);
			expect(between.mapsToQuestionId).toBeNull();
			expect(atEnd.section).toBe(last.section);
			expect(second.id).toBe(ids[3]!);

			// Published and copied into a new version, the order stays (AC4, AC7).
			await keyuser.client.coachplan.templates.publish({ id: draft.id });
			const next = await keyuser.client.coachplan.templates.newVersion({ id: draft.id });
			try {
				const copied = await questionsOf(keyuser, next.id);
				expect(copied.map((q) => q.label)).toEqual(after.map((q) => q.label));
				// The published version can't get questions any more (AC7).
				let refused: unknown;
				try {
					await keyuser.client.coachplan.questions.create({
						templateId: draft.id,
						label: "Te laat",
						anchor: { questionId: first.id, place: "before" },
					});
				} catch (e) {
					refused = e;
				}
				expect((refused as { code?: string }).code).toBe("CONFLICT");
			} finally {
				await keyuser.client.coachplan.templates.discardDraft({ id: next.id });
			}
		} finally {
			const latest = (await keyuser.client.coachplan.templates.list()).find(
				(t) => t.familyId === draft.familyId,
			)!;
			if (!latest.publishedAt) {
				await keyuser.client.coachplan.templates.discardDraft({ id: latest.id });
			}
		}
	});

	test("an anchor from another form is refused", async () => {
		const keyuser = await asUser("keyuser");
		const empty = await keyuser.client.coachplan.templates.create({ name: "Leeg formulier" });
		const { draft } = await concept(keyuser);
		try {
			const other = (await questionsOf(keyuser, draft.id))[0]!;
			let error: unknown;
			try {
				await keyuser.client.coachplan.questions.create({
					templateId: empty.id,
					label: "Ergens anders",
					anchor: { questionId: other.id, place: "after" },
				});
			} catch (e) {
				error = e;
			}
			expect((error as { code?: string }).code).toBe("NOT_FOUND");
			// An empty form still gets its first question the usual way (AC5).
			const firstQ = await keyuser.client.coachplan.questions.create({
				templateId: empty.id,
				label: "Eerste vraag",
			});
			expect(firstQ.position).toBe(0);
		} finally {
			await keyuser.client.coachplan.templates.discardDraft({ id: draft.id });
			await keyuser.client.coachplan.templates.discardDraft({ id: empty.id });
		}
	});
});

describe("INC-31: leerling wording", () => {
	test("kept with the question and shown to the leerling only", async () => {
		const keyuser = await asUser("keyuser");
		const coach = await asUser("coach");
		const { draft } = await concept(keyuser);
		const qs = await questionsOf(keyuser, draft.id);
		const leerlingQ = qs.find((q) => q.section === "leerling" && q.type === "long_text")!;
		const plainQ = qs.find((q) => q.section === "leerling" && q.id !== leerlingQ.id)!;

		const updated = await keyuser.client.coachplan.questions.update({
			id: leerlingQ.id,
			leerlingLabel: "  Wat vind je leuk?  ",
		});
		expect(updated.leerlingLabel).toBe("Wat vind je leuk?");
		// Type, order and visibility are untouched (AC6).
		expect(updated.type).toBe(leerlingQ.type);
		expect(updated.position).toBe(leerlingQ.position);
		expect(updated.visibleToLeerling).toBe(leerlingQ.visibleToLeerling);
		expect(updated.label).toBe(leerlingQ.label);

		await keyuser.client.coachplan.templates.publish({ id: draft.id });
		let next: { id: string } | undefined;
		try {
			const me = await keyuser.client.account.me();
			const leerlingId = await createAccount({
				email: "leerlingtaal.leerling@school.nl",
				name: "Leerlingtaal Leerling",
				role: "leerling",
				organizationId: me.organization!.id,
			});
			await keyuser.client.admin.assignments.set({ coachId: coach.id, leerlingId, assigned: true });
			await keyuser.client.coachplan.templates.assignToLeerling({ leerlingId, templateId: draft.id });
			const leerling = await leerlingClient(leerlingId, coach);

			// The wizard shows the leerling wording, or the normal one (AC3, AC4).
			const started = await leerling.coachplan.startMine();
			const seen = started.template.questions.find((q) => q.id === leerlingQ.id)!;
			expect(seen.label).toBe("Wat vind je leuk?");
			expect(started.template.questions.find((q) => q.id === plainQ.id)!.label).toBe(plainQ.label);

			await leerling.coachplan.saveAnswer({
				submissionId: started.submission.id,
				questionId: leerlingQ.id,
				value: "Tekenen",
			});
			await leerling.coachplan.submit({ submissionId: started.submission.id });

			const forLeerling = await leerling.coachplan.getSubmission({ id: started.submission.id });
			expect(forLeerling.questions.find((q) => q.id === leerlingQ.id)!.label).toBe(
				"Wat vind je leuk?",
			);
			const forCoach = await coach.client.coachplan.getSubmission({ id: started.submission.id });
			expect(forCoach.questions.find((q) => q.id === leerlingQ.id)!.label).toBe(leerlingQ.label);

			// The pdf too: the leerling's has their wording, the coach's the normal one.
			await coach.client.coachplan.shareWithLeerling({ submissionId: started.submission.id });
			const plans: PdfPlan[] = [];
			const pdf = { ...(await import("../src/coachplan/pdf")) };
			mock.module("../src/coachplan/pdf", () => ({
				...pdf,
				renderPlanPdf: async (plan: PdfPlan) => {
					plans.push(plan);
					return new Uint8Array([1]);
				},
			}));
			try {
				await leerling.coachplan.generatePdf({ id: started.submission.id });
				await coach.client.coachplan.generatePdf({ id: started.submission.id });
			} finally {
				mock.module("../src/coachplan/pdf", () => pdf);
			}
			expect(plans[0]!.questions.map((q) => q.label)).toContain("Wat vind je leuk?");
			expect(plans[1]!.questions.map((q) => q.label)).not.toContain("Wat vind je leuk?");
			expect(plans[1]!.questions.find((q) => q.label === leerlingQ.label)!.answer).toBe("Tekenen");

			// A new concept version keeps the wording (AC5); changing it there
			// leaves the given answer alone (AC7).
			next = await keyuser.client.coachplan.templates.newVersion({ id: draft.id });
			const nextQ = (await questionsOf(keyuser, next.id)).find((q) => q.key === leerlingQ.key)!;
			expect(nextQ.leerlingLabel).toBe("Wat vind je leuk?");
			const cleared = await keyuser.client.coachplan.questions.update({
				id: nextQ.id,
				leerlingLabel: "   ",
			});
			expect(cleared.leerlingLabel).toBeNull();
			const again = await coach.client.coachplan.getSubmission({ id: started.submission.id });
			expect(again.answers.find((a) => a.questionId === leerlingQ.id)!.value).toBe("Tekenen");
		} finally {
			if (next) await keyuser.client.coachplan.templates.discardDraft({ id: next.id });
		}
	});
});

describe("INC-29: options of a multiple choice question", () => {
	test("options need text, at least two of them, and keep their order and variant", async () => {
		const keyuser = await asUser("keyuser");
		const { draft } = await concept(keyuser);
		try {
			const q = await keyuser.client.coachplan.questions.create({
				templateId: draft.id,
				label: "Welke vakken vind je leuk?",
				type: "multiple_choice",
			});
			// A choice question without options can't be published yet.
			await expectBadRequest(
				() => keyuser.client.coachplan.templates.publish({ id: draft.id }),
				/twee antwoordopties/,
			);
			await expectBadRequest(
				() =>
					keyuser.client.coachplan.questions.update({
						id: q.id,
						options: { choices: [{ value: "a", label: "Wiskunde" }] },
					}),
				/minstens twee/,
			);
			await expectBadRequest(
				() =>
					keyuser.client.coachplan.questions.update({
						id: q.id,
						options: {
							choices: [
								{ value: "a", label: "Wiskunde" },
								{ value: "b", label: "   " },
							],
						},
					}),
				/elke antwoordoptie/,
			);

			const saved = await keyuser.client.coachplan.questions.update({
				id: q.id,
				options: {
					allowOther: true,
					choices: [
						{ value: "b", label: " Biologie " },
						{ value: "a", label: "Wiskunde" },
					],
				},
			});
			expect(saved.options?.allowOther).toBe(true);
			expect(saved.options?.choices).toEqual([
				{ value: "b", label: "Biologie" },
				{ value: "a", label: "Wiskunde" },
			]);
			const reread = (await questionsOf(keyuser, draft.id)).find((x) => x.id === q.id)!;
			expect(reread.options).toEqual(saved.options);

			// "Eén optie mogelijk" is the single choice type.
			const single = await keyuser.client.coachplan.questions.update({ id: q.id, type: "single_choice" });
			expect(single.type).toBe("single_choice");
			expect(single.options?.choices).toHaveLength(2);
		} finally {
			await keyuser.client.coachplan.templates.discardDraft({ id: draft.id });
		}
	});

	test("an answer shows the chosen options and the free field", () => {
		const question = {
			type: "multiple_choice",
			options: {
				allowOther: true,
				choices: [
					{ value: "a", label: "Wiskunde" },
					{ value: "b", label: "Biologie" },
				],
			},
		} as never;
		const answer = (value: string | null, valueJson: string[] | null) =>
			({ value, valueJson, deliberatelySkipped: false }) as never;
		expect(answerText(answer("Geschiedenis", ["b", "a"]), question)).toBe(
			"Biologie, Wiskunde, Geschiedenis",
		);
		// The free field alone is an answer; only spaces are not (AC7, AC8).
		expect(answerText(answer("Geschiedenis", []), question)).toBe("Geschiedenis");
		expect(answerText(answer("   ", []), question)).toBeNull();
		expect(answerText(answer(null, ["a"]), question)).toBe("Wiskunde");
	});
});
