/**
 * Fix plan 2.3 — one "done" state for course work: an opdracht is done once
 * handed in, and that marks its takenlijst task and the block's progress too.
 */
import { db } from "@incluvo/drizzle";
import { assignmentSubmission, contentProgress, task } from "@incluvo/drizzle/schema";
import { beforeAll, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { type TestUser, asUser, withDbAt } from "./harness";

async function code(fn: () => Promise<unknown>) {
	try {
		await fn();
	} catch (e) {
		return (e as { code?: string }).code;
	}
	return "OK";
}

describe("handing in an opdracht", () => {
	let leerling: TestUser;
	let assignmentId: string;
	let blockId: string;

	beforeAll(async () => {
		leerling = await asUser("leerling");
		const [course] = await leerling.client.courses.list({ kind: "student_execution" });
		const tree = await leerling.client.courses.tree({ id: course!.id });
		const block = tree.sections.flatMap((s) => s.blocks).find((b) => b.assignment)!;
		assignmentId = block.assignment!.id;
		blockId = block.id;
		// Start from "not handed in".
		await db
			.delete(assignmentSubmission)
			.where(and(eq(assignmentSubmission.assignmentId, assignmentId), eq(assignmentSubmission.leerlingId, leerling.id)));
		await db
			.update(task)
			.set({ done: false, doneAt: null })
			.where(and(eq(task.assignmentId, assignmentId), eq(task.leerlingId, leerling.id)));
		await db
			.delete(contentProgress)
			.where(and(eq(contentProgress.contentBlockId, blockId), eq(contentProgress.leerlingId, leerling.id)));
	});

	test("the task and the block can't be ticked by hand", async () => {
		const tasks = await leerling.client.tasks.list({});
		const opdrachtTask = [...tasks.vandaag, ...tasks.toekomst, ...tasks.klaar].find(
			(t) => t.source === "assignment",
		)!;
		expect(await code(() => leerling.client.tasks.setDone({ id: opdrachtTask.id, done: true }))).toBe(
			"BAD_REQUEST",
		);
		expect(await code(() => leerling.client.courses.setProgress({ id: blockId, completed: true }))).toBe(
			"BAD_REQUEST",
		);
	});

	test("handing in marks the task done and the block complete", async () => {
		await leerling.client.courses.submitAssignment({ assignmentId, responseText: "Klaar!" });
		const [t] = await db
			.select({ done: task.done })
			.from(task)
			.where(and(eq(task.assignmentId, assignmentId), eq(task.leerlingId, leerling.id)));
		expect(t?.done).toBe(true);
		const [course] = await leerling.client.courses.list({ kind: "student_execution" });
		const tree = await leerling.client.courses.tree({ id: course!.id });
		expect(tree.sections.flatMap((s) => s.blocks).find((b) => b.id === blockId)?.completed).toBe(true);
	});

	test("a leerling's own tasks can still be ticked", async () => {
		const created = await leerling.client.tasks.add({ title: "Tas inpakken" });
		const done = await leerling.client.tasks.setDone({ id: created.id, done: true });
		expect(done.done).toBe(true);
	});
});

describe("migration 0010", () => {
	test("marks tasks and progress of already handed-in opdrachten as done", async () => {
		await withDbAt(9, async (pool, migrateRest) => {
			const O = "00000000-0000-0000-0000-000000000001";
			await pool.query(`
				INSERT INTO organization (id, name) VALUES ('${O}', 'S');
				INSERT INTO "user" (id, name, email) VALUES ('l', 'L', 'l@x');
				INSERT INTO course (id, kind, organization_id, title) VALUES ('00000000-0000-0000-0000-0000000000c1', 'student_execution', '${O}', 'C');
				INSERT INTO course_section (id, course_id, title) VALUES ('00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-0000000000c1', 'S');
				INSERT INTO content_block (id, section_id, type, title) VALUES ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000051', 'opdracht', 'O');
				INSERT INTO assignment (id, content_block_id, name) VALUES ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'O');
				INSERT INTO task (organization_id, leerling_id, source, assignment_id, title) VALUES ('${O}', 'l', 'assignment', '00000000-0000-0000-0000-0000000000a1', 'O');
				INSERT INTO assignment_submission (assignment_id, leerling_id, status, submitted_at) VALUES ('00000000-0000-0000-0000-0000000000a1', 'l', 'submitted', now());
			`);
			await migrateRest();
			expect((await pool.query("SELECT done FROM task")).rows).toEqual([{ done: true }]);
			expect((await pool.query("SELECT completed FROM content_progress")).rows).toEqual([{ completed: true }]);
		});
	});
});
