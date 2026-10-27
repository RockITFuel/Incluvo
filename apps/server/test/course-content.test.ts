/**
 * The course builder's texts and files (INC-25, INC-26, INC-27): formatted
 * texts with images, editing an opdracht after the fact, and files that the
 * browser can show itself.
 */
import { db } from "@incluvo/drizzle";
import { task } from "@incluvo/drizzle/schema";
import { afterAll, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { richTextToPlain } from "../src/courses/rich-text";
import { asUser } from "./harness";

const PNG =
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const doc = (...content: unknown[]) => JSON.stringify({ type: "doc", content });
const para = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });

async function codeOf(fn: () => Promise<unknown>) {
	try {
		await fn();
	} catch (e) {
		return (e as { code?: string }).code;
	}
	return undefined;
}

// Blocks go in a section of their own, removed afterwards: other tests read
// the demo courses' blocks (e.g. the seeded opdracht with three attempts).
const cleanup: (() => Promise<unknown>)[] = [];
afterAll(async () => {
	for (const undo of cleanup) await undo();
});

async function tempSection(
	who: Awaited<ReturnType<typeof asUser>>,
	courseId: string,
): Promise<string> {
	const section = await who.client.courses.addSection({ courseId, title: "Test (INC-25/26/27)" });
	cleanup.push(() => who.client.courses.deleteSection({ id: section.id }));
	return section.id;
}

/** The demo leerling's own course copy, as the coach who may adapt it. */
async function leerlingCourse() {
	const leerling = await asUser("leerling");
	const coach = await asUser("coach");
	const [own] = await leerling.client.courses.list({ kind: "student_execution" });
	return { leerling, coach, courseId: own!.id, sectionId: await tempSection(coach, own!.id) };
}

describe("formatted texts (INC-25)", () => {
	test("the takenlijst gets the plain text of a formatted opdracht", async () => {
		expect(
			richTextToPlain(
				doc(
					{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Stap 1" }] },
					para("Lees het hoofdstuk."),
					{
						type: "bulletList",
						content: [{ type: "listItem", content: [para("Maak de vragen")] }],
					},
				),
			),
		).toBe("Stap 1\nLees het hoofdstuk.\n- Maak de vragen");
		expect(richTextToPlain("Gewoon tekst")).toBe("Gewoon tekst");
		const cell = (type: string, text: string) => ({ type, content: [para(text)] });
		expect(
			richTextToPlain(
				doc({
					type: "table",
					content: [
						{ type: "tableRow", content: [cell("tableHeader", "Dag"), cell("tableHeader", "Taak")] },
						{ type: "tableRow", content: [cell("tableCell", "Ma"), cell("tableCell", "Lezen")] },
					],
				}),
			),
		).toBe("Dag | Taak\nMa | Lezen");

		const { coach, leerling, sectionId } = await leerlingCourse();
		await coach.client.courses.addBlock({
			sectionId,
			type: "opdracht",
			title: "Opmaak-opdracht",
			assignment: { name: "Opmaak-opdracht", description: doc(para("Schrijf een verslag.")) },
		});
		const tasks = await leerling.client.tasks.list({});
		const all = [...tasks.vandaag, ...tasks.toekomst];
		const seeded = all.find((t) => t.title === "Opmaak-opdracht");
		expect(seeded?.description).toBe("Schrijf een verslag.");
	});

	test("an image in a text is readable with its course, and only images go there", async () => {
		const { coach, leerling, sectionId } = await leerlingCourse();
		const builder = await asUser("ontwikkelaar");
		const andereLeerling = await asUser("andereLeerling");

		// Only images, and not by a leerling.
		expect(
			await codeOf(() =>
				coach.client.courses.uploadLocal({
					filename: "x.pdf",
					contentType: "application/pdf",
					scope: "inhoud",
					data: PNG,
				}),
			),
		).toBe("BAD_REQUEST");
		expect(
			await codeOf(() =>
				leerling.client.courses.uploadLocal({
					filename: "x.png",
					contentType: "image/png",
					scope: "inhoud",
					data: PNG,
				}),
			),
		).toBe("FORBIDDEN");

		const { storageKey } = await coach.client.courses.uploadLocal({
			filename: "plaatje.png",
			contentType: "image/png",
			scope: "inhoud",
			data: PNG,
		});
		// Not in any text yet.
		expect(await codeOf(() => coach.client.courses.getFile({ storageKey }))).toBe("NOT_FOUND");

		await coach.client.courses.addBlock({
			sectionId,
			type: "pagina",
			title: "Met plaatje",
			body: doc({ type: "image", attrs: { storageKey, alt: "Een plaatje" } }),
		});
		const file = await leerling.client.courses.getFile({ storageKey });
		expect(file.contentType).toBe("image/png");
		expect(file.fileName).toBe("plaatje.png");
		// Another school can't read it; nor a builder without access to this copy.
		expect(await codeOf(() => andereLeerling.client.courses.getFile({ storageKey }))).toBe(
			"FORBIDDEN",
		);
		expect(await codeOf(() => builder.client.courses.getFile({ storageKey }))).toBe("FORBIDDEN");
	});
});

describe("editing a block (INC-26)", () => {
	test("an opdracht's own fields change, and the leerling's task follows", async () => {
		const { coach, leerling, sectionId } = await leerlingCourse();
		const { id } = await coach.client.courses.addBlock({
			sectionId,
			type: "opdracht",
			title: "Te bewerken",
			assignment: {
				name: "Te bewerken",
				description: "Oud",
				dueAt: new Date("2026-12-01T00:00:00"),
			},
		});
		const leerlingId = leerling.id;
		const taskOf = async () =>
			(
				await db
					.select()
					.from(task)
					.where(and(eq(task.leerlingId, leerlingId), eq(task.title, "Bewerkt")))
			)[0];

		await coach.client.courses.updateBlock({
			id,
			title: "Bewerkt",
			assignment: {
				name: "Bewerkt",
				description: doc(para("Nieuwe uitleg")),
				responseType: "text",
				dueAt: new Date("2026-12-08T00:00:00"),
			},
		});
		const tree = await coach.client.courses.tree({
			id: (await leerling.client.courses.list({ kind: "student_execution" }))[0]!.id,
		});
		const block = tree.sections.flatMap((s) => s.blocks).find((b) => b.id === id)!;
		expect(block.title).toBe("Bewerkt");
		expect(block.assignment?.responseType).toBe("text");
		let t = await taskOf();
		expect(t?.description).toBe("Nieuwe uitleg");
		expect(t?.dueAt?.toISOString()).toBe(new Date("2026-12-08T00:00:00").toISOString());

		// A deadline the coach moved for this leerling stays.
		await db.update(task).set({ dueAt: new Date("2026-12-20T00:00:00") }).where(eq(task.id, t!.id));
		await coach.client.courses.updateBlock({
			id,
			assignment: {
				name: "Bewerkt",
				description: null,
				responseType: "text",
				dueAt: new Date("2026-12-15T00:00:00"),
			},
		});
		t = await taskOf();
		expect(t?.dueAt?.toISOString()).toBe(new Date("2026-12-20T00:00:00").toISOString());
		expect(t?.description).toBeNull();
	});
});

describe("showing files (INC-27)", () => {
	test("getFile says what the file is, inline or as a download", async () => {
		const builder = await asUser("ontwikkelaar");
		const [template] = await builder.client.courses.list({ kind: "school_template" });
		const sectionId = await tempSection(builder, template!.id);
		const { storageKey } = await builder.client.courses.uploadLocal({
			filename: "uitleg.png",
			contentType: "image/png",
			scope: "bestand",
			data: PNG,
		});
		await builder.client.courses.addBlock({
			sectionId,
			type: "bestand",
			title: "Uitleg",
			fileStorageKey: storageKey,
		});
		const shown = await builder.client.courses.getFile({ storageKey });
		expect(shown.contentType).toBe("image/png");
		expect(shown.fileName).toBe("uitleg.png");
		expect(shown.url.startsWith("data:image/png")).toBe(true);
		const download = await builder.client.courses.getFile({ storageKey, download: true });
		expect(download.url.length).toBeGreaterThan(0);
	});
});
