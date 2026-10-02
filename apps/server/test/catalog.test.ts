/**
 * Cursuscatalogus (docs/decisions/cursuscatalogus.md): Ondivera decides which
 * templates each school may use, and manages categories to filter on.
 */
import { describe, expect, test } from "bun:test";
import { asUser, expectForbidden } from "./harness";

async function code(fn: () => Promise<unknown>): Promise<string | undefined> {
	try {
		await fn();
	} catch (e) {
		return (e as { code?: string }).code;
	}
	return undefined;
}

async function schools() {
	const superadmin = await asUser("superadmin");
	const orgs = await superadmin.client.admin.organizations.listAll();
	return {
		demo: orgs.find((o) => o.name === "Demo School")!.id,
		andere: orgs.find((o) => o.name === "Andere School")!.id,
	};
}

describe("availability", () => {
	test("a new Ondivera template is closed until Ondivera opens it", async () => {
		const superadmin = await asUser("superadmin");
		const keyuser = await asUser("keyuser");
		const andere = await asUser("andereKeyuser");
		const { demo } = await schools();

		const tpl = await superadmin.client.courses.create({
			kind: "ondivera_template",
			title: "Catalogus: plannen",
		});
		const seen = async (who: typeof keyuser) =>
			(await who.client.courses.list({})).some((c) => c.id === tpl.id);

		expect(await seen(keyuser)).toBe(false);
		await expectForbidden(() => keyuser.client.courses.tree({ id: tpl.id }));
		await expectForbidden(() =>
			keyuser.client.courses.derive({ id: tpl.id, kind: "school_template" }),
		);

		await superadmin.client.courses.catalog.availability.set({
			courseId: tpl.id,
			allSchools: false,
			organizationIds: [demo],
		});
		expect(await seen(keyuser)).toBe(true);
		expect(await seen(andere)).toBe(false);
		await keyuser.client.courses.derive({ id: tpl.id, kind: "school_template" });

		const listed = (await superadmin.client.courses.list({})).find((c) => c.id === tpl.id)!;
		expect(listed.availability).toEqual({ allSchools: false, organizationIds: [demo] });
		// Schools don't see who else has it.
		expect((await keyuser.client.courses.list({})).find((c) => c.id === tpl.id)!.availability).toBeNull();
	});

	test("turning an all-schools template off for one school keeps it for the rest", async () => {
		const superadmin = await asUser("superadmin");
		const { demo, andere } = await schools();
		const tpl = await superadmin.client.courses.create({
			kind: "ondivera_template",
			title: "Catalogus: samenwerken",
		});
		await superadmin.client.courses.catalog.availability.set({
			courseId: tpl.id,
			allSchools: true,
		});
		await superadmin.client.courses.catalog.availability.setForSchool({
			courseId: tpl.id,
			organizationId: demo,
			available: false,
		});
		const listed = (await superadmin.client.courses.list({})).find((c) => c.id === tpl.id)!;
		expect(listed.availability?.allSchools).toBe(false);
		expect(listed.availability?.organizationIds).toContain(andere);
		expect(listed.availability?.organizationIds).not.toContain(demo);

		await superadmin.client.courses.catalog.availability.setForSchool({
			courseId: tpl.id,
			organizationId: demo,
			available: true,
		});
		const again = (await superadmin.client.courses.list({})).find((c) => c.id === tpl.id)!;
		expect(again.availability?.organizationIds).toContain(demo);
	});

	test("only the superadmin manages availability, and only for Ondivera templates", async () => {
		const superadmin = await asUser("superadmin");
		const keyuser = await asUser("keyuser");
		const { demo } = await schools();
		const tpl = await superadmin.client.courses.create({
			kind: "ondivera_template",
			title: "Catalogus: alleen Ondivera",
		});
		await expectForbidden(() =>
			keyuser.client.courses.catalog.availability.set({
				courseId: tpl.id,
				allSchools: true,
			}),
		);
		const schoolTpl = (await keyuser.client.courses.list({ kind: "school_template" }))[0]!;
		expect(
			await code(() =>
				superadmin.client.courses.catalog.availability.setForSchool({
					courseId: schoolTpl.id,
					organizationId: demo,
					available: true,
				}),
			),
		).toBe("BAD_REQUEST");
	});
});

describe("categories", () => {
	test("Ondivera manages categories; courses can be filtered on them", async () => {
		const superadmin = await asUser("superadmin");
		const keyuser = await asUser("keyuser");
		const leerling = await asUser("leerling");

		const rekenen = await superadmin.client.courses.catalog.categories.create({ name: "Rekenen" });
		const sociaal = await superadmin.client.courses.catalog.categories.create({
			name: "Sociaal-emotioneel",
		});
		expect(
			await code(() => superadmin.client.courses.catalog.categories.create({ name: "Rekenen" })),
		).toBe("CONFLICT");
		await expectForbidden(() => keyuser.client.courses.catalog.categories.create({ name: "Taal" }));
		await expectForbidden(() => leerling.client.courses.catalog.categories.list());

		const tpl = await superadmin.client.courses.create({
			kind: "ondivera_template",
			title: "Catalogus: breuken",
		});
		await superadmin.client.courses.catalog.setCategories({
			courseId: tpl.id,
			categoryIds: [rekenen.id, sociaal.id],
		});
		// A school can't recategorise Ondivera's template, but can its own.
		await expectForbidden(() =>
			keyuser.client.courses.catalog.setCategories({ courseId: tpl.id, categoryIds: [] }),
		);
		const own = (await keyuser.client.courses.list({ kind: "school_template" }))[0]!;
		await keyuser.client.courses.catalog.setCategories({
			courseId: own.id,
			categoryIds: [rekenen.id],
		});

		const listed = (await superadmin.client.courses.list({})).find((c) => c.id === tpl.id)!;
		expect(listed.categoryIds.sort()).toEqual([rekenen.id, sociaal.id].sort());
		const cats = await keyuser.client.courses.catalog.categories.list();
		expect(cats.find((c) => c.id === rekenen.id)?.courseCount).toBe(2);

		await superadmin.client.courses.catalog.categories.rename({ id: rekenen.id, name: "Rekenen & wiskunde" });
		await superadmin.client.courses.catalog.categories.delete({ id: sociaal.id });
		const after = (await superadmin.client.courses.list({})).find((c) => c.id === tpl.id)!;
		expect(after.categoryIds).toEqual([rekenen.id]);
	});
});
