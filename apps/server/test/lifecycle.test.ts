/**
 * Fix plan 2.1 — the coachplan lifecycle (D2: one living plan with versions).
 * Walks one leerling (leerling2, coached by coach2) through a first plan and a
 * revision, and checks every move that must be refused.
 */
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { db } from "@incluvo/drizzle";
import { coachplan, formSubmission } from "@incluvo/drizzle/schema";
import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { type TestUser, asUser } from "./harness";

async function expectConflict(fn: () => Promise<unknown>) {
	let code: string | undefined;
	try {
		await fn();
	} catch (e) {
		code = (e as { code?: string }).code;
	}
	expect(code).toBe("CONFLICT");
}

describe("one plan, versions over time", () => {
	let leerling: TestUser;
	let coach: TestUser;
	let v1: string;
	let leerlingQuestion: string;
	let coachQuestion: string;

	beforeAll(async () => {
		leerling = await asUser("leerling2");
		coach = await asUser("coach2");
		// Start from "no plan": other test files may have given leerling2 one.
		await db.delete(coachplan).where(eq(coachplan.leerlingId, leerling.id));
	});

	test("before anything: no plan", async () => {
		expect(await leerling.client.coachplan.mine()).toEqual({ latest: null, current: null });
	});

	test("opening the wizard twice resumes the same draft (version 1)", async () => {
		const a = await leerling.client.coachplan.startMine();
		const b = await leerling.client.coachplan.startMine();
		expect(a.submission.id).toBe(b.submission.id);
		expect(a.submission.version).toBe(1);
		v1 = a.submission.id;
		leerlingQuestion = a.template.questions.find((q) => q.section === "leerling")!.id;
		coachQuestion = a.template.questions.find((q) => q.section === "coach")!.id;
	});

	test("the coach can't touch or share a draft", async () => {
		await expectConflict(() => coach.client.coachplan.shareWithLeerling({ submissionId: v1 }));
		await expectConflict(() =>
			coach.client.coachplan.saveCoachAnswer({ submissionId: v1, questionId: coachQuestion, value: "x" }),
		);
	});

	test("after submitting, the wizard doesn't open a new empty draft", async () => {
		await leerling.client.coachplan.saveAnswer({
			submissionId: v1,
			questionId: leerlingQuestion,
			value: "Ik teken graag",
		});
		await leerling.client.coachplan.submit({ submissionId: v1 });
		await expectConflict(() => leerling.client.coachplan.startMine());
		const state = await leerling.client.coachplan.mine();
		expect(state.latest?.status).toBe("submitted");
		expect(state.current).toBeNull();
		const rows = await db.select().from(formSubmission).where(eq(formSubmission.leerlingId, leerling.id));
		expect(rows).toHaveLength(1);
	});

	test("the coach reviews and shares; the shared version becomes the plan and is read-only", async () => {
		await coach.client.coachplan.saveCoachAnswer({
			submissionId: v1,
			questionId: coachQuestion,
			value: "Leert via beeld",
		});
		await coach.client.coachplan.setLearningPreferences({ submissionId: v1, labels: ["korte_video"] });
		await coach.client.coachplan.shareWithLeerling({ submissionId: v1 });

		const state = await leerling.client.coachplan.mine();
		expect(state.current?.id).toBe(v1);
		const panel = await coach.client.dashboard.quickpanel({ leerlingId: leerling.id });
		expect(panel.leervoorkeuren).toEqual(["korte_video"]);

		await expectConflict(() => coach.client.coachplan.shareWithLeerling({ submissionId: v1 }));
		await expectConflict(() =>
			coach.client.coachplan.saveCoachAnswer({ submissionId: v1, questionId: coachQuestion, value: "later" }),
		);
		await expectConflict(() =>
			coach.client.coachplan.setLearningPreferences({ submissionId: v1, labels: [] }),
		);
		// "Afgestemd met ouders" can still be ticked on the shared plan.
		await coach.client.coachplan.setApprovedWithParents({ submissionId: v1, approved: true });
	});

	test("revising starts version 2 pre-filled; the shared version stays the plan until the next share", async () => {
		const v2 = await leerling.client.coachplan.revise();
		expect(v2.version).toBe(2);
		expect(v2.status).toBe("draft");
		expect(v2.approvedWithParents).toBe(false);

		const draft = await leerling.client.coachplan.startMine();
		expect(draft.submission.id).toBe(v2.id);
		const answers = new Map(draft.answers.map((a) => [a.questionId, a.value]));
		expect(answers.get(leerlingQuestion)).toBe("Ik teken graag");
		expect(answers.get(coachQuestion)).toBe("Leert via beeld");

		// Only one version in progress at a time.
		await expectConflict(() => leerling.client.coachplan.revise());

		// Coach views still show version 1 while version 2 is being drafted.
		const profile = await coach.client.dashboard.profile({ leerlingId: leerling.id });
		expect(profile.plan.submissionId).toBe(v1);
		expect((await leerling.client.coachplan.mine()).current?.id).toBe(v1);

		await leerling.client.coachplan.saveAnswer({
			submissionId: v2.id,
			questionId: leerlingQuestion,
			value: "Ik teken en schilder",
		});
		await leerling.client.coachplan.submit({ submissionId: v2.id });
		const inbox = await coach.client.coachplan.inbox();
		const mine = inbox.filter((r) => r.submission.leerlingId === leerling.id);
		expect(mine.map((r) => r.submission.id)).toEqual([v2.id]); // one row per leerling

		await coach.client.coachplan.shareWithLeerling({ submissionId: v2.id });
		expect((await leerling.client.coachplan.mine()).current?.id).toBe(v2.id);
		// Leervoorkeuren carried over into version 2.
		const panel = await coach.client.dashboard.quickpanel({ leerlingId: leerling.id });
		expect(panel.leervoorkeuren).toEqual(["korte_video"]);
	});

	test("the leerling still reads earlier versions", async () => {
		const old = await leerling.client.coachplan.getSubmission({ id: v1 });
		expect(old.submission.version).toBe(1);
	});
});

describe("migration 0008 on existing submissions", () => {
	test("groups them into one plan per leerling, numbers versions and drops empty drafts", async () => {
		const base = new URL(process.env.DATABASE_URL!);
		const name = `${base.pathname.slice(1)}_migr8`;
		const admin = new pg.Client({ connectionString: Object.assign(new URL(base), { pathname: "/postgres" }).toString() });
		await admin.connect();
		await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
		await admin.query(`CREATE DATABASE "${name}"`);
		const pool = new pg.Pool({ connectionString: Object.assign(new URL(base), { pathname: `/${name}` }).toString(), max: 1 });
		const DRIZZLE_DIR = join(import.meta.dir, "../../../packages/drizzle/drizzle");
		try {
			await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
			const upTo7 = mkdtempSync(join(tmpdir(), "incluvo-migr8-"));
			cpSync(DRIZZLE_DIR, upTo7, { recursive: true });
			const journalPath = join(upTo7, "meta/_journal.json");
			const journal = JSON.parse(readFileSync(journalPath, "utf8"));
			journal.entries = journal.entries.filter((e: { idx: number }) => e.idx <= 7);
			writeFileSync(journalPath, JSON.stringify(journal));
			await migrate(drizzle(pool), { migrationsFolder: upTo7 });

			const O = "00000000-0000-0000-0000-000000000001";
			const T = "00000000-0000-0000-0000-00000000000a";
			const Q = "00000000-0000-0000-0000-000000000011";
			await pool.query(`
				INSERT INTO organization (id, name) VALUES ('${O}', 'S');
				INSERT INTO "user" (id, name, email) VALUES ('l', 'L', 'l@x');
				INSERT INTO form_template (id, name, scope, organization_id) VALUES ('${T}', 'A', 'school', '${O}');
				INSERT INTO form_question (id, template_id, label) VALUES ('${Q}', '${T}', 'Q');
				INSERT INTO form_submission (id, template_id, organization_id, leerling_id, status, created_at) VALUES
					('00000000-0000-0000-0000-000000000021', '${T}', '${O}', 'l', 'shared_with_leerling', now() - interval '3 day'),
					('00000000-0000-0000-0000-000000000022', '${T}', '${O}', 'l', 'draft', now() - interval '2 day'),
					('00000000-0000-0000-0000-000000000023', '${T}', '${O}', 'l', 'draft', now() - interval '1 day');
				INSERT INTO form_answer (submission_id, question_id, value) VALUES
					('00000000-0000-0000-0000-000000000021', '${Q}', 'a'),
					('00000000-0000-0000-0000-000000000023', '${Q}', 'b');
			`);
			await migrate(drizzle(pool), { migrationsFolder: DRIZZLE_DIR });

			const subs = (await pool.query("SELECT id, version FROM form_submission ORDER BY version")).rows;
			expect(subs).toEqual([
				{ id: "00000000-0000-0000-0000-000000000021", version: 1 },
				{ id: "00000000-0000-0000-0000-000000000023", version: 2 },
			]);
			const plans = (await pool.query("SELECT current_version_id FROM coachplan")).rows;
			expect(plans).toEqual([{ current_version_id: "00000000-0000-0000-0000-000000000021" }]);
		} finally {
			await pool.end();
			await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
			await admin.end();
		}
	});
});

