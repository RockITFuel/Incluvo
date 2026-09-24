/**
 * Fix plan 2.2 — the answer mapping (#18) and form versions (D5).
 * Runs last among the test files: it upgrades the Demo School's default form.
 */
import { db } from "@incluvo/drizzle";
import { formQuestion, formTemplate } from "@incluvo/drizzle/schema";
import { describe, expect, test } from "bun:test";
import { and, eq, isNotNull } from "drizzle-orm";
import { asUser, planVersion, withDbAt } from "./harness";

async function code(fn: () => Promise<unknown>) {
	try {
		await fn();
	} catch (e) {
		return (e as { code?: string }).code;
	}
	return "OK";
}

async function schoolDefault() {
	const keyuser = await asUser("keyuser");
	const list = await keyuser.client.coachplan.templates.list();
	return list.find((t) => t.isSchoolDefault)!;
}

describe("answer mapping (#18)", () => {
	test("a mapped leerling answer pre-fills the coach's answer, which the coach then edits", async () => {
		const leerling = await asUser("leerling2");
		const coach = await asUser("coach2");
		await planVersion(leerling.id, "draft");
		const draft = await leerling.client.coachplan.startMine();
		const [mapped] = await db
			.select()
			.from(formQuestion)
			.where(and(eq(formQuestion.templateId, draft.template.id), isNotNull(formQuestion.mapsToQuestionId)));
		await leerling.client.coachplan.saveAnswer({
			submissionId: draft.submission.id,
			questionId: mapped!.id,
			value: "Ik ben goed in tekenen",
		});
		await leerling.client.coachplan.submit({ submissionId: draft.submission.id });

		const view = await coach.client.coachplan.getSubmission({ id: draft.submission.id });
		const coachAnswer = () =>
			view.answers.find((a) => a.questionId === mapped!.mapsToQuestionId)?.value;
		expect(coachAnswer()).toBe("Ik ben goed in tekenen");
		const mappings = await coach.client.coachplan.listMappings({ id: draft.submission.id });
		expect(mappings.map((m) => m.coachQuestionId)).toContain(mapped!.mapsToQuestionId!);

		await coach.client.coachplan.saveCoachAnswer({
			submissionId: draft.submission.id,
			questionId: mapped!.mapsToQuestionId!,
			value: "Sterk in tekenen en vormgeven",
		});
		const after = await coach.client.coachplan.getSubmission({ id: draft.submission.id });
		expect(after.answers.filter((a) => a.questionId === mapped!.mapsToQuestionId)).toHaveLength(1);
		expect(after.answers.find((a) => a.questionId === mapped!.mapsToQuestionId)?.value).toBe(
			"Sterk in tekenen en vormgeven",
		);
	});

	test("a school's copy of a form keeps the mapping, pointing at its own questions", async () => {
		const keyuser = await asUser("keyuser");
		const ondivera = (await keyuser.client.coachplan.templates.list()).find((t) => t.scope === "ondivera")!;
		const copy = await keyuser.client.coachplan.templates.copyToSchool({ id: ondivera.id });
		const qs = await db.select().from(formQuestion).where(eq(formQuestion.templateId, copy.id));
		const withMapping = qs.filter((q) => q.mapsToQuestionId);
		expect(withMapping.length).toBeGreaterThan(0);
		for (const q of withMapping) {
			expect(qs.map((x) => x.id)).toContain(q.mapsToQuestionId!);
		}
	});
});

describe("form versions (D5)", () => {
	test("a form with plans on it can't be edited in place; a new version can", async () => {
		const keyuser = await asUser("keyuser");
		const current = await schoolDefault();
		expect(current.inUse).toContain("plannen");
		const detail = await keyuser.client.coachplan.templates.get({ id: current.id });
		const q = detail.questions[0]!;
		expect(await code(() => keyuser.client.coachplan.questions.update({ id: q.id, label: "Anders" }))).toBe(
			"CONFLICT",
		);

		const v2 = await keyuser.client.coachplan.templates.newVersion({ id: current.id });
		expect(v2.version).toBe(current.version + 1);
		expect(v2.familyId).toBe(current.familyId);
		const v2detail = await keyuser.client.coachplan.templates.get({ id: v2.id });
		expect(v2detail.inUse).toBeNull();
		await keyuser.client.coachplan.questions.update({ id: v2detail.questions[0]!.id, label: "Anders" });
		// The list shows one entry per form: the newest version.
		const list = await keyuser.client.coachplan.templates.list();
		expect(list.filter((t) => t.familyId === current.familyId).map((t) => t.id)).toEqual([v2.id]);
		// Plans keep their version: the old one is unchanged.
		const old = await keyuser.client.coachplan.templates.get({ id: current.id });
		expect(old.questions[0]!.label).toBe(q.label);
	});

	test("a school upgrades to a newer Ondivera version when it chooses; revised plans carry answers over", async () => {
		const superadmin = await asUser("superadmin");
		const keyuser = await asUser("keyuser");
		const leerling = await asUser("leerling");

		// The school's default is still the copy of Ondivera v1 (the v2 above
		// was never made default). Make it current again for this scenario.
		const [schoolV1] = await db
			.select()
			.from(formTemplate)
			.where(and(eq(formTemplate.isSchoolDefault, true), eq(formTemplate.scope, "school")));
		const [source] = await db.select().from(formTemplate).where(eq(formTemplate.id, schoolV1!.parentTemplateId!));

		// Ondivera publishes version 2 with a reworded question.
		const ondiveraV2 = await superadmin.client.coachplan.templates.newVersion({ id: source!.id });
		const v2qs = (await superadmin.client.coachplan.templates.get({ id: ondiveraV2.id })).questions;
		const reworded = v2qs.find((q) => q.section === "leerling")!;
		await superadmin.client.coachplan.questions.update({ id: reworded.id, label: "Wat doe je graag?" });

		const listed = (await keyuser.client.coachplan.templates.list()).find(
			(t) => t.familyId === schoolV1!.familyId,
		)!;
		expect(listed.sourceUpdateVersion).toBe(ondiveraV2.version);

		// Before upgrading: the leerling has a shared plan with an answer.
		const plan = await planVersion(leerling.id, "draft");
		const firstLeerlingQ = (await db
			.select()
			.from(formQuestion)
			.where(and(eq(formQuestion.templateId, plan.templateId), eq(formQuestion.key, reworded.key)))
		)[0]!;
		await leerling.client.coachplan.saveAnswer({
			submissionId: plan.id,
			questionId: firstLeerlingQ.id,
			value: "Voetbal",
		});
		await leerling.client.coachplan.submit({ submissionId: plan.id });
		await (await asUser("coach")).client.coachplan.shareWithLeerling({ submissionId: plan.id });

		const upgraded = await keyuser.client.coachplan.templates.upgradeFromSource({ id: listed.id });
		expect(upgraded.parentTemplateId).toBe(ondiveraV2.id);
		expect(upgraded.isSchoolDefault).toBe(true);

		// The plan filled in before stays on its form…
		const shared = await leerling.client.coachplan.getSubmission({ id: plan.id });
		expect(shared.template?.id).toBe(plan.templateId);
		// …and a revision moves to the new form with the answer carried over.
		const v = await leerling.client.coachplan.revise();
		expect(v.templateId).toBe(upgraded.id);
		const draft = await leerling.client.coachplan.startMine();
		const q = draft.template.questions.find((x) => x.label === "Wat doe je graag?")!;
		expect(draft.answers.find((a) => a.questionId === q.id)?.value).toBe("Voetbal");
	});

	test("there is nothing to upgrade once the school is on the newest source", async () => {
		const keyuser = await asUser("keyuser");
		const current = await schoolDefault();
		expect(current.sourceUpdateVersion).toBeNull();
		expect(await code(() => keyuser.client.coachplan.templates.upgradeFromSource({ id: current.id }))).toBe(
			"CONFLICT",
		);
	});
});

describe("migration 0011", () => {
	test("gives copies their source's question keys and turns overrides into coach answers", async () => {
		await withDbAt(10, async (pool, migrateRest) => {
			const O = "00000000-0000-0000-0000-000000000001";
			const id = (n: number) => `00000000-0000-0000-0000-0000000000${String(n).padStart(2, "0")}`;
			await pool.query(`
				INSERT INTO organization (id, name) VALUES ('${O}', 'S');
				INSERT INTO "user" (id, name, email) VALUES ('l', 'L', 'l@x');
				INSERT INTO form_template (id, name, scope) VALUES ('${id(1)}', 'Bron', 'ondivera');
				INSERT INTO form_template (id, name, scope, organization_id, parent_template_id) VALUES ('${id(2)}', 'Kopie', 'school', '${O}', '${id(1)}');
				INSERT INTO form_question (id, template_id, label, position, section) VALUES
					('${id(11)}', '${id(1)}', 'Q', 0, 'leerling'), ('${id(12)}', '${id(1)}', 'C', 1, 'coach'),
					('${id(21)}', '${id(2)}', 'Q', 0, 'leerling'), ('${id(22)}', '${id(2)}', 'C', 1, 'coach');
				INSERT INTO coachplan (id, organization_id, leerling_id) VALUES ('${id(30)}', '${O}', 'l');
				INSERT INTO form_submission (id, coachplan_id, version, template_id, organization_id, leerling_id, status)
					VALUES ('${id(31)}', '${id(30)}', 1, '${id(2)}', '${O}', 'l', 'coach_review');
				INSERT INTO form_answer (id, submission_id, question_id, value) VALUES ('${id(41)}', '${id(31)}', '${id(21)}', 'leerling');
				INSERT INTO answer_coach_mapping (submission_id, source_answer_id, coach_question_id, override_value)
					VALUES ('${id(31)}', '${id(41)}', '${id(22)}', 'coach schreef dit');
			`);
			await migrateRest();
			const keys = (await pool.query("SELECT template_id, key FROM form_question WHERE label = 'Q'")).rows;
			expect(keys[0].key).toBe(keys[1].key);
			const coach = (await pool.query(`SELECT value FROM form_answer WHERE question_id = '${id(22)}'`)).rows;
			expect(coach).toEqual([{ value: "coach schreef dit" }]);
			const fam = (await pool.query("SELECT family_id = id AS own, version FROM form_template")).rows;
			expect(fam).toEqual([{ own: true, version: 1 }, { own: true, version: 1 }]);
		});
	});
});

