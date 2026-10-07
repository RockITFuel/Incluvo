/**
 * Cursuscatalogus (docs/decisions/cursuscatalogus.md): which Ondivera
 * templates each school may use, and categories to filter the catalogue.
 *
 *  - `availableTemplateIds` — the visibility rule `courses.list` and
 *    `loadReadable` apply for school users.
 *  - `catalog.categories.*` — Ondivera manages the categories; everyone who
 *    builds or follows courses can read them to filter.
 *  - `catalog.setCategories` — put a template in categories.
 *  - `catalog.availability.*` — per course (which schools) and per school
 *    (which courses), superadmin only.
 */
import type { Database } from "@incluvo/drizzle";
import {
	course,
	courseCategory,
	courseCategoryLink,
	courseSchoolAvailability,
	organization,
} from "@incluvo/drizzle/schema";
import { canBuildCourses, isSuperadmin, policies, sameTenant } from "@incluvo/permissions";
import { ORPCError } from "@orpc/server";
import { and, asc, count, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { publishTo } from "../../sse";
import { type AuthedContext, base, protectedProcedure, withPolicy } from "../base";

/** Ondivera templates (among `courseIds`, or all) a school may use. */
export async function availableTemplateIds(
	db: Database,
	organizationId: string | null | undefined,
	courseIds?: string[],
): Promise<Set<string>> {
	const templates = await db
		.select({ id: course.id, all: course.availableToAllSchools })
		.from(course)
		.where(
			and(
				eq(course.kind, "ondivera_template"),
				courseIds ? inArray(course.id, courseIds) : undefined,
			),
		);
	const open = new Set(templates.filter((t) => t.all).map((t) => t.id));
	const closed = templates.filter((t) => !t.all).map((t) => t.id);
	if (organizationId && closed.length > 0) {
		const rows = await db
			.select({ id: courseSchoolAvailability.courseId })
			.from(courseSchoolAvailability)
			.where(
				and(
					eq(courseSchoolAvailability.organizationId, organizationId),
					inArray(courseSchoolAvailability.courseId, closed),
				),
			);
		for (const r of rows) open.add(r.id);
	}
	return open;
}

/** Category ids per course, for the list. */
export async function categoryIdsByCourse(
	db: Database,
	courseIds: string[],
): Promise<Map<string, string[]>> {
	const map = new Map<string, string[]>();
	if (courseIds.length === 0) return map;
	const rows = await db
		.select({ courseId: courseCategoryLink.courseId, categoryId: courseCategoryLink.categoryId })
		.from(courseCategoryLink)
		.where(inArray(courseCategoryLink.courseId, courseIds));
	for (const r of rows) map.set(r.courseId, [...(map.get(r.courseId) ?? []), r.categoryId]);
	return map;
}

/** Schools per closed Ondivera template, for the superadmin's list. */
export async function schoolIdsByTemplate(
	db: Database,
	courseIds: string[],
): Promise<Map<string, string[]>> {
	const map = new Map<string, string[]>();
	if (courseIds.length === 0) return map;
	const rows = await db
		.select({
			courseId: courseSchoolAvailability.courseId,
			organizationId: courseSchoolAvailability.organizationId,
		})
		.from(courseSchoolAvailability)
		.where(inArray(courseSchoolAvailability.courseId, courseIds));
	for (const r of rows) map.set(r.courseId, [...(map.get(r.courseId) ?? []), r.organizationId]);
	return map;
}

const changed = (context: AuthedContext) =>
	// Every catalogue change can change what a school sees; refresh lists.
	publishTo({ type: "course.changed", payload: { courseId: null } }, [context.actor.userId]);

// ---------------------------------------------------------------------------
// categories
// ---------------------------------------------------------------------------

const CategorySchema = z.object({
	id: z.string(),
	name: z.string(),
	courseCount: z.number().int(),
});

const categoryName = z.string().trim().min(1).max(60);

/** All categories with how many courses use them (anyone but a leerling). */
const categoriesList = protectedProcedure
	.route({ method: "GET", path: "/courses/categories", tags: ["courses"] })
	.output(z.array(CategorySchema))
	.handler(async ({ context }) => {
		if (context.actor.role === "leerling") throw new ORPCError("FORBIDDEN");
		const rows = await context.db
			.select({ id: courseCategory.id, name: courseCategory.name })
			.from(courseCategory)
			.orderBy(asc(courseCategory.name));
		const counts = await context.db
			.select({ id: courseCategoryLink.categoryId, value: count() })
			.from(courseCategoryLink)
			.groupBy(courseCategoryLink.categoryId);
		const countOf = new Map(counts.map((c) => [c.id, c.value]));
		return rows.map((r) => ({ ...r, courseCount: countOf.get(r.id) ?? 0 }));
	});

async function assertNameFree(db: Database, name: string, exceptId?: string) {
	const [clash] = await db
		.select({ id: courseCategory.id })
		.from(courseCategory)
		.where(
			and(
				eq(courseCategory.name, name),
				exceptId ? ne(courseCategory.id, exceptId) : undefined,
			),
		);
	if (clash) throw new ORPCError("CONFLICT", { message: "Deze categorie bestaat al." });
}

const categoriesCreate = protectedProcedure
	.use(withPolicy(policies.manageTenant))
	.route({ method: "POST", path: "/courses/categories", tags: ["courses"] })
	.input(z.object({ name: categoryName }))
	.output(CategorySchema)
	.handler(async ({ input, context }) => {
		await assertNameFree(context.db, input.name);
		const [row] = await context.db
			.insert(courseCategory)
			.values({ name: input.name })
			.returning({ id: courseCategory.id, name: courseCategory.name });
		if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");
		changed(context);
		return { ...row, courseCount: 0 };
	});

const categoriesRename = protectedProcedure
	.use(withPolicy(policies.manageTenant))
	.route({ method: "PUT", path: "/courses/categories/{id}", tags: ["courses"] })
	.input(z.object({ id: z.string().uuid(), name: categoryName }))
	.output(z.object({ id: z.string(), name: z.string() }))
	.handler(async ({ input, context }) => {
		await assertNameFree(context.db, input.name, input.id);
		const [row] = await context.db
			.update(courseCategory)
			.set({ name: input.name, updatedAt: new Date() })
			.where(eq(courseCategory.id, input.id))
			.returning({ id: courseCategory.id, name: courseCategory.name });
		if (!row) throw new ORPCError("NOT_FOUND");
		changed(context);
		return row;
	});

/** Delete a category; its courses simply lose it. */
const categoriesDelete = protectedProcedure
	.use(withPolicy(policies.manageTenant))
	.route({ method: "DELETE", path: "/courses/categories/{id}", tags: ["courses"] })
	.input(z.object({ id: z.string().uuid() }))
	.output(z.object({ ok: z.boolean() }))
	.handler(async ({ input, context }) => {
		await context.db.delete(courseCategory).where(eq(courseCategory.id, input.id));
		changed(context);
		return { ok: true };
	});

/**
 * Put a template in categories (replaces the set). Ondivera templates: the
 * superadmin; a school's template: its course builders. Not a leerling's copy.
 */
const setCategories = protectedProcedure
	.route({ method: "PUT", path: "/courses/{courseId}/categories", tags: ["courses"] })
	.input(z.object({ courseId: z.string().uuid(), categoryIds: z.array(z.string().uuid()).max(50) }))
	.output(z.object({ categoryIds: z.array(z.string()) }))
	.handler(async ({ input, context }) => {
		const { actor } = context;
		const [row] = await context.db
			.select({ kind: course.kind, organizationId: course.organizationId })
			.from(course)
			.where(eq(course.id, input.courseId));
		if (!row) throw new ORPCError("NOT_FOUND");
		const allowed =
			row.kind === "ondivera_template"
				? isSuperadmin(actor.role)
				: row.kind === "school_template" &&
					canBuildCourses(actor.role) &&
					sameTenant(actor, row);
		if (!allowed) throw new ORPCError("FORBIDDEN");

		const ids = [...new Set(input.categoryIds)];
		if (ids.length > 0) {
			const found = await context.db
				.select({ id: courseCategory.id })
				.from(courseCategory)
				.where(inArray(courseCategory.id, ids));
			if (found.length !== ids.length) {
				throw new ORPCError("BAD_REQUEST", { message: "Onbekende categorie" });
			}
		}
		await context.db.transaction(async (tx) => {
			await tx.delete(courseCategoryLink).where(eq(courseCategoryLink.courseId, input.courseId));
			if (ids.length > 0) {
				await tx
					.insert(courseCategoryLink)
					.values(ids.map((categoryId) => ({ courseId: input.courseId, categoryId })));
			}
		});
		changed(context);
		return { categoryIds: ids };
	});

// ---------------------------------------------------------------------------
// availability (superadmin)
// ---------------------------------------------------------------------------

async function loadTemplate(db: Database, courseId: string) {
	const [row] = await db
		.select({ id: course.id, kind: course.kind, all: course.availableToAllSchools })
		.from(course)
		.where(eq(course.id, courseId));
	if (!row) throw new ORPCError("NOT_FOUND");
	if (row.kind !== "ondivera_template") {
		throw new ORPCError("BAD_REQUEST", {
			message: "Alleen Ondivera-cursussen worden per school beschikbaar gemaakt.",
		});
	}
	return row;
}

async function schoolIds(db: Database, ids?: string[]): Promise<string[]> {
	const rows = await db
		.select({ id: organization.id })
		.from(organization)
		.where(and(eq(organization.kind, "school"), ids ? inArray(organization.id, ids) : undefined));
	return rows.map((r) => r.id);
}

const AvailabilitySchema = z.object({
	courseId: z.string(),
	allSchools: z.boolean(),
	organizationIds: z.array(z.string()),
});

/** Set who may use a template: every school, or exactly these schools. */
const availabilitySet = protectedProcedure
	.use(withPolicy(policies.manageTenant))
	.route({ method: "PUT", path: "/courses/{courseId}/availability", tags: ["courses"] })
	.input(
		z.object({
			courseId: z.string().uuid(),
			allSchools: z.boolean(),
			organizationIds: z.array(z.string().uuid()).default([]),
		}),
	)
	.output(AvailabilitySchema)
	.handler(async ({ input, context }) => {
		await loadTemplate(context.db, input.courseId);
		const orgIds = input.allSchools
			? []
			: await schoolIds(context.db, [...new Set(input.organizationIds)]);
		await context.db.transaction(async (tx) => {
			await tx
				.update(course)
				.set({ availableToAllSchools: input.allSchools, updatedAt: new Date() })
				.where(eq(course.id, input.courseId));
			await tx
				.delete(courseSchoolAvailability)
				.where(eq(courseSchoolAvailability.courseId, input.courseId));
			if (orgIds.length > 0) {
				await tx
					.insert(courseSchoolAvailability)
					.values(orgIds.map((organizationId) => ({ courseId: input.courseId, organizationId })));
			}
		});
		changed(context);
		return { courseId: input.courseId, allSchools: input.allSchools, organizationIds: orgIds };
	});

/**
 * Turn one template on or off for one school (the school page). Turning a
 * template that is open to all schools off for one school switches it to
 * "selected schools": every other school keeps it.
 */
const availabilitySetForSchool = protectedProcedure
	.use(withPolicy(policies.manageTenant))
	.route({
		method: "PUT",
		path: "/courses/{courseId}/availability/{organizationId}",
		tags: ["courses"],
	})
	.input(
		z.object({
			courseId: z.string().uuid(),
			organizationId: z.string().uuid(),
			available: z.boolean(),
		}),
	)
	.output(z.object({ available: z.boolean() }))
	.handler(async ({ input, context }) => {
		const tpl = await loadTemplate(context.db, input.courseId);
		if ((await schoolIds(context.db, [input.organizationId])).length === 0) {
			throw new ORPCError("NOT_FOUND", { message: "School niet gevonden" });
		}
		await context.db.transaction(async (tx) => {
			if (tpl.all) {
				if (input.available) return;
				const others = (await schoolIds(tx as unknown as Database)).filter(
					(id) => id !== input.organizationId,
				);
				await tx
					.update(course)
					.set({ availableToAllSchools: false, updatedAt: new Date() })
					.where(eq(course.id, input.courseId));
				if (others.length > 0) {
					await tx
						.insert(courseSchoolAvailability)
						.values(others.map((organizationId) => ({ courseId: input.courseId, organizationId })))
						.onConflictDoNothing();
				}
				return;
			}
			if (input.available) {
				await tx
					.insert(courseSchoolAvailability)
					.values({ courseId: input.courseId, organizationId: input.organizationId })
					.onConflictDoNothing();
			} else {
				await tx
					.delete(courseSchoolAvailability)
					.where(
						and(
							eq(courseSchoolAvailability.courseId, input.courseId),
							eq(courseSchoolAvailability.organizationId, input.organizationId),
						),
					);
			}
		});
		changed(context);
		return { available: input.available };
	});

export const catalogRouter = base.router({
	categories: base.router({
		list: categoriesList,
		create: categoriesCreate,
		rename: categoriesRename,
		delete: categoriesDelete,
	}),
	setCategories,
	availability: base.router({
		set: availabilitySet,
		setForSchool: availabilitySetForSchool,
	}),
});
