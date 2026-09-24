/**
 * Fix plan 3 — data integrity: unique constraints, upserts, attempt numbers,
 * guarded state changes, audit log contents and retention, and the migration
 * that removes existing duplicates.
 */
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { db } from "@incluvo/drizzle";
import {
	assignmentSubmission,
	auditLog,
	coachAssignment,
	formAnswer,
	formQuestion,
	formSubmission,
} from "@incluvo/drizzle/schema";
import { afterAll, describe, expect, test } from "bun:test";
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { purgeAuditLog } from "../src/retention";
import { asUser, planVersion, userId } from "./harness";

const DRIZZLE_DIR = join(import.meta.dir, "../../../packages/drizzle/drizzle");

describe("coachplan answers", () => {
	test("20 overlapping autosaves leave exactly one answer", async () => {
		const leerling = await asUser("leerling");
		await planVersion(leerling.id, "draft");
		const draft = await leerling.client.coachplan.startMine();
		const question = draft.template.questions.find((q) => q.section === "leerling")!;
		await Promise.all(
			Array.from({ length: 20 }, (_, i) =>
				leerling.client.coachplan.saveAnswer({
					submissionId: draft.submission.id,
					questionId: question.id,
					value: `versie ${i}`,
				}),
			),
		);
		const rows = await db
			.select()
			.from(formAnswer)
			.where(
				and(
					eq(formAnswer.submissionId, draft.submission.id),
					eq(formAnswer.questionId, question.id),
				),
			);
		expect(rows).toHaveLength(1);
		expect(rows[0]!.value).toMatch(/^versie \d+$/);
	});

	test("a plan can be submitted once, even when submitted twice at the same time", async () => {
		const leerling = await asUser("leerling");
		await planVersion(leerling.id, "draft");
		const draft = await leerling.client.coachplan.startMine();
		const results = await Promise.allSettled([
			leerling.client.coachplan.submit({ submissionId: draft.submission.id }),
			leerling.client.coachplan.submit({ submissionId: draft.submission.id }),
		]);
		expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
		const [row] = await db
			.select({ status: formSubmission.status })
			.from(formSubmission)
			.where(eq(formSubmission.id, draft.submission.id));
		expect(row?.status).toBe("submitted");
	});
});

describe("assignment attempts", () => {
	let assignmentId: string;
	let leerlingId: string;
	const clear = () =>
		db
			.delete(assignmentSubmission)
			.where(
				and(
					eq(assignmentSubmission.assignmentId, assignmentId),
					eq(assignmentSubmission.leerlingId, leerlingId),
				),
			);
	afterAll(async () => {
		if (assignmentId) await clear();
	});

	test("concurrent submits never exceed maxAttempts (3) or repeat a number", async () => {
		const leerling = await asUser("leerling");
		leerlingId = leerling.id;
		const [course] = await leerling.client.courses.list({ kind: "student_execution" });
		const tree = await leerling.client.courses.tree({ id: course!.id });
		const block = tree.sections.flatMap((s) => s.blocks).find((b) => b.assignment)!;
		assignmentId = block.assignment!.id;
		expect(block.assignment!.maxAttempts).toBe(3);
		await clear();

		await Promise.allSettled(
			Array.from({ length: 8 }, () =>
				leerling.client.courses.submitAssignment({ assignmentId, responseText: "tegelijk" }),
			),
		);
		const rows = await db
			.select({ attempt: assignmentSubmission.attempt })
			.from(assignmentSubmission)
			.where(
				and(
					eq(assignmentSubmission.assignmentId, assignmentId),
					eq(assignmentSubmission.leerlingId, leerlingId),
				),
			);
		expect(rows.map((r) => r.attempt).sort()).toEqual([1, 2, 3]);
	});
});

describe("unique constraints", () => {
	test("the same coach can't be assigned to the same leerling twice", async () => {
		const coach = await userId("coach");
		const leerling = await userId("leerling");
		const [existing] = await db
			.select()
			.from(coachAssignment)
			.where(and(eq(coachAssignment.coachId, coach), eq(coachAssignment.leerlingId, leerling)));
		await expect(
			db
				.insert(coachAssignment)
				.values({
					organizationId: existing!.organizationId,
					coachId: coach,
					leerlingId: leerling,
				})
				.execute(),
		).rejects.toThrow();
	});
});

describe("audit log", () => {
	test("keeps no copy of a chat message's text", async () => {
		const coach = await asUser("coach");
		const { id } = await coach.client.chat.ensureDirect({ otherUserId: await userId("leerling") });
		const sent = await coach.client.chat.send({ conversationId: id, body: "Privé: hoe gaat het thuis?" });
		const [row] = await db
			.select()
			.from(auditLog)
			.where(and(eq(auditLog.tableName, "message"), eq(auditLog.rowId, sent.id)));
		expect(row?.actor).toBe(`user:${coach.id}`);
		expect(JSON.stringify(row?.after)).not.toContain("hoe gaat het thuis");
		expect(row?.after).toEqual({ id: sent.id });
	});

	test("records which answer columns changed, not the answer", async () => {
		const leerling = await asUser("leerling");
		await planVersion(leerling.id, "draft");
		const draft = await leerling.client.coachplan.startMine();
		const [question] = await db
			.select({ id: formQuestion.id })
			.from(formQuestion)
			.where(eq(formQuestion.templateId, draft.template.id))
			.limit(1);
		const first = await leerling.client.coachplan.saveAnswer({
			submissionId: draft.submission.id,
			questionId: question!.id,
			value: "geheim antwoord",
		});
		await leerling.client.coachplan.saveAnswer({
			submissionId: draft.submission.id,
			questionId: question!.id,
			value: "ander geheim",
		});
		const rows = await db
			.select()
			.from(auditLog)
			.where(and(eq(auditLog.tableName, "form_answer"), eq(auditLog.rowId, first.id)))
			.orderBy(desc(auditLog.createdAt));
		expect(JSON.stringify(rows)).not.toContain("geheim");
		const update = rows.find((r) => r.operation === "UPDATE");
		expect((update?.after as { changed: string[] }).changed).toContain("value");
	});

	test("records a role change (role and school only)", async () => {
		const keyuser = await asUser("keyuser");
		const target = await userId("leerling2");
		await keyuser.client.account.users.setRole({ userId: target, role: "coach" });
		await keyuser.client.account.users.setRole({ userId: target, role: "leerling" });
		const [row] = await db
			.select()
			.from(auditLog)
			.where(and(eq(auditLog.tableName, "user"), eq(auditLog.rowId, target)))
			.orderBy(desc(auditLog.createdAt))
			.limit(1);
		expect(row?.actor).toBe(`user:${keyuser.id}`);
		expect(row?.after).toMatchObject({ role: "leerling", changed: expect.arrayContaining(["role"]) });
		expect(JSON.stringify(row)).not.toContain("@incluvo.local");
	});

	test("rows older than the retention period are purged", async () => {
		const old = new Date(Date.now() - 800 * 24 * 60 * 60 * 1000);
		const [stale] = await db
			.insert(auditLog)
			.values({ actor: "system", tableName: "test", operation: "INSERT", createdAt: old })
			.returning({ id: auditLog.id });
		const [fresh] = await db
			.insert(auditLog)
			.values({ actor: "system", tableName: "test", operation: "INSERT" })
			.returning({ id: auditLog.id });
		expect(await purgeAuditLog(730)).toBeGreaterThanOrEqual(1);
		const left = await db.select({ id: auditLog.id }).from(auditLog).where(eq(auditLog.tableName, "test"));
		expect(left.map((r) => r.id)).toEqual([fresh!.id]);
		expect(left.map((r) => r.id)).not.toContain(stale!.id);
	});
});

describe("migration 0006 removes existing duplicates", () => {
	test("dedupes and then enforces the unique indexes", async () => {
		const base = new URL(process.env.DATABASE_URL!);
		const name = `${base.pathname.slice(1)}_migr`;
		const admin = new pg.Client({ connectionString: Object.assign(new URL(base), { pathname: "/postgres" }).toString() });
		await admin.connect();
		await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
		await admin.query(`CREATE DATABASE "${name}"`);
		const pool = new pg.Pool({ connectionString: Object.assign(new URL(base), { pathname: `/${name}` }).toString(), max: 1 });
		try {
			await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
			// Migrate up to 0005 from a copy whose journal stops there.
			const upTo5 = mkdtempSync(join(tmpdir(), "incluvo-migr-"));
			cpSync(DRIZZLE_DIR, upTo5, { recursive: true });
			const journalPath = join(upTo5, "meta/_journal.json");
			const journal = JSON.parse(readFileSync(journalPath, "utf8"));
			journal.entries = journal.entries.filter((e: { idx: number }) => e.idx <= 5);
			writeFileSync(journalPath, JSON.stringify(journal));
			await migrate(drizzle(pool), { migrationsFolder: upTo5 });

			await pool.query(`
				INSERT INTO organization (id, name) VALUES ('00000000-0000-0000-0000-000000000001', 'S');
				INSERT INTO "user" (id, name, email) VALUES ('c', 'C', 'c@x'), ('l', 'L', 'l@x');
				INSERT INTO coach_assignment (organization_id, coach_id, leerling_id) VALUES
					('00000000-0000-0000-0000-000000000001', 'c', 'l'),
					('00000000-0000-0000-0000-000000000001', 'c', 'l');
				INSERT INTO form_template (id, name, scope, organization_id, is_school_default) VALUES
					('00000000-0000-0000-0000-00000000000a', 'A', 'school', '00000000-0000-0000-0000-000000000001', true),
					('00000000-0000-0000-0000-00000000000b', 'B', 'school', '00000000-0000-0000-0000-000000000001', true);
				INSERT INTO form_question (id, template_id, label) VALUES
					('00000000-0000-0000-0000-0000000000q1', '00000000-0000-0000-0000-00000000000a', 'Q');
			`.replace(/0000000000q1/g, "000000000011"));
			await pool.query(`
				INSERT INTO form_submission (id, template_id, organization_id, leerling_id) VALUES
					('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000001', 'l');
				INSERT INTO form_answer (submission_id, question_id, value, updated_at) VALUES
					('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000011', 'oud', now() - interval '1 day'),
					('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000011', 'nieuw', now());
			`);

			await migrate(drizzle(pool), { migrationsFolder: DRIZZLE_DIR });

			const count = async (q: string) => Number((await pool.query(q)).rows[0].n);
			expect(await count("select count(*) n from coach_assignment")).toBe(1);
			expect(await count("select count(*) n from form_template where is_school_default")).toBe(1);
			expect((await pool.query("select value from form_answer")).rows).toEqual([{ value: "nieuw" }]);
			await expect(
				pool.query(
					"INSERT INTO coach_assignment (organization_id, coach_id, leerling_id) VALUES ('00000000-0000-0000-0000-000000000001', 'c', 'l')",
				),
			).rejects.toThrow(/coach_assignment_pair_uq/);
		} finally {
			await pool.end();
			await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
			await admin.end();
		}
	});
});
