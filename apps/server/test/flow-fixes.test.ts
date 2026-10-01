/**
 * Fixes from docs/ROLLEN-EN-FLOWS.md §3:
 *  1. a leerling can't write the coach-gedeelte;
 *  2. notifications reach someone even without a koppeling;
 *  3. overdue tasks show under Vandaag, and the daily "taken voor vandaag";
 *  4. the coach hears about hand-ins and proposals.
 */
import { db } from "@incluvo/drizzle";
import { coachAssignment, formQuestion, notification, task } from "@incluvo/drizzle/schema";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { beforeAll, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { handleRequest } from "../src/app";
import { auth } from "../src/auth";
import { sendTaskDueToday } from "../src/notifications/daily";
import type { Router } from "../src/router";
import { dutchDay } from "../src/time";
import { createAccount } from "../src/users";
import { asUser, expectForbidden, planVersion, userId } from "./harness";

let organizationId: string;
let counter = 0;

/** A fresh leerling in Demo School with a signed-in client. */
async function newLeerling(): Promise<{ id: string; client: RouterClient<Router> }> {
	const id = await createAccount({
		email: `flow.leerling.${++counter}@school.nl`,
		name: `Flow Leerling ${counter}`,
		role: "leerling",
		organizationId,
	});
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
	return { id, client };
}

async function notificationsFor(userId: string, type: string) {
	return db
		.select()
		.from(notification)
		.where(and(eq(notification.userId, userId), eq(notification.type, type as never)));
}

beforeAll(async () => {
	organizationId = (await (await asUser("keyuser")).client.account.me()).organization!.id;
});

describe("coachplan", () => {
	test("a leerling can't answer a coach question, and a plan without coach reaches the keyuser", async () => {
		const leerling = await newLeerling();
		const draft = await planVersion(leerling.id, "draft");
		const questions = await db
			.select({ id: formQuestion.id, section: formQuestion.section })
			.from(formQuestion)
			.where(eq(formQuestion.templateId, draft.templateId));
		const own = questions.find((q) => q.section === "leerling")!;
		const coachQ = questions.find((q) => q.section === "coach")!;

		await expectForbidden(() =>
			leerling.client.coachplan.saveAnswer({
				submissionId: draft.id,
				questionId: coachQ.id,
				value: "Ik vul het coach-gedeelte zelf in",
			}),
		);
		await leerling.client.coachplan.saveAnswer({
			submissionId: draft.id,
			questionId: own.id,
			value: "Ik teken graag",
			discussWithCoach: true,
		});
		await leerling.client.coachplan.submit({ submissionId: draft.id });

		// No koppeling: the school's keyuser hears it, with the discuss count.
		const keyuser = await userId("keyuser");
		const sent = (await notificationsFor(keyuser, "coachplan_submitted")).filter((n) =>
			n.body?.startsWith(`Flow Leerling ${counter} `),
		);
		expect(sent).toHaveLength(1);
		expect(sent[0]!.body).toContain("1 vraag met je bespreken");
	});

	test("with a koppeling only the coach hears it", async () => {
		const leerling = await newLeerling();
		const coach = await userId("coach");
		await db.insert(coachAssignment).values({ organizationId, coachId: coach, leerlingId: leerling.id });
		const draft = await planVersion(leerling.id, "draft");
		await leerling.client.coachplan.submit({ submissionId: draft.id });

		const mine = (n: { body: string | null }) => n.body?.startsWith(`Flow Leerling ${counter} `);
		expect((await notificationsFor(coach, "coachplan_submitted")).filter(mine)).toHaveLength(1);
		expect(
			(await notificationsFor(await userId("keyuser"), "coachplan_submitted")).filter(mine),
		).toHaveLength(0);
	});
});

describe("taken", () => {
	test("overdue tasks are under Vandaag, marked te laat", async () => {
		const leerling = await newLeerling();
		const { start } = dutchDay();
		await db.insert(task).values([
			{ organizationId, leerlingId: leerling.id, title: "Gisteren", dueAt: new Date(start.getTime() - 24 * 3600_000) },
			{ organizationId, leerlingId: leerling.id, title: "Vandaag", dueAt: start },
			{ organizationId, leerlingId: leerling.id, title: "Morgen", dueAt: new Date(start.getTime() + 24 * 3600_000) },
		]);
		const list = await leerling.client.tasks.list({});
		expect(list.vandaag.map((t) => [t.title, t.overdue])).toEqual([
			["Gisteren", true],
			["Vandaag", false],
		]);
		expect(list.toekomst.map((t) => t.title)).toEqual(["Morgen"]);
	});

	test("the daily notification goes out once, from 07:00, not when the list is hidden", async () => {
		const leerling = await newLeerling();
		const hidden = await newLeerling();
		const { start } = dutchDay();
		await db.insert(task).values([
			{ organizationId, leerlingId: leerling.id, title: "Rekenen", dueAt: start },
			{ organizationId, leerlingId: leerling.id, title: "Lezen", pinnedForToday: true },
			{ organizationId, leerlingId: hidden.id, title: "Verborgen", dueAt: start },
		]);
		await db.insert(coachAssignment).values({
			organizationId,
			coachId: await userId("coach"),
			leerlingId: hidden.id,
			taskListHidden: true,
		});

		const early = new Date(start.getTime() + 5 * 3600_000); // 05:00 Dutch time
		const later = new Date(start.getTime() + 9 * 3600_000); // 09:00
		await sendTaskDueToday(db, early);
		expect(await notificationsFor(leerling.id, "task_due_today")).toHaveLength(0);

		await sendTaskDueToday(db, later);
		await sendTaskDueToday(db, later);
		const sent = await notificationsFor(leerling.id, "task_due_today");
		expect(sent).toHaveLength(1);
		expect(sent[0]!.body).toBe("Er staan 2 taken voor je klaar.");
		expect(await notificationsFor(hidden.id, "task_due_today")).toHaveLength(0);
	});
});

describe("cursus", () => {
	test("the coach hears about a hand-in and a proposal", async () => {
		const leerling = await newLeerling();
		const coach = await asUser("coach");
		await (await asUser("keyuser")).client.admin.assignments.set({
			coachId: coach.id,
			leerlingId: leerling.id,
			assigned: true,
		});
		const [demoCourse] = await (await asUser("leerling")).client.courses.list({
			kind: "student_execution",
		});
		const course = await coach.client.courses.derive({
			id: demoCourse!.parentCourseId!,
			kind: "student_execution",
			leerlingId: leerling.id,
		});
		const tree = await leerling.client.courses.tree({ id: course.id });
		const opdracht = tree.sections.flatMap((s) => s.blocks).find((b) => b.assignment)!;

		await leerling.client.courses.submitAssignment({
			assignmentId: opdracht.assignment!.id,
			responseText: "Klaar",
		});
		await leerling.client.courses.proposeAssignment({
			courseId: course.id,
			title: "Een filmpje maken",
		});

		const bodies = (await notificationsFor(coach.id, "course_activity"))
			.map((n) => n.body ?? "")
			.filter((b) => b.startsWith(`Flow Leerling ${counter} `));
		expect(bodies.some((b) => b.includes("ingeleverd"))).toBe(true);
		expect(bodies.some((b) => b.includes("Een filmpje maken"))).toBe(true);
	});
});
