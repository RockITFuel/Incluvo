/**
 * `dashboard.overview` computes every row in a fixed number of queries; the
 * leerling profile still computes the same fields per leerling. They must agree.
 */
import { db } from "@incluvo/drizzle";
import { task } from "@incluvo/drizzle/schema";
import { describe, expect, test } from "bun:test";
import { createAccount } from "../src/users";
import { asUser, planVersion } from "./harness";

describe("dashboard overview", () => {
	test("every row matches the leerling's profile", async () => {
		const keyuser = await asUser("keyuser");
		const me = await keyuser.client.account.me();
		const organizationId = me.organization!.id;

		// A leerling with an overdue task, a done task, and a handed-in plan
		// followed by a newer draft (the coach should see the handed-in one).
		const leerlingId = await createAccount({
			email: "overzicht.leerling@school.nl",
			name: "Overzicht Leerling",
			role: "leerling",
			organizationId,
		});
		const handedIn = await planVersion(leerlingId, "submitted");
		await planVersion(leerlingId, "draft");
		const yesterday = new Date(Date.now() - 24 * 60 * 60_000);
		await db.insert(task).values([
			{ organizationId, leerlingId, title: "Te laat", dueAt: yesterday },
			{ organizationId, leerlingId, title: "Klaar", done: true },
			{ organizationId, leerlingId, title: "Open" },
		]);

		const rows = await keyuser.client.dashboard.overview();
		const row = rows.find((r) => r.leerling.id === leerlingId);
		expect(row?.plan.submissionId).toBe(handedIn.id);
		expect(row?.plan.status).toBe("submitted");
		expect(row?.tasks).toEqual({ open: 2, done: 1, overdue: 1 });
		expect(row?.aandacht).toBe(true);

		expect(rows.length).toBeGreaterThan(1);
		for (const r of rows) {
			const profile = await keyuser.client.dashboard.profile({
				leerlingId: r.leerling.id,
			});
			expect({
				plan: r.plan,
				tasks: r.tasks,
				lastActivityAt: r.lastActivityAt,
				aandacht: r.aandacht,
				aandachtRedenen: r.aandachtRedenen,
			}).toEqual({
				plan: profile.plan,
				tasks: profile.tasks,
				lastActivityAt: profile.lastActivityAt,
				aandacht: profile.aandacht,
				aandachtRedenen: profile.aandachtRedenen,
			});
		}
	});

	test("the chat shortcut points at the coach's existing conversation", async () => {
		const coach = await asUser("coach");
		const first = (await coach.client.dashboard.overview())[0]!;
		await coach.client.chat.ensureDirect({ otherUserId: first.leerling.id });

		const rows = await coach.client.dashboard.overview();
		const conversations = await coach.client.chat.list();
		expect(rows.some((r) => r.snelacties.conversationId !== null)).toBe(true);
		for (const r of rows) {
			const direct = conversations.find(
				(c) => c.kind === "direct" && c.otherUserId === r.leerling.id,
			);
			expect(r.snelacties.conversationId).toBe(direct?.id ?? null);
		}
	});
});
