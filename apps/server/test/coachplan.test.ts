/**
 * Fix plan 1.1 — coachplan leaks:
 *   - a coach answer can only be saved for a coach question of the plan's own
 *     template;
 *   - the leerling sees the coach part (answers, leervoorkeuren, PDF) only
 *     after the coach shares the plan.
 */
import { db } from "@incluvo/drizzle";
import { formQuestion, formSubmission, formTemplate } from "@incluvo/drizzle/schema";
import { beforeAll, describe, expect, test } from "bun:test";
import { and, eq, ne } from "drizzle-orm";
import { asUser, expectForbidden } from "./harness";

let submissionId: string;
let coachQuestionId: string;
let foreignCoachQuestionId: string;

beforeAll(async () => {
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
	submissionId = plan!.id;

	const [own] = await db
		.select({ id: formQuestion.id })
		.from(formQuestion)
		.where(and(eq(formQuestion.templateId, template!.id), eq(formQuestion.section, "coach")));
	const [foreign] = await db
		.select({ id: formQuestion.id })
		.from(formQuestion)
		.where(and(ne(formQuestion.templateId, template!.id), eq(formQuestion.section, "coach")));
	if (!own || !foreign) throw new Error("seed lacks coach questions in two templates");
	coachQuestionId = own.id;
	foreignCoachQuestionId = foreign.id;
});

describe("coach answers", () => {
	test("are refused for a question from another template", async () => {
		const coach = await asUser("coach");
		await expectForbidden(() =>
			coach.client.coachplan.saveCoachAnswer({
				submissionId,
				questionId: foreignCoachQuestionId,
				value: "hoort hier niet",
			}),
		);
	});

	test("stay hidden from the leerling until the plan is shared", async () => {
		const coach = await asUser("coach");
		const leerling = await asUser("leerling");
		await coach.client.coachplan.saveCoachAnswer({
			submissionId,
			questionId: coachQuestionId,
			value: "Werkt graag met beeld",
		});

		const coachView = await coach.client.coachplan.getSubmission({ id: submissionId });
		expect(coachView.answers.map((a) => a.questionId)).toContain(coachQuestionId);

		const before = await leerling.client.coachplan.getSubmission({ id: submissionId });
		expect(before.answers.map((a) => a.questionId)).not.toContain(coachQuestionId);
		await expectForbidden(() => leerling.client.coachplan.generatePdf({ id: submissionId }));

		await coach.client.coachplan.shareWithLeerling({ submissionId });
		const after = await leerling.client.coachplan.getSubmission({ id: submissionId });
		expect(after.answers.map((a) => a.questionId)).toContain(coachQuestionId);
	});
});
