/**
 * INC-14: after handing in, the leerling may still change their answers until
 * the coach starts on the coach part or shares the plan; the coach always sees
 * the newest answers (INC-12).
 */
import { db } from "@incluvo/drizzle";
import { formQuestion } from "@incluvo/drizzle/schema";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { handleRequest } from "../src/app";
import { auth } from "../src/auth";
import type { Router } from "../src/router";
import { createAccount } from "../src/users";
import { type TestUser, asUser } from "./harness";

let coach: TestUser;
let counter = 0;

/** A fresh leerling of the demo coach, with a handed-in plan. */
async function handedIn() {
	const keyuser = await asUser("keyuser");
	const me = await keyuser.client.account.me();
	const id = await createAccount({
		email: `inlever.leerling.${++counter}@school.nl`,
		name: `Inlever Leerling ${counter}`,
		role: "leerling",
		organizationId: me.organization!.id,
	});
	await keyuser.client.admin.assignments.set({ coachId: coach.id, leerlingId: id, assigned: true });
	const { token } = await (await auth.$context).internalAdapter.createSession(id);
	const client: RouterClient<Router> = createORPCClient(
		new RPCLink({
			url: "http://localhost:3200/rpc",
			fetch: (input, init) => {
				const req = new Request(input, init);
				req.headers.set("authorization", `Bearer ${token}`);
				req.headers.set("origin", "http://localhost:3200");
				return handleRequest(req);
			},
		}),
	);
	const draft = await client.coachplan.startMine();
	const questions = draft.template.questions;
	// A text question whose answer pre-fills a coach question (#18), if the
	// demo form has one; otherwise any text question.
	const mapped = await db
		.select({ id: formQuestion.id, mapsTo: formQuestion.mapsToQuestionId })
		.from(formQuestion)
		.where(eq(formQuestion.templateId, draft.submission.templateId));
	const text = questions.filter(
		(q) => q.section === "leerling" && (q.type === "long_text" || q.type === "short_text"),
	);
	const withMapping = text.find((q) => mapped.find((m) => m.id === q.id)?.mapsTo);
	const question = withMapping ?? text[0]!;
	const coachQuestion = questions.find((q) => q.section === "coach")!;
	await client.coachplan.saveAnswer({
		submissionId: draft.submission.id,
		questionId: question.id,
		value: "Eerste antwoord",
	});
	await client.coachplan.submit({ submissionId: draft.submission.id });
	return {
		client,
		submissionId: draft.submission.id,
		question,
		coachQuestion,
		mapsTo: mapped.find((m) => m.id === question.id)?.mapsTo ?? null,
	};
}

async function errorOf(fn: () => Promise<unknown>) {
	try {
		await fn();
	} catch (e) {
		return e as { code?: string; message?: string };
	}
	return null;
}

beforeAll(async () => {
	coach = await asUser("coach");
});

describe("editing a handed-in plan", () => {
	test("the leerling changes answers and markers; the coach sees the newest", async () => {
		const plan = await handedIn();
		await plan.client.coachplan.saveAnswer({
			submissionId: plan.submissionId,
			questionId: plan.question.id,
			value: "Verbeterd antwoord",
			discussWithCoach: true,
		});
		const forCoach = await coach.client.coachplan.getSubmission({ id: plan.submissionId });
		expect(forCoach.submission.status).toBe("submitted");
		const answer = forCoach.answers.find((a) => a.questionId === plan.question.id);
		expect(answer?.value).toBe("Verbeterd antwoord");
		expect(answer?.discussWithCoach).toBe(true);
		// A coach answer pre-filled from it follows along.
		if (plan.mapsTo) {
			expect(forCoach.answers.find((a) => a.questionId === plan.mapsTo)?.value).toBe(
				"Verbeterd antwoord",
			);
		}
		// Still the same version, and it can't be handed in twice.
		const state = await plan.client.coachplan.mine();
		expect(state.latest?.id).toBe(plan.submissionId);
		expect((await errorOf(() => plan.client.coachplan.submit({ submissionId: plan.submissionId })))?.code).toBe(
			"CONFLICT",
		);
	});

	test("the coach's first input locks the leerling's answers, for good", async () => {
		const plan = await handedIn();
		// Reading the plan doesn't lock it.
		await coach.client.coachplan.getSubmission({ id: plan.submissionId });
		await coach.client.coachplan.listMappings({ id: plan.submissionId });
		await plan.client.coachplan.saveAnswer({
			submissionId: plan.submissionId,
			questionId: plan.question.id,
			value: "Nog even aangepast",
		});

		const started = await coach.client.coachplan.startCoachReview({ submissionId: plan.submissionId });
		expect(started.status).toBe("coach_review");
		// Idempotent.
		await coach.client.coachplan.startCoachReview({ submissionId: plan.submissionId });

		const refused = await errorOf(() =>
			plan.client.coachplan.saveAnswer({
				submissionId: plan.submissionId,
				questionId: plan.question.id,
				value: "Te laat",
			}),
		);
		expect(refused?.code).toBe("CONFLICT");
		expect(refused?.message).toBe(
			"Je coach is begonnen met het invullen van jullie plan. Je kunt je antwoorden nu alleen nog bekijken.",
		);
		// What was saved before stays.
		const forCoach = await coach.client.coachplan.getSubmission({ id: plan.submissionId });
		expect(forCoach.answers.find((a) => a.questionId === plan.question.id)?.value).toBe(
			"Nog even aangepast",
		);
	});

	test("saving a coach answer or a leervoorkeur locks too", async () => {
		const a = await handedIn();
		await coach.client.coachplan.saveCoachAnswer({
			submissionId: a.submissionId,
			questionId: a.coachQuestion.id,
			value: "",
		});
		expect((await errorOf(() =>
			a.client.coachplan.saveAnswer({ submissionId: a.submissionId, questionId: a.question.id, value: "x" }),
		))?.code).toBe("CONFLICT");

		const b = await handedIn();
		await coach.client.coachplan.setLearningPreferences({ submissionId: b.submissionId, labels: [] });
		expect((await errorOf(() =>
			b.client.coachplan.saveAnswer({ submissionId: b.submissionId, questionId: b.question.id, value: "x" }),
		))?.code).toBe("CONFLICT");
	});

	test("sharing locks, even without any coach answer", async () => {
		const plan = await handedIn();
		await coach.client.coachplan.shareWithLeerling({ submissionId: plan.submissionId });
		const refused = await errorOf(() =>
			plan.client.coachplan.saveAnswer({
				submissionId: plan.submissionId,
				questionId: plan.question.id,
				deliberatelySkipped: true,
			}),
		);
		expect(refused?.code).toBe("CONFLICT");
	});

	test("the leerling never writes the coach part", async () => {
		const plan = await handedIn();
		const refused = await errorOf(() =>
			plan.client.coachplan.saveAnswer({
				submissionId: plan.submissionId,
				questionId: plan.coachQuestion.id,
				value: "Mijn eigen coachtekst",
			}),
		);
		expect(refused?.code).toBe("FORBIDDEN");
	});
});
