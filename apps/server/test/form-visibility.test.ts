/**
 * INC-7 AC10–12: per question, whether the leerling sees it (and its answer)
 * in their coachplan — whoever answered it. Default: visible.
 */
import { describe, expect, test } from "bun:test";
import { createAccount } from "../src/users";
import { asUser, planVersion } from "./harness";

describe("leerling visibility per question", () => {
	test("a hidden coach question and its answer never reach the leerling", async () => {
		const keyuser = await asUser("keyuser");
		const coach = await asUser("coach");

		// A concept of the school form with one coach question hidden, published
		// and made the default.
		const current = (await keyuser.client.coachplan.templates.list()).find(
			(t) => t.scope === "school" && t.isSchoolDefault,
		)!;
		const concept = await keyuser.client.coachplan.templates.newVersion({ id: current.id });
		const conceptQs = (await keyuser.client.coachplan.templates.get({ id: concept.id })).questions;
		expect(conceptQs.every((q) => q.visibleToLeerling)).toBe(true);
		const hidden = conceptQs.find((q) => q.section === "coach")!;
		const shownCoachQ = conceptQs.find((q) => q.section === "coach" && q.id !== hidden.id)!;
		await keyuser.client.coachplan.questions.update({ id: hidden.id, visibleToLeerling: false });
		await keyuser.client.coachplan.templates.publish({ id: concept.id });
		await keyuser.client.coachplan.templates.setSchoolDefault({ templateId: concept.id });

		try {
			// A leerling of the coach with a plan on the new version.
			const me = await keyuser.client.account.me();
			const leerlingId = await createAccount({
				email: "zichtbaar.leerling@school.nl",
				name: "Zichtbaar Leerling",
				role: "leerling",
				organizationId: me.organization!.id,
			});
			await keyuser.client.admin.assignments.set({ coachId: coach.id, leerlingId, assigned: true });
			const plan = await planVersion(leerlingId, "submitted");
			expect(plan.templateId).toBe(concept.id);

			await coach.client.coachplan.saveCoachAnswer({
				submissionId: plan.id,
				questionId: hidden.id,
				value: "Alleen voor de coach",
			});
			await coach.client.coachplan.saveCoachAnswer({
				submissionId: plan.id,
				questionId: shownCoachQ.id,
				value: "Ook voor de leerling",
			});
			await coach.client.coachplan.shareWithLeerling({ submissionId: plan.id });

			// The coach sees everything.
			const forCoach = await coach.client.coachplan.getSubmission({ id: plan.id });
			expect(forCoach.questions.map((q) => q.id)).toContain(hidden.id);
			expect(forCoach.answers.map((a) => a.value)).toContain("Alleen voor de coach");

			// The leerling (via the invite-free test session) does not.
			const { auth } = await import("../src/auth");
			const { token } = await (await auth.$context).internalAdapter.createSession(leerlingId);
			const { createORPCClient } = await import("@orpc/client");
			const { RPCLink } = await import("@orpc/client/fetch");
			const { handleRequest } = await import("../src/app");
			const leerling = createORPCClient(
				new RPCLink({
					url: "http://localhost:3200/rpc",
					fetch: (input, init) => {
						const req = new Request(input, init);
						req.headers.set("authorization", `Bearer ${token}`);
						req.headers.set("origin", "http://localhost:3200");
						return handleRequest(req);
					},
				}),
			) as typeof coach.client;
			const forLeerling = await leerling.coachplan.getSubmission({ id: plan.id });
			expect(forLeerling.questions.map((q) => q.id)).not.toContain(hidden.id);
			const values = forLeerling.answers.map((a) => a.value);
			expect(values).not.toContain("Alleen voor de coach");
			expect(values).toContain("Ook voor de leerling");
		} finally {
			// Leave the demo school on its original default for other tests.
			await keyuser.client.coachplan.templates.setSchoolDefault({ templateId: current.id });
		}
	});
});
