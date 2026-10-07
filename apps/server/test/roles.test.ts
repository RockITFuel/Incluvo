/**
 * Fix plan 2.5 — the role model: exactly the five Incluvo roles, building
 * courses as a capability (not inherited by rank), and a coachplan only for
 * leerlingen.
 */
import { describe, expect, test } from "bun:test";
import { asUser, withDbAt } from "./harness";

async function code(fn: () => Promise<unknown>) {
	try {
		await fn();
	} catch (e) {
		return (e as { code?: string }).code;
	}
	return "OK";
}

describe("building courses", () => {
	test("an ontwikkelaar builds school templates; a coach doesn't", async () => {
		const ontwikkelaar = await asUser("ontwikkelaar");
		const coach = await asUser("coach");
		const made = await ontwikkelaar.client.courses.create({ kind: "school_template", title: "Nieuw" });
		expect(made.kind).toBe("school_template");
		expect(await code(() => coach.client.courses.create({ kind: "school_template", title: "X" }))).toBe(
			"FORBIDDEN",
		);
		const section = await ontwikkelaar.client.courses.addSection({ courseId: made.id, title: "H1" });
		expect(
			await code(() =>
				coach.client.courses.addBlock({ sectionId: section.id, type: "pagina", title: "P" }),
			),
		).toBe("FORBIDDEN");
	});

	test("a coach can adapt their leerling's own copy", async () => {
		const coach = await asUser("coach");
		const [copy] = await (await asUser("leerling")).client.courses.list({ kind: "student_execution" });
		const tree = await coach.client.courses.tree({ id: copy!.id });
		const block = await coach.client.courses.addBlock({
			sectionId: tree.sections[0]!.id,
			type: "pagina",
			title: "Extra uitleg voor jou",
		});
		expect(block.type).toBe("pagina");
	});
});

describe("coachplan", () => {
	test("only a leerling has one", async () => {
		for (const who of ["coach", "ontwikkelaar", "keyuser"] as const) {
			const u = await asUser(who);
			expect(await code(() => u.client.coachplan.mine()), who).toBe("FORBIDDEN");
			expect(await code(() => u.client.coachplan.startMine()), who).toBe("FORBIDDEN");
		}
	});
});

describe("migration 0012", () => {
	test("turns legacy roles into Incluvo roles and drops membership", async () => {
		await withDbAt(11, async (pool, migrateRest) => {
			await pool.query(`
				INSERT INTO "user" (id, name, email, role) VALUES
					('a', 'A', 'a@x', 'admin'), ('m', 'M', 'm@x', 'member'), ('c', 'C', 'c@x', 'coach');
			`);
			await migrateRest();
			const roles = (await pool.query(`SELECT id, role::text FROM "user" ORDER BY id`)).rows;
			expect(roles).toEqual([
				{ id: "a", role: "superadmin" },
				{ id: "c", role: "coach" },
				{ id: "m", role: "leerling" },
			]);
			const t = await pool.query(`SELECT to_regclass('membership') AS t`);
			expect(t.rows[0].t).toBeNull();
		});
	});
});
