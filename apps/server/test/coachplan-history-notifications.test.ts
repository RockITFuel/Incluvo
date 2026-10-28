/**
 * INC-33 — a coach starts a new coachplan on a form of the school; earlier
 * plans stay as history. INC-30 — opening a notification leads to what it is
 * about, or says it is gone.
 *
 * leerling2 (coached by coach2) carries the coachplan story; leerling (coached
 * by coach) the course and chat notifications.
 */
import { db } from "@incluvo/drizzle";
import {
	assignmentSubmission,
	coachplan,
	formSubmission,
	notification,
	task,
	user,
} from "@incluvo/drizzle/schema";
import { beforeAll, describe, expect, test } from "bun:test";
import { and, desc, eq } from "drizzle-orm";
import { currentLeervoorkeuren } from "../src/coachplan/lifecycle";
import { notify } from "../src/notifications/notify";
import { type TestUser, asUser, expectForbidden } from "./harness";

async function expectConflict(fn: () => Promise<unknown>) {
	let code: string | undefined;
	try {
		await fn();
	} catch (e) {
		code = (e as { code?: string }).code;
	}
	expect(code).toBe("CONFLICT");
}

/** The newest notification of this type for a user. */
async function lastNotification(userId: string, type: (typeof notification.$inferSelect)["type"]) {
	const [row] = await db
		.select()
		.from(notification)
		.where(and(eq(notification.userId, userId), eq(notification.type, type)))
		.orderBy(desc(notification.createdAt))
		.limit(1);
	if (!row) throw new Error(`no ${type} notification`);
	return row;
}

describe("INC-33: a new coachplan", () => {
	let leerling: TestUser;
	let coach: TestUser;
	let keyuser: TestUser;
	let defaultForm: string;
	let otherForm: string;
	let firstPlan: string;
	let firstVersion: string;
	let secondPlan: string;

	beforeAll(async () => {
		leerling = await asUser("leerling2");
		coach = await asUser("coach2");
		keyuser = await asUser("keyuser");
		// Start from "no plan": other test files may have given leerling2 one.
		await db.delete(coachplan).where(eq(coachplan.leerlingId, leerling.id));

		const forms = await keyuser.client.coachplan.templates.list();
		defaultForm = forms.find((f) => f.scope === "school" && f.isSchoolDefault && f.publishedAt)!.id;
		// A second published school form, and a concept that must not be offered.
		const form = await keyuser.client.coachplan.templates.create({ name: "Plan na de zomer" });
		await keyuser.client.coachplan.questions.create({
			templateId: form.id,
			section: "leerling",
			type: "short_text",
			label: "Wat wil je dit jaar leren?",
		});
		await keyuser.client.coachplan.templates.publish({ id: form.id });
		otherForm = form.id;
		await keyuser.client.coachplan.templates.create({ name: "Nog niet af" });
	});

	test("the leerling fills in a first plan and the coach shares it", async () => {
		const start = await leerling.client.coachplan.startMine();
		firstVersion = start.submission.id;
		firstPlan = start.submission.coachplanId;
		const question = start.template.questions.find((q) => q.section === "leerling")!;
		await leerling.client.coachplan.saveAnswer({
			submissionId: firstVersion,
			questionId: question.id,
			value: "Ik leer graag met plaatjes",
		});
		await leerling.client.coachplan.submit({ submissionId: firstVersion });
		await coach.client.coachplan.setLearningPreferences({
			submissionId: firstVersion,
			labels: ["Visueel"],
		});
		await coach.client.coachplan.shareWithLeerling({ submissionId: firstVersion });
	});

	test("AC2/AC3: the coach chooses from the published forms of the school, with name and version", async () => {
		const options = await coach.client.coachplan.assignableTemplates({ leerlingId: leerling.id });
		const names = options.map((o) => o.name);
		expect(names).toContain("Plan na de zomer");
		expect(names).not.toContain("Nog niet af");
		expect(options.find((o) => o.id === defaultForm)?.isSchoolDefault).toBe(true);
		for (const o of options) expect(o.version).toBeGreaterThanOrEqual(1);
		// Only this school's forms.
		const all = await keyuser.client.coachplan.templates.list();
		const ondivera = all.filter((t) => t.scope === "ondivera").map((t) => t.id);
		for (const o of options) expect(ondivera).not.toContain(o.id);
	});

	test("AC1: only a coach of the leerling may assign", async () => {
		const otherCoach = await asUser("coach");
		const andereCoach = await asUser("andereCoach");
		const input = { leerlingId: leerling.id, templateId: otherForm, replacesPlanId: firstPlan };
		await expectForbidden(() => otherCoach.client.coachplan.assignNewPlan(input));
		await expectForbidden(() => andereCoach.client.coachplan.assignNewPlan(input));
		await expectForbidden(() => keyuser.client.coachplan.assignNewPlan(input));
		await expectForbidden(() => leerling.client.coachplan.assignNewPlan(input));
		await expectForbidden(() =>
			otherCoach.client.coachplan.assignableTemplates({ leerlingId: leerling.id }),
		);
		await expectForbidden(() => otherCoach.client.coachplan.plans({ leerlingId: leerling.id }));
	});

	test("AC2: a concept or another school's form can't be assigned", async () => {
		const concept = (await keyuser.client.coachplan.templates.list()).find(
			(t) => t.name === "Nog niet af",
		)!;
		await expectConflict(() =>
			coach.client.coachplan.assignNewPlan({
				leerlingId: leerling.id,
				templateId: concept.id,
				replacesPlanId: firstPlan,
			}),
		);
		const andereKeyuser = await asUser("andereKeyuser");
		const foreign = (await andereKeyuser.client.coachplan.templates.list()).find(
			(t) => t.scope === "school",
		);
		if (foreign) {
			await expectForbidden(() =>
				coach.client.coachplan.assignNewPlan({
					leerlingId: leerling.id,
					templateId: foreign.id,
					replacesPlanId: firstPlan,
				}),
			);
		}
	});

	test("AC4/AC5: the new plan is the actuele plan, empty, on the chosen form", async () => {
		const res = await coach.client.coachplan.assignNewPlan({
			leerlingId: leerling.id,
			templateId: otherForm,
			replacesPlanId: firstPlan,
		});
		secondPlan = res.planId;
		expect(res.submission.templateId).toBe(otherForm);
		expect(res.submission.version).toBe(1);
		expect(res.submission.status).toBe("draft");

		const state = await leerling.client.coachplan.mine();
		expect(state.latest?.id).toBe(res.submission.id);
		const wizard = await leerling.client.coachplan.startMine();
		expect(wizard.submission.id).toBe(res.submission.id);
		expect(wizard.template.name).toBe("Plan na de zomer");
		expect(wizard.answers).toEqual([]);

		// The coach sees the new plan (the draft) as the plan of this leerling.
		const profile = await coach.client.dashboard.profile({ leerlingId: leerling.id });
		expect(profile.plan.submissionId).toBe(res.submission.id);
		// The leeromgeving keeps the shared labels until the new plan is shared.
		expect(await currentLeervoorkeuren(db, leerling.id)).toEqual(["Visueel"]);
	});

	test("AC6/AC7: the earlier plan stays, with its answers, apart from the actuele one", async () => {
		const { actuelePlanId, plans } = await coach.client.coachplan.plans({ leerlingId: leerling.id });
		expect(actuelePlanId).toBe(secondPlan);
		expect(plans.map((p) => [p.id, p.actueel])).toEqual([
			[secondPlan, true],
			[firstPlan, false],
		]);
		const earlier = plans[1]!;
		expect(earlier.shown?.id).toBe(firstVersion);
		expect(earlier.replacedAt).not.toBeNull();
		expect(plans[0]!.templateName).toBe("Plan na de zomer");
		expect(plans[0]!.assignedByName).toBe("Tweede Coach");
		expect(earlier.assignedByName).toBeNull();

		const old = await leerling.client.coachplan.getSubmission({ id: firstVersion });
		expect(old.replaced).toBe(true);
		expect(old.answers.map((a) => a.value)).toContain("Ik leer graag met plaatjes");
		// The leerling sees the same history.
		const mine = await leerling.client.coachplan.plans();
		expect(mine.plans.map((p) => p.id)).toEqual([secondPlan, firstPlan]);
	});

	test("an earlier plan is read-only", async () => {
		await expectConflict(() =>
			coach.client.coachplan.setApprovedWithParents({ submissionId: firstVersion, approved: true }),
		);
		await expectConflict(() => leerling.client.coachplan.revise());
	});

	test("AC9: a second click with the same plan in view changes nothing", async () => {
		const input = { leerlingId: leerling.id, templateId: otherForm, replacesPlanId: firstPlan };
		await expectConflict(() => coach.client.coachplan.assignNewPlan(input));
		// Two at once for the actuele plan: exactly one wins.
		const both = await Promise.allSettled([
			coach.client.coachplan.assignNewPlan({ ...input, replacesPlanId: secondPlan }),
			coach.client.coachplan.assignNewPlan({ ...input, replacesPlanId: secondPlan }),
		]);
		expect(both.filter((r) => r.status === "fulfilled")).toHaveLength(1);
		const { plans } = await coach.client.coachplan.plans({ leerlingId: leerling.id });
		expect(plans).toHaveLength(3);
		expect(plans.filter((p) => p.actueel)).toHaveLength(1);
	});

	test("AC10: the same form and version again makes a separate, empty plan", async () => {
		const before = await coach.client.coachplan.plans({ leerlingId: leerling.id });
		const res = await coach.client.coachplan.assignNewPlan({
			leerlingId: leerling.id,
			templateId: otherForm,
			replacesPlanId: before.actuelePlanId,
		});
		const after = await coach.client.coachplan.plans({ leerlingId: leerling.id });
		expect(after.plans).toHaveLength(4);
		expect(after.actuelePlanId).toBe(res.planId);
		expect(after.plans.every((p) => p.versions.length === 1)).toBe(true);
		const rows = await db
			.select()
			.from(formSubmission)
			.where(eq(formSubmission.leerlingId, leerling.id));
		expect(rows).toHaveLength(4);
	});

	test("a plan being filled in when it is replaced can't be changed any more", async () => {
		const draft = await leerling.client.coachplan.startMine();
		const question = draft.template.questions.find((q) => q.section === "leerling")!;
		await leerling.client.coachplan.saveAnswer({
			submissionId: draft.submission.id,
			questionId: question.id,
			value: "Half af",
		});
		await coach.client.coachplan.assignNewPlan({
			leerlingId: leerling.id,
			templateId: defaultForm,
			replacesPlanId: draft.submission.coachplanId,
		});
		await expectConflict(() =>
			leerling.client.coachplan.saveAnswer({
				submissionId: draft.submission.id,
				questionId: question.id,
				value: "Nog iets",
			}),
		);
		await expectConflict(() => leerling.client.coachplan.submit({ submissionId: draft.submission.id }));
		const kept = await leerling.client.coachplan.getSubmission({ id: draft.submission.id });
		expect(kept.answers.map((a) => a.value)).toContain("Half af");
	});

	test("the coach inbox shows the actuele plan only", async () => {
		const inbox = await coach.client.coachplan.inbox();
		expect(inbox.some((r) => r.submission.id === firstVersion)).toBe(false);
	});

	test("the leerling hears about the new plan", async () => {
		const n = await lastNotification(leerling.id, "coachplan_assigned");
		expect(n.title).toBe("Nieuw coachplan");
		expect(n.entityType).toBe("form_submission");
	});
});

describe("INC-30: a notification opens what it is about", () => {
	let leerling2: TestUser;
	let coach2: TestUser;

	beforeAll(async () => {
		leerling2 = await asUser("leerling2");
		coach2 = await asUser("coach2");
	});

	test("AC1: a coachplan notification opens the plan, for the leerling and the coach", async () => {
		const assigned = await lastNotification(leerling2.id, "coachplan_assigned");
		const forLeerling = await leerling2.client.notifications.open({ id: assigned.id });
		const { actuelePlanId } = await leerling2.client.coachplan.plans();
		expect(forLeerling.target).toEqual({ kind: "mijn_plan", planId: actuelePlanId! });
		// Opening marks it read.
		const [row] = await db.select().from(notification).where(eq(notification.id, assigned.id));
		expect(row?.read).toBe(true);

		const start = await leerling2.client.coachplan.startMine();
		await leerling2.client.coachplan.submit({ submissionId: start.submission.id });
		const submitted = await lastNotification(coach2.id, "coachplan_submitted");
		const forCoach = await coach2.client.notifications.open({ id: submitted.id });
		expect(forCoach.target).toEqual({ kind: "coachplan", submissionId: start.submission.id });
	});

	test("AC2: a task notification opens the task; a deleted task says so", async () => {
		const added = await coach2.client.tasks.add({ title: "Lezen", leerlingId: leerling2.id });
		const n = await lastNotification(leerling2.id, "task_new");
		const res = await leerling2.client.notifications.open({ id: n.id });
		expect(res.target).toEqual({ kind: "taken", leerlingId: null, taskId: added.id });

		await db.delete(task).where(eq(task.id, added.id));
		const gone = await leerling2.client.notifications.open({ id: n.id });
		expect(gone.target.kind).toBe("unavailable");
	});

	test("the daily task notification opens the takenlijst; a general one opens nothing", async () => {
		const [me] = await db
			.select({ organizationId: user.organizationId })
			.from(user)
			.where(eq(user.id, leerling2.id));
		const orgId = me!.organizationId!;
		const daily = await notify(db, {
			userId: leerling2.id,
			organizationId: orgId,
			type: "task_due_today",
			title: "Je taken voor vandaag",
		});
		expect((await leerling2.client.notifications.open({ id: daily.id })).target).toEqual({
			kind: "taken",
			leerlingId: null,
			taskId: null,
		});
		const general = await notify(db, {
			userId: leerling2.id,
			organizationId: orgId,
			type: "generic",
			title: "Welkom",
		});
		expect((await leerling2.client.notifications.open({ id: general.id })).target).toEqual({
			kind: "none",
		});
	});

	test("AC3/AC6: a handed-in and a graded opdracht open the opdracht, for coach and leerling", async () => {
		const leerling = await asUser("leerling");
		const coach = await asUser("coach");
		const [course] = await leerling.client.courses.list({ kind: "student_execution" });
		const tree = await leerling.client.courses.tree({ id: course!.id });
		const block = tree.sections.flatMap((s) => s.blocks).find((b) => b.assignment)!;
		const assignmentId = block.assignment!.id;
		await db
			.delete(assignmentSubmission)
			.where(
				and(
					eq(assignmentSubmission.assignmentId, assignmentId),
					eq(assignmentSubmission.leerlingId, leerling.id),
				),
			);
		const sub = await leerling.client.courses.submitAssignment({
			assignmentId,
			responseText: "Klaar",
		});

		const handedIn = await lastNotification(coach.id, "course_activity");
		expect(handedIn.entityId).toBe(sub.id);
		expect((await coach.client.notifications.open({ id: handedIn.id })).target).toEqual({
			kind: "cursus",
			courseId: course!.id,
			tab: "beoordelen",
			blockId: block.id,
		});

		await coach.client.courses.gradeSubmission({ submissionId: sub.id, feedbackText: "Goed" });
		const graded = await lastNotification(leerling.id, "course_activity");
		expect(graded.title).toBe("Opdracht beoordeeld");
		expect((await leerling.client.notifications.open({ id: graded.id })).target).toEqual({
			kind: "cursus",
			courseId: course!.id,
			tab: "leren",
			blockId: block.id,
		});

		await db.delete(assignmentSubmission).where(eq(assignmentSubmission.id, sub.id));
		expect((await leerling.client.notifications.open({ id: graded.id })).target.kind).toBe(
			"unavailable",
		);
	});

	test("AC4: a chat notification still opens the chat", async () => {
		const leerling = await asUser("leerling");
		const coach = await asUser("coach");
		const { id: conversationId } = await coach.client.chat.ensureDirect({ otherUserId: leerling.id });
		await coach.client.chat.send({ conversationId, body: "Hoi!" });
		const n = await lastNotification(leerling.id, "chat_message");
		expect((await leerling.client.notifications.open({ id: n.id })).target).toEqual({
			kind: "chat",
			conversationId,
		});
	});

	test("AC7: no data for what the user may no longer see", async () => {
		// A coach who doesn't coach leerling2 (e.g. the koppeling ended).
		const coach = await asUser("coach");
		const [sub] = await db
			.select({ id: formSubmission.id, organizationId: formSubmission.organizationId })
			.from(formSubmission)
			.where(eq(formSubmission.leerlingId, leerling2.id))
			.limit(1);
		const stale = await notify(db, {
			userId: coach.id,
			organizationId: sub!.organizationId,
			type: "coachplan_submitted",
			title: "Nieuw coachplan ontvangen",
			entity: { type: "form_submission", id: sub!.id },
		});
		const res = await coach.client.notifications.open({ id: stale.id });
		expect(res.target.kind).toBe("unavailable");
		expect(JSON.stringify(res)).not.toContain(sub!.id);

		// Someone else's notification can't be opened at all.
		await expectForbidden(() => leerling2.client.notifications.open({ id: stale.id }));
	});

	test("AC6: a keyuser told about a leerling without a coach goes to linking a coach", async () => {
		const [sub] = await db
			.select({ id: formSubmission.id, organizationId: formSubmission.organizationId })
			.from(formSubmission)
			.where(eq(formSubmission.leerlingId, leerling2.id))
			.limit(1);
		const keyuser = await asUser("keyuser");
		const n = await notify(db, {
			userId: keyuser.id,
			organizationId: sub!.organizationId,
			type: "coachplan_submitted",
			title: "Nieuw coachplan ontvangen",
			entity: { type: "form_submission", id: sub!.id },
		});
		// Not the plan itself: a keyuser doesn't read it.
		expect((await keyuser.client.notifications.open({ id: n.id })).target).toEqual({
			kind: "coach_koppelen",
			leerlingId: leerling2.id,
		});

		// A keyuser of another school gets nothing about this leerling.
		const other = await asUser("andereKeyuser");
		const foreign = await notify(db, {
			userId: other.id,
			organizationId: sub!.organizationId,
			type: "coachplan_submitted",
			title: "Nieuw coachplan ontvangen",
			entity: { type: "form_submission", id: sub!.id },
		});
		const res = await other.client.notifications.open({ id: foreign.id });
		expect(res.target.kind).toBe("unavailable");
		expect(JSON.stringify(res)).not.toContain(leerling2.id);
	});
});
