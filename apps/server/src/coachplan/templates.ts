/**
 * Form templates and their versions (fix plan 2.2, D5).
 *
 * All versions of one form share a `familyId`; `version` counts up. A version
 * that is in use — a plan was filled in on it, a school copied it, or a newer
 * version exists — is read-only, so filled-in plans keep meaning what they
 * meant. Changing such a form means `newVersion`. A school copy of an Ondivera
 * form records the Ondivera version it came from (`parentTemplateId`); when
 * Ondivera publishes a newer version, the school decides when to
 * `upgradeFromSource`.
 *
 * Question `key`s are stable across versions and copies, so answers can be
 * carried over by key (see lifecycle.createVersion).
 */
import {
	formAssignment,
	formQuestion,
	formSubmission,
	formTemplate,
} from "@incluvo/drizzle/schema";
import type { Database } from "@incluvo/drizzle";
import { ORPCError } from "@orpc/server";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";

type Db = Pick<Database, "select" | "insert" | "update" | "delete">;
export type Template = typeof formTemplate.$inferSelect;

/** Insert a new form: version 1 of a new family. */
export async function insertTemplate(
	db: Db,
	values: Omit<typeof formTemplate.$inferInsert, "id" | "familyId" | "version">,
): Promise<Template> {
	const id = crypto.randomUUID();
	const [row] = await db
		.insert(formTemplate)
		.values({ ...values, id, familyId: id, version: 1 })
		.returning();
	if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");
	return row;
}

/**
 * Copy all questions of one template into another, keeping each question's
 * `key` and re-pointing leerling→coach correspondences (`mapsToQuestionId`) at
 * the copied coach questions.
 */
export async function copyQuestions(db: Db, fromTemplateId: string, toTemplateId: string) {
	const questions = await db
		.select()
		.from(formQuestion)
		.where(eq(formQuestion.templateId, fromTemplateId))
		.orderBy(asc(formQuestion.position));
	if (questions.length === 0) return;
	const newId = new Map(questions.map((q) => [q.id, crypto.randomUUID()]));
	await db.insert(formQuestion).values(
		questions.map((q) => ({
			id: newId.get(q.id)!,
			templateId: toTemplateId,
			key: q.key,
			section: q.section,
			type: q.type,
			label: q.label,
			helpText: q.helpText,
			required: q.required,
			position: q.position,
			options: q.options,
			mapsToQuestionId: q.mapsToQuestionId ? (newId.get(q.mapsToQuestionId) ?? null) : null,
		})),
	);
}

/** The newest version in a family. */
export async function latestVersion(db: Db, familyId: string): Promise<Template> {
	const [row] = await db
		.select()
		.from(formTemplate)
		.where(eq(formTemplate.familyId, familyId))
		.orderBy(desc(formTemplate.version))
		.limit(1);
	if (!row) throw new ORPCError("NOT_FOUND");
	return row;
}

/** Why a template can't be edited in place, or null when it can. */
export async function inUseReason(db: Db, tpl: Template): Promise<string | null> {
	const latest = await latestVersion(db, tpl.familyId);
	if (latest.id !== tpl.id) return "Er is al een nieuwere versie van dit formulier.";
	const [used] = await db
		.select({ n: sql<number>`1` })
		.from(formSubmission)
		.where(eq(formSubmission.templateId, tpl.id))
		.limit(1);
	if (used) return "Er zijn al plannen op dit formulier ingevuld.";
	const [copied] = await db
		.select({ n: sql<number>`1` })
		.from(formTemplate)
		.where(eq(formTemplate.parentTemplateId, tpl.id))
		.limit(1);
	if (copied) return "Scholen gebruiken een kopie van dit formulier.";
	return null;
}

/** CONFLICT when the template's questions may not change any more. */
export async function assertEditable(db: Db, tpl: Template): Promise<void> {
	const reason = await inUseReason(db, tpl);
	if (reason) {
		throw new ORPCError("CONFLICT", {
			message: `${reason} Maak een nieuwe versie om het aan te passen.`,
		});
	}
}

/**
 * Next version of a form, with `copyFrom`'s questions (default: the current
 * latest). Not the school default yet; the school switches when it's ready.
 */
export async function newVersion(
	db: Db,
	tpl: Template,
	opts: { copyFrom?: Template; parentTemplateId?: string | null } = {},
): Promise<Template> {
	const latest = await latestVersion(db, tpl.familyId);
	const [row] = await db
		.insert(formTemplate)
		.values({
			familyId: latest.familyId,
			version: latest.version + 1,
			scope: latest.scope,
			organizationId: latest.organizationId,
			parentTemplateId:
				opts.parentTemplateId !== undefined ? opts.parentTemplateId : latest.parentTemplateId,
			name: latest.name,
			description: latest.description,
			createdById: latest.createdById,
		})
		.returning();
	if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");
	await copyQuestions(db, (opts.copyFrom ?? latest).id, row.id);
	return row;
}

/** For a school copy: the newer Ondivera version it could upgrade to, if any. */
export async function sourceUpdate(db: Db, tpl: Template): Promise<Template | null> {
	if (!tpl.parentTemplateId) return null;
	const [parent] = await db
		.select()
		.from(formTemplate)
		.where(eq(formTemplate.id, tpl.parentTemplateId));
	if (!parent) return null;
	const latest = await latestVersion(db, parent.familyId);
	return latest.version > parent.version ? latest : null;
}

/**
 * Bring a school copy up to the newest version of its source (D5: the school
 * chooses when). Creates the school's next version with the source's
 * questions; if the old version was the school default or assigned to
 * leerlingen, the new one takes over. Plans already filled in stay on their
 * version. The school's own changes to the old version are not carried over.
 */
export async function upgradeFromSource(db: Db, tpl: Template): Promise<Template> {
	const source = await sourceUpdate(db, tpl);
	if (!source) throw new ORPCError("CONFLICT", { message: "Er is geen nieuwere versie van de bron" });
	const latest = await latestVersion(db, tpl.familyId);
	const next = await newVersion(db, latest, { copyFrom: source, parentTemplateId: source.id });
	// Whichever version of this form was the school default or assigned to
	// leerlingen (not necessarily the newest), the upgrade takes its place.
	const family = await db
		.select({ id: formTemplate.id, isSchoolDefault: formTemplate.isSchoolDefault })
		.from(formTemplate)
		.where(eq(formTemplate.familyId, tpl.familyId));
	const familyIds = family.map((f) => f.id).filter((id) => id !== next.id);
	if (family.some((f) => f.isSchoolDefault)) {
		await db
			.update(formTemplate)
			.set({ isSchoolDefault: false })
			.where(inArray(formTemplate.id, familyIds));
		await db
			.update(formTemplate)
			.set({ isSchoolDefault: true, updatedAt: new Date() })
			.where(eq(formTemplate.id, next.id));
	}
	await db
		.update(formAssignment)
		.set({ templateId: next.id, updatedAt: new Date() })
		.where(inArray(formAssignment.templateId, familyIds));
	const [fresh] = await db.select().from(formTemplate).where(eq(formTemplate.id, next.id));
	return fresh ?? next;
}
