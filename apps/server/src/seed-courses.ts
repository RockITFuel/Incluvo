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

const {
	organization,
	user,
	course,
	courseSection,
	contentBlock,
	contentBlockLabel,
	assignment,
	task,
	conversation,
	conversationMember,
} = schema;

const ONDIVERA_TITLE = "Ondivera Basiscursus Mediawijsheid";

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

	// 1) Ondivera template (org null).
	const [tpl] = await db
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
	const [sec1] = await db
		.insert(courseSection)
		.values({ courseId: tpl.id, title: "Thema 1 · Introductie", position: 0 })
		.returning({ id: courseSection.id });
	// Section 2: Aan de slag
	const [sec2] = await db
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
	const [pageBlock] = await db
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
	await db.insert(contentBlock).values({
		sectionId: sec1.id,
		type: "youtube",
		title: "Introductievideo",
		position: 1,
		youtubeUrl: "dQw4w9WgXcQ",
	});

	// bestand (#30) — metadata-only in the seed (no real file in dev).
	await db.insert(contentBlock).values({
		sectionId: sec1.id,
		type: "bestand",
		title: "Werkblad (PDF)",
		position: 2,
		fileStorageKey: "bestand/voorbeeld-werkblad.pdf",
	});

	// Label the page block (#36) so it shows as recommended for "visueel" leerlingen.
	if (pageBlock) {
		await db.insert(contentBlockLabel).values([
			{ contentBlockId: pageBlock.id, label: "visueel" },
			{ contentBlockId: pageBlock.id, label: "lezen" },
		]);
	}

	// opdracht (#27) — with an assignment definition.
	const [opdrachtBlock] = await db
		.insert(contentBlock)
		.values({
			sectionId: sec2.id,
			type: "opdracht",
			title: "Opdracht: jouw mediadagboek",
			position: 0,
		})
		.returning({ id: contentBlock.id });
	if (opdrachtBlock) {
		await db.insert(assignment).values({
			contentBlockId: opdrachtBlock.id,
			name: "Jouw mediadagboek",
			description:
				"Houd één dag bij welke media je gebruikt en lever een korte reflectie in (tekst of bestand).",
			isGroup: false,
			responseType: "text_and_files",
			maxAttempts: 3,
		});
		await db
			.insert(contentBlockLabel)
			.values({ contentBlockId: opdrachtBlock.id, label: "doen" });
	}

	// forum (#32) — created on the template; the forum conversation is created
	// when this is used in a student execution (it needs an org + leerling).
	await db.insert(contentBlock).values({
		sectionId: sec2.id,
		type: "forum",
		title: "Forum: bespreek je ervaringen",
		position: 1,
	});

	console.log("  + sections + content blocks (pagina/youtube/bestand/opdracht/forum)");

	// 2) Copy the template into the Demo School as a school template.
	const schoolCourseId = await deepCopy(tpl.id, {
		kind: "school_template",
		organizationId: schoolOrg,
		parentCourseId: tpl.id,
		title: "Mediawijsheid (Demo School)",
		createdById: ontwikkelaar,
	});
	console.log("  + school template (copy of Ondivera template)");

	// 3) Derive a student execution for the demo leerling.
	const studentCourseId = await deepCopy(schoolCourseId, {
		kind: "student_execution",
		organizationId: schoolOrg,
		parentCourseId: schoolCourseId,
		leerlingId: leerling,
		title: "Mediawijsheid",
		createdById: ontwikkelaar,
	});
	console.log("  + student execution for demo leerling");

	// 4) Seed a takenlijst task for each opdracht in the student execution (#27/#37),
	//    and create the forum conversation for the leerling (#32).
	await seedExecutionExtras(studentCourseId, schoolOrg, leerling);

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
async function deepCopy(srcId: string, target: CopyTarget): Promise<string> {
	const [src] = await db
		.select({ description: course.description })
		.from(course)
		.where(eq(course.id, srcId));

	const [dest] = await db
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

	const sections = await db
		.select()
		.from(courseSection)
		.where(eq(courseSection.courseId, srcId))
		.orderBy(asc(courseSection.position));

	for (const sec of sections) {
		const [newSec] = await db
			.insert(courseSection)
			.values({ courseId: dest.id, title: sec.title, position: sec.position })
			.returning({ id: courseSection.id });
		if (!newSec) continue;

		const blocks = await db
			.select()
			.from(contentBlock)
			.where(eq(contentBlock.sectionId, sec.id))
			.orderBy(asc(contentBlock.position));

		for (const b of blocks) {
			const [nb] = await db
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

			const labels = await db
				.select({ label: contentBlockLabel.label })
				.from(contentBlockLabel)
				.where(eq(contentBlockLabel.contentBlockId, b.id));
			if (labels.length > 0) {
				await db
					.insert(contentBlockLabel)
					.values(labels.map((l) => ({ contentBlockId: nb.id, label: l.label })));
			}

			if (b.type === "opdracht") {
				const [a] = await db
					.select()
					.from(assignment)
					.where(eq(assignment.contentBlockId, b.id));
				if (a) {
					await db.insert(assignment).values({
						contentBlockId: nb.id,
						name: a.name,
						description: a.description,
						isGroup: a.isGroup,
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

/** Seed tasks for opdracht + a forum conversation for a student execution. */
async function seedExecutionExtras(
	courseId: string,
	orgId: string,
	leerling: string,
): Promise<void> {
	// Tasks for each opdracht (#27/#37).
	const asgRows = await db
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
		await db.insert(task).values({
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

	// Forum conversation for each forum block (#32).
	const forumBlocks = await db
		.select({ id: contentBlock.id, title: contentBlock.title })
		.from(contentBlock)
		.innerJoin(courseSection, eq(courseSection.id, contentBlock.sectionId))
		.where(eq(courseSection.courseId, courseId));
	for (const b of forumBlocks.filter(() => true)) {
		// Only forum-typed blocks; re-query type cheaply.
		const [row] = await db
			.select({ type: contentBlock.type })
			.from(contentBlock)
			.where(eq(contentBlock.id, b.id));
		if (row?.type !== "forum") continue;
		const [conv] = await db
			.insert(conversation)
			.values({
				organizationId: orgId,
				kind: "forum",
				courseContentBlockId: b.id,
				title: b.title,
			})
			.returning({ id: conversation.id });
		if (conv) {
			await db
				.insert(conversationMember)
				.values({ conversationId: conv.id, userId: leerling, role: "member" });
		}
	}
	console.log("  + forum conversation(s) (#32)");
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
