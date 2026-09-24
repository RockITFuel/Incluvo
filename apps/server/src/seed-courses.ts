/**
 * Idempotent demo seed for the Online-cursus epic (#23–#36, #61).
 *
 * Builds one Ondivera **template** course ("Ondivera Basiscursus Mediawijsheid")
 * with two sections and one of each non-LTI content-block type (pagina, youtube,
 * bestand, opdracht, forum), copies it into the Demo School as a **school
 * template**, then derives a **student execution** for the demo leerling (which
 * deep-copies the structure and seeds takenlijst tasks for the opdracht, #27/#37).
 *
 * It also tags a couple of blocks with leervoorkeur labels (#36) so the
 * recommended/active content view (#35) has something to show.
 *
 * Run with: `bun run --cwd apps/server seed:courses`
 * (Requires the Epic-1 demo seed first, for the Ondivera + Demo School orgs and
 * the demo users.)
 */
import { loadRootEnv } from "@incluvo/drizzle/load-env";

loadRootEnv();

const { db } = await import("@incluvo/drizzle");
const schema = await import("@incluvo/drizzle/schema");
const { and, asc, eq } = await import("drizzle-orm");
const { makeStorageKey, writeLocalUpload } = await import("./courses/storage");

/** Transaction handle type (same query API as `db`). */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const {
	organization,
	user,
	course,
	courseSection,
	contentBlock,
	contentBlockLabel,
	assignment,
	task,
} = schema;

const ONDIVERA_TITLE = "Ondivera Basiscursus Mediawijsheid";

/**
 * Minimal valid one-page PDF for the demo "bestand" block (#30), so the seeded
 * `fileStorageKey` points at a real object instead of 500-ing on every access.
 */
const PLACEHOLDER_PDF = [
	"%PDF-1.4",
	"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
	"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
	"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R>>endobj",
	"4 0 obj<</Length 57>>stream",
	"BT /F1 24 Tf 72 770 Td (Voorbeeld-werkblad Incluvo) Tj ET",
	"endstream",
	"endobj",
	"trailer<</Size 5/Root 1 0 R>>",
	"%%EOF",
	"",
].join("\n");

async function orgId(name: string): Promise<string> {
	const [row] = await db
		.select({ id: organization.id })
		.from(organization)
		.where(eq(organization.name, name));
	if (!row) throw new Error(`Org "${name}" not found — run seed:demo first`);
	return row.id;
}

async function userId(email: string): Promise<string> {
	const [row] = await db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.email, email));
	if (!row) throw new Error(`User "${email}" not found — run seed:demo first`);
	return row.id;
}

async function main() {
	console.log("Seeding Incluvo cursussen (Epic 4)…");

	const ondiveraOrg = await orgId("Ondivera");
	const schoolOrg = await orgId("Demo School");
	const ontwikkelaar = await userId("ontwikkelaar@incluvo.local");
	const leerling = await userId("leerling@incluvo.local");

	// Idempotency: bail if the Ondivera template already exists.
	const [existing] = await db
		.select({ id: course.id })
		.from(course)
		.where(
			and(eq(course.title, ONDIVERA_TITLE), eq(course.kind, "ondivera_template")),
		);
	if (existing) {
		console.log("  · already seeded, skipping.");
		process.exit(0);
	}

	// Write the placeholder werkblad through the storage layer BEFORE the
	// transaction (file writes can't roll back), so the seeded key resolves.
	const werkbladKey = makeStorageKey("bestand", "voorbeeld-werkblad.pdf");
	await writeLocalUpload(werkbladKey, new TextEncoder().encode(PLACEHOLDER_PDF));

	// One transaction for the whole seed, so a mid-seed crash can't leave the
	// idempotency check above passing while half the data is missing.
	await db.transaction(async (tx) => {
		// 1) Ondivera template (org null).
		const [tpl] = await tx
			.insert(course)
			.values({
				kind: "ondivera_template",
				organizationId: null,
				title: ONDIVERA_TITLE,
				description:
					"Een voorbeeldcursus van Ondivera. Kopieer naar je school en pas aan.",
				createdById: ontwikkelaar,
			})
			.returning({ id: course.id });
		if (!tpl) throw new Error("Failed to create template course");
		console.log("  + Ondivera template course");

		// Section 1: Introductie
		const [sec1] = await tx
			.insert(courseSection)
			.values({ courseId: tpl.id, title: "Thema 1 · Introductie", position: 0 })
			.returning({ id: courseSection.id });
		// Section 2: Aan de slag
		const [sec2] = await tx
			.insert(courseSection)
			.values({ courseId: tpl.id, title: "Thema 2 · Aan de slag", position: 1 })
			.returning({ id: courseSection.id });
		if (!sec1 || !sec2) throw new Error("Failed to create sections");

		// pagina (#29) — ProseMirror JSON.
		const pageDoc = {
			type: "doc",
			content: [
				{
					type: "heading",
					attrs: { level: 2 },
					content: [{ type: "text", text: "Welkom bij de cursus" }],
				},
				{
					type: "paragraph",
					content: [
						{
							type: "text",
							text: "In deze cursus leer je hoe je bewust en veilig omgaat met media. Lees deze pagina rustig door en bekijk daarna de video.",
						},
					],
				},
			],
		};
		const [pageBlock] = await tx
			.insert(contentBlock)
			.values({
				sectionId: sec1.id,
				type: "pagina",
				title: "Introductiepagina",
				position: 0,
				body: JSON.stringify(pageDoc),
			})
			.returning({ id: contentBlock.id });

		// youtube (#31) — validated 11-char id.
		await tx.insert(contentBlock).values({
			sectionId: sec1.id,
			type: "youtube",
			title: "Introductievideo",
			position: 1,
			youtubeUrl: "dQw4w9WgXcQ",
		});

		// bestand (#30) — points at the placeholder PDF written above, so the
		// demo file actually opens instead of failing the storage-key check.
		await tx.insert(contentBlock).values({
			sectionId: sec1.id,
			type: "bestand",
			title: "Werkblad (PDF)",
			position: 2,
			fileStorageKey: werkbladKey,
		});

		// Label the page block (#36) so it shows as recommended for "visueel" leerlingen.
		if (pageBlock) {
			await tx.insert(contentBlockLabel).values([
				{ contentBlockId: pageBlock.id, label: "visueel" },
				{ contentBlockId: pageBlock.id, label: "lezen" },
			]);
		}

		// opdracht (#27) — with an assignment definition.
		const [opdrachtBlock] = await tx
			.insert(contentBlock)
			.values({
				sectionId: sec2.id,
				type: "opdracht",
				title: "Opdracht: jouw mediadagboek",
				position: 0,
			})
			.returning({ id: contentBlock.id });
		if (opdrachtBlock) {
			await tx.insert(assignment).values({
				contentBlockId: opdrachtBlock.id,
				name: "Jouw mediadagboek",
				description:
					"Houd één dag bij welke media je gebruikt en lever een korte reflectie in (tekst of bestand).",
				responseType: "text_and_files",
				maxAttempts: 3,
			});
			await tx
				.insert(contentBlockLabel)
				.values({ contentBlockId: opdrachtBlock.id, label: "doen" });
		}

		console.log("  + sections + content blocks (pagina/youtube/bestand/opdracht)");

		// 2) Copy the template into the Demo School as a school template.
		const schoolCourseId = await deepCopy(tx, tpl.id, {
			kind: "school_template",
			organizationId: schoolOrg,
			parentCourseId: tpl.id,
			title: "Mediawijsheid (Demo School)",
			createdById: ontwikkelaar,
		});
		console.log("  + school template (copy of Ondivera template)");

		// 3) Derive a student execution for the demo leerling.
		const studentCourseId = await deepCopy(tx, schoolCourseId, {
			kind: "student_execution",
			organizationId: schoolOrg,
			parentCourseId: schoolCourseId,
			leerlingId: leerling,
			title: "Mediawijsheid",
			createdById: ontwikkelaar,
		});
		console.log("  + student execution for demo leerling");

		// 4) Seed a takenlijst task for each opdracht in the student execution (#27/#37).
		await seedExecutionExtras(tx, studentCourseId, schoolOrg, leerling);
	});

	console.log("Done.");
	console.log("  Ondivera template : %s", ONDIVERA_TITLE);
	console.log("  School template   : Mediawijsheid (Demo School)");
	console.log("  Student execution : Mediawijsheid (leerling@incluvo.local)");
	void ondiveraOrg;
	process.exit(0);
}

interface CopyTarget {
	kind: "school_template" | "student_execution";
	organizationId: string;
	parentCourseId: string;
	leerlingId?: string;
	title: string;
	createdById: string;
}

/** Create a new course from `target` and deep-copy `srcId`'s structure into it. */
async function deepCopy(tx: Tx, srcId: string, target: CopyTarget): Promise<string> {
	const [src] = await tx
		.select({ description: course.description })
		.from(course)
		.where(eq(course.id, srcId));

	const [dest] = await tx
		.insert(course)
		.values({
			kind: target.kind,
			organizationId: target.organizationId,
			parentCourseId: target.parentCourseId,
			leerlingId: target.leerlingId ?? null,
			title: target.title,
			description: src?.description ?? null,
			createdById: target.createdById,
		})
		.returning({ id: course.id });
	if (!dest) throw new Error("Failed to create copy course");

	const sections = await tx
		.select()
		.from(courseSection)
		.where(eq(courseSection.courseId, srcId))
		.orderBy(asc(courseSection.position));

	for (const sec of sections) {
		const [newSec] = await tx
			.insert(courseSection)
			.values({ courseId: dest.id, title: sec.title, position: sec.position })
			.returning({ id: courseSection.id });
		if (!newSec) continue;

		const blocks = await tx
			.select()
			.from(contentBlock)
			.where(eq(contentBlock.sectionId, sec.id))
			.orderBy(asc(contentBlock.position));

		for (const b of blocks) {
			const [nb] = await tx
				.insert(contentBlock)
				.values({
					sectionId: newSec.id,
					type: b.type,
					title: b.title,
					position: b.position,
					body: b.body,
					fileStorageKey: b.fileStorageKey,
					youtubeUrl: b.youtubeUrl,
					ltiConfig: b.ltiConfig,
					countsForProgress: b.countsForProgress,
				})
				.returning({ id: contentBlock.id });
			if (!nb) continue;

			const labels = await tx
				.select({ label: contentBlockLabel.label })
				.from(contentBlockLabel)
				.where(eq(contentBlockLabel.contentBlockId, b.id));
			if (labels.length > 0) {
				await tx
					.insert(contentBlockLabel)
					.values(labels.map((l) => ({ contentBlockId: nb.id, label: l.label })));
			}

			if (b.type === "opdracht") {
				const [a] = await tx
					.select()
					.from(assignment)
					.where(eq(assignment.contentBlockId, b.id));
				if (a) {
					await tx.insert(assignment).values({
						contentBlockId: nb.id,
						name: a.name,
						description: a.description,
						responseType: a.responseType,
						maxAttempts: a.maxAttempts,
						dueAt: a.dueAt,
						availableFrom: a.availableFrom,
						availableUntil: a.availableUntil,
					});
				}
			}
		}
	}

	return dest.id;
}

/** Seed a takenlijst task for each opdracht of a student execution. */
async function seedExecutionExtras(
	tx: Tx,
	courseId: string,
	orgId: string,
	leerling: string,
): Promise<void> {
	// Tasks for each opdracht (#27/#37).
	const asgRows = await tx
		.select({
			assignmentId: assignment.id,
			name: assignment.name,
			description: assignment.description,
			dueAt: assignment.dueAt,
		})
		.from(assignment)
		.innerJoin(contentBlock, eq(contentBlock.id, assignment.contentBlockId))
		.innerJoin(courseSection, eq(courseSection.id, contentBlock.sectionId))
		.where(eq(courseSection.courseId, courseId));
	for (const a of asgRows) {
		await tx.insert(task).values({
			organizationId: orgId,
			leerlingId: leerling,
			source: "assignment",
			assignmentId: a.assignmentId,
			title: a.name,
			description: a.description,
			dueAt: a.dueAt,
		});
	}
	console.log("  + takenlijst task(s) voor opdracht (#27/#37)");
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
