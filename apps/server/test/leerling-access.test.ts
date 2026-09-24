/**
 * Fix plan 1.1 — one rule decides who may see or change a leerling's data:
 *   - the leerling themselves
 *   - a coach assigned to them (coach_assignment)
 *   - a keyuser of their school (D1: read + write, like any coach there)
 *   - the superadmin
 * Nobody else: not an unassigned coach, not an ontwikkelaar (D4), not another
 * leerling, and nobody from another school.
 *
 * Every endpoint below is called as each of those actors against data of the
 * demo leerling (leerling@incluvo.local).
 */
import { db } from "@incluvo/drizzle";
import { assignmentSubmission } from "@incluvo/drizzle/schema";
import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { type DemoUser, type TestUser, asUser, expectForbidden, userId, planVersion } from "./harness";

const ALLOWED: DemoUser[] = ["coach", "keyuser", "superadmin"];
const DENIED: DemoUser[] = [
	"coach2",
	"ontwikkelaar",
	"leerling2",
	"andereCoach",
	"andereKeyuser",
];

// 1x1 transparent PNG (passes the upload magic-byte check).
const PNG =
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const f = {} as {
	leerlingId: string;
	courseId: string;
	schoolTemplateId: string;
	assignmentId: string;
	blockId: string;
	forumConversationId: string;
	submissionId: string;
	fileKey: string;
	proposalId: string;
	coachplanSubmissionId: string;
};

beforeAll(async () => {
	const leerling = await asUser("leerling");
	f.leerlingId = leerling.id;

	const [execution] = await leerling.client.courses.list({ kind: "student_execution" });
	if (!execution) throw new Error("seed has no student execution for leerling@");
	f.courseId = execution.id;
	f.schoolTemplateId = execution.parentCourseId!;

	const tree = await leerling.client.courses.tree({ id: f.courseId });
	const blocks = tree.sections.flatMap((s) => s.blocks);
	const opdracht = blocks.find((b) => b.assignment);
	const forum = blocks.find((b) => b.forumConversationId);
	if (!opdracht?.assignment || !forum?.forumConversationId) {
		throw new Error("seed course lacks an opdracht or forum");
	}
	f.assignmentId = opdracht.assignment.id;
	f.blockId = opdracht.id;
	f.forumConversationId = forum.forumConversationId;

	const upload = await leerling.client.courses.uploadLocal({
		filename: "werk.png",
		contentType: "image/png",
		scope: "submission",
		data: PNG,
	});
	f.fileKey = upload.storageKey;
	const submission = await leerling.client.courses.submitAssignment({
		assignmentId: f.assignmentId,
		responseText: "Mijn antwoord",
		fileStorageKeys: [f.fileKey],
	});
	f.submissionId = submission.id;

	const proposal = await leerling.client.courses.proposeAssignment({
		courseId: f.courseId,
		title: "Eigen opdracht",
	});
	f.proposalId = proposal.id;

	// A submitted coachplan, inserted directly (filling it in is not under test).
	const plan = await planVersion(f.leerlingId);
	f.coachplanSubmissionId = plan!.id;
});

type Check = [name: string, call: (u: TestUser) => Promise<unknown>];

const READS: Check[] = [
	["courses.get (leerling's course)", (u) => u.client.courses.get({ id: f.courseId })],
	["courses.tree (leerling's course)", (u) => u.client.courses.tree({ id: f.courseId })],
	[
		"courses.tree (template, as leerling)",
		(u) => u.client.courses.tree({ id: f.schoolTemplateId, leerlingId: f.leerlingId }),
	],
	[
		"courses.listSubmissions",
		(u) => u.client.courses.listSubmissions({ assignmentId: f.assignmentId }),
	],
	["courses.getFile (submission)", (u) => u.client.courses.getFile({ storageKey: f.fileKey })],
	["courses.listProposals", (u) => u.client.courses.listProposals({ courseId: f.courseId })],
	["dashboard.profile", (u) => u.client.dashboard.profile({ leerlingId: f.leerlingId })],
	["dashboard.quickpanel", (u) => u.client.dashboard.quickpanel({ leerlingId: f.leerlingId })],
	["tasks.list", (u) => u.client.tasks.list({ leerlingId: f.leerlingId })],
	["mood.weekFor", (u) => u.client.mood.weekFor({ leerlingId: f.leerlingId })],
	[
		"chat.messages (course forum, reading along)",
		(u) => u.client.chat.messages({ conversationId: f.forumConversationId }),
	],
	[
		"coachplan.getSubmission",
		(u) => u.client.coachplan.getSubmission({ id: f.coachplanSubmissionId }),
	],
];

const WRITES: Check[] = [
	[
		"courses.create (execution for leerling)",
		(u) =>
			u.client.courses.create({
				kind: "student_execution",
				title: "Toegewezen cursus",
				leerlingId: f.leerlingId,
			}),
	],
	[
		"courses.derive (execution for leerling)",
		(u) =>
			u.client.courses.derive({
				id: f.schoolTemplateId,
				kind: "student_execution",
				leerlingId: f.leerlingId,
			}),
	],
	[
		"courses.gradeSubmission",
		(u) => u.client.courses.gradeSubmission({ submissionId: f.submissionId, grade: "8" }),
	],
	[
		"courses.respondProposal",
		(u) => u.client.courses.respondProposal({ id: f.proposalId, status: "accepted" }),
	],
	[
		"courses.setProgressBarHidden",
		(u) => u.client.courses.setProgressBarHidden({ id: f.courseId, hidden: false }),
	],
	[
		"courses.setProgress (for leerling)",
		(u) =>
			u.client.courses.setProgress({ id: f.blockId, completed: true, leerlingId: f.leerlingId }),
	],
	[
		"courses.submitAssignment (on behalf of leerling)",
		async (u) => {
			// Stay under the assignment's maxAttempts across the allowed callers.
			await db
				.delete(assignmentSubmission)
				.where(eq(assignmentSubmission.responseText, "namens"));
			return u.client.courses.submitAssignment({
				assignmentId: f.assignmentId,
				responseText: "namens",
				leerlingId: f.leerlingId,
			});
		},
	],
];

for (const [name, call] of [...READS, ...WRITES]) {
	describe(name, () => {
		for (const who of ALLOWED) {
			test(`allowed: ${who}`, async () => {
				await call(await asUser(who));
			});
		}
		for (const who of DENIED) {
			test(`denied: ${who}`, async () => {
				await expectForbidden(async () => call(await asUser(who)));
			});
		}
	});
}

describe("lists only show reachable leerlingen", () => {
	test("courses.list hides the leerling's course from unrelated staff", async () => {
		for (const who of DENIED) {
			const rows = await (await asUser(who)).client.courses.list({});
			expect(rows.map((r) => r.id), who).not.toContain(f.courseId);
		}
		for (const who of ALLOWED) {
			const rows = await (await asUser(who)).client.courses.list({});
			expect(rows.map((r) => r.id), who).toContain(f.courseId);
		}
	});

	test("a keyuser sees every leerling of their school on the dashboard", async () => {
		const rows = await (await asUser("keyuser")).client.dashboard.overview();
		const ids = rows.map((r) => r.leerling.id);
		expect(ids).toContain(f.leerlingId);
		expect(ids).toContain(await userId("leerling2"));
		expect(ids).not.toContain(await userId("andereLeerling"));
	});

	test("a coach only sees assigned leerlingen on the dashboard", async () => {
		const ids = (await (await asUser("coach2")).client.dashboard.overview()).map(
			(r) => r.leerling.id,
		);
		expect(ids).toEqual([await userId("leerling2")]);
	});

	test("the coachplan inbox follows the same rule", async () => {
		const inbox = async (who: DemoUser) =>
			(await (await asUser(who)).client.coachplan.inbox()).map((r) => r.submission.id);
		expect(await inbox("keyuser")).toContain(f.coachplanSubmissionId);
		expect(await inbox("coach")).toContain(f.coachplanSubmissionId);
		expect(await inbox("coach2")).not.toContain(f.coachplanSubmissionId);
	});
});

describe("1:1 chats stay between the two members", () => {
	test("only the coach and the leerling can read their direct chat", async () => {
		const coach = await asUser("coach");
		const { id } = await coach.client.chat.ensureDirect({ otherUserId: f.leerlingId });
		await coach.client.chat.messages({ conversationId: id });
		await (await asUser("leerling")).client.chat.messages({ conversationId: id });
		for (const who of ["keyuser", "superadmin", ...DENIED] as DemoUser[]) {
			await expectForbidden(async () =>
				(await asUser(who)).client.chat.messages({ conversationId: id }),
			);
		}
	});
});

describe("a leerling's own access", () => {
	test("reads their own course, files and plan", async () => {
		const leerling = await asUser("leerling");
		await leerling.client.courses.tree({ id: f.courseId });
		await leerling.client.courses.getFile({ storageKey: f.fileKey });
		await leerling.client.coachplan.getSubmission({ id: f.coachplanSubmissionId });
	});

	test("cannot submit to another leerling's assignment", async () => {
		const other = await asUser("leerling2");
		await expectForbidden(() =>
			other.client.courses.submitAssignment({
				assignmentId: f.assignmentId,
				responseText: "niet van mij",
			}),
		);
	});
});
