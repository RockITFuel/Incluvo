import {
	auditLog,
	course,
	formTemplate,
	organization,
	user,
} from "@incluvo/drizzle/schema";
import {
	atLeast,
	isSuperadmin,
	policies,
	sameTenant,
} from "@incluvo/permissions";
import type { Database } from "@incluvo/drizzle";
import { ORPCError } from "@orpc/server";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { base, ownTenant, protectedProcedure, withPolicy } from "../base";

/**
 * Admin omgeving (backlog #60, Epic 9). Register key: `admin`.
 *
 * Beheer voor school (keyuser) en Ondivera (superadmin):
 *  - `organizations`  — superadmin lists/creates/edits scholen + per-school
 *    stats; keyuser views/edits their own school's settings.
 *  - `users`          — admin-level cross-tenant user overview (keyuser+
 *    re-uses `account.users` for the per-tenant CRUD; this adds a cross-tenant
 *    aggregate for the superadmin and a per-org grouping).
 *  - `templates`      — read-only overview of form templates (#8/#9) and
 *    courses (#23) per school, with counts/links.
 *  - `audit`          — tenant-scoped audit-log inzage for keyuser (their org's
 *    actors only) and global for superadmin, paged + filtered (#60).
 *  - `settings`       — retention/bewaartermijnen (#4 privacy). There is NO
 *    settings/retention table in the schema, so these are a typed STUB that
 *    returns sane defaults and rejects writes. See "ORCHESTRATOR TODO".
 *
 * Tenant scoping: role-only gates use `withPolicy(...)`; once a row is loaded
 * handlers re-check `sameTenant(actor, row)`. The superadmin (Ondivera) is the
 * only cross-tenant actor.
 */

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

const OrganizationSchema = z.object({
	id: z.string(),
	name: z.string(),
	kind: z.enum(["ondivera", "school"]),
	parentId: z.string().nullable(),
	createdAt: z.date(),
});

const SchoolStatsSchema = z.object({
	organizationId: z.string(),
	userCount: z.number().int(),
	coachCount: z.number().int(),
	leerlingCount: z.number().int(),
	formTemplateCount: z.number().int(),
	courseCount: z.number().int(),
});

const orgColumns = {
	id: organization.id,
	name: organization.name,
	kind: organization.kind,
	parentId: organization.parentId,
	createdAt: organization.createdAt,
} as const;

/** Resolve the single Ondivera root org id (parent for new schools). */
async function ondiveraRootId(db: Database): Promise<string | null> {
	const [root] = await db
		.select({ id: organization.id })
		.from(organization)
		.where(eq(organization.kind, "ondivera"))
		.limit(1);
	return root?.id ?? null;
}

// ---------------------------------------------------------------------------
// organizations / scholen
// ---------------------------------------------------------------------------

/**
 * List all organizations with admin-level aggregates (superadmin only).
 * Returns Ondivera + every school with per-school counts so the admin sees the
 * whole tenant tree at a glance.
 */
const orgListAll = protectedProcedure
	.use(withPolicy(policies.manageTenant))
	.route({ method: "GET", path: "/admin/organizations", tags: ["admin"] })
	.output(
		z.array(
			OrganizationSchema.extend({
				stats: SchoolStatsSchema.omit({ organizationId: true }),
			}),
		),
	)
	.handler(async ({ context }) => {
		const orgs = await context.db
			.select(orgColumns)
			.from(organization)
			.orderBy(organization.kind, organization.name);

		// Aggregate counts grouped by tenant in three cheap grouped queries.
		const usersByOrg = await context.db
			.select({
				organizationId: user.organizationId,
				role: user.role,
				value: count(),
			})
			.from(user)
			.groupBy(user.organizationId, user.role);

		const templatesByOrg = await context.db
			.select({
				organizationId: formTemplate.organizationId,
				value: count(),
			})
			.from(formTemplate)
			.groupBy(formTemplate.organizationId);

		const coursesByOrg = await context.db
			.select({
				organizationId: course.organizationId,
				value: count(),
			})
			.from(course)
			.groupBy(course.organizationId);

		const statFor = (orgId: string) => {
			const userRows = usersByOrg.filter(
				(r) => r.organizationId === orgId,
			);
			const userCount = userRows.reduce((s, r) => s + r.value, 0);
			const coachCount =
				userRows.find((r) => r.role === "coach")?.value ?? 0;
			const leerlingCount =
				userRows.find((r) => r.role === "leerling")?.value ?? 0;
			const formTemplateCount =
				templatesByOrg.find((r) => r.organizationId === orgId)?.value ?? 0;
			const courseCount =
				coursesByOrg.find((r) => r.organizationId === orgId)?.value ?? 0;
			return {
				userCount,
				coachCount,
				leerlingCount,
				formTemplateCount,
				courseCount,
			};
		};

		return orgs.map((o) => ({ ...o, stats: statFor(o.id) }));
	});

/** The actor's own organization (keyuser views their school). */
const orgCurrent = protectedProcedure
	.route({
		method: "GET",
		path: "/admin/organizations/current",
		tags: ["admin"],
	})
	.output(OrganizationSchema.nullable())
	.handler(async ({ context }) => {
		if (!context.actor.organizationId) return null;
		const [o] = await context.db
			.select(orgColumns)
			.from(organization)
			.where(eq(organization.id, context.actor.organizationId));
		return o ?? null;
	});

/**
 * Per-school stats. Superadmin for any org; keyuser only for their own org.
 */
const orgStats = protectedProcedure
	.use(withPolicy(policies.readUsers, ownTenant))
	.route({
		method: "GET",
		path: "/admin/organizations/{organizationId}/stats",
		tags: ["admin"],
	})
	.input(z.object({ organizationId: z.string().uuid() }))
	.output(SchoolStatsSchema)
	.handler(async ({ input, context }) => {
		const { actor } = context;
		if (!sameTenant(actor, { organizationId: input.organizationId })) {
			throw new ORPCError("FORBIDDEN", {
				message: "Not allowed to view stats for this tenant",
			});
		}

		const orgScope = eq(user.organizationId, input.organizationId);
		const [users] = await context.db
			.select({ value: count() })
			.from(user)
			.where(orgScope);
		const [coaches] = await context.db
			.select({ value: count() })
			.from(user)
			.where(and(orgScope, eq(user.role, "coach")));
		const [leerlingen] = await context.db
			.select({ value: count() })
			.from(user)
			.where(and(orgScope, eq(user.role, "leerling")));
		const [templates] = await context.db
			.select({ value: count() })
			.from(formTemplate)
			.where(eq(formTemplate.organizationId, input.organizationId));
		const [courses] = await context.db
			.select({ value: count() })
			.from(course)
			.where(eq(course.organizationId, input.organizationId));

		return {
			organizationId: input.organizationId,
			userCount: users?.value ?? 0,
			coachCount: coaches?.value ?? 0,
			leerlingCount: leerlingen?.value ?? 0,
			formTemplateCount: templates?.value ?? 0,
			courseCount: courses?.value ?? 0,
		};
	});

/**
 * Create a school (kind=school) under the Ondivera root (superadmin only).
 * Parent defaults to the single Ondivera org so the tenant tree stays correct.
 */
const orgCreateSchool = protectedProcedure
	.use(withPolicy(policies.manageTenant))
	.route({ method: "POST", path: "/admin/organizations", tags: ["admin"] })
	.input(
		z.object({
			name: z.string().min(1),
			parentId: z.string().uuid().nullable().optional(),
		}),
	)
	.output(OrganizationSchema)
	.handler(async ({ input, context }) => {
		const parentId = input.parentId ?? (await ondiveraRootId(context.db));
		const [row] = await context.db
			.insert(organization)
			.values({ name: input.name, kind: "school", parentId })
			.returning(orgColumns);
		if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");
		return row;
	});

/**
 * Update an organization's settings. Superadmin may edit any org; a keyuser may
 * edit (rename) only their own school. `kind`/`parentId` are superadmin-only.
 */
const orgUpdate = protectedProcedure
	.use(withPolicy(policies.manageUsers, ownTenant))
	.route({
		method: "PUT",
		path: "/admin/organizations/{id}",
		tags: ["admin"],
	})
	.input(
		z.object({
			id: z.string().uuid(),
			name: z.string().min(1).optional(),
			kind: z.enum(["ondivera", "school"]).optional(),
			parentId: z.string().uuid().nullable().optional(),
		}),
	)
	.output(OrganizationSchema)
	.handler(async ({ input, context }) => {
		const { actor } = context;
		const { id, kind, parentId, ...patch } = input;

		// Tenant scope: keyuser may only touch their own org.
		if (!sameTenant(actor, { organizationId: id })) {
			throw new ORPCError("FORBIDDEN", {
				message: "Not allowed to edit this organization",
			});
		}
		// Structural fields (kind/parent) are superadmin-only.
		if ((kind !== undefined || parentId !== undefined) && !isSuperadmin(actor.role)) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only the superadmin may change kind/parent",
			});
		}

		const [row] = await context.db
			.update(organization)
			.set({
				...patch,
				...(isSuperadmin(actor.role) ? { kind, parentId } : {}),
				updatedAt: new Date(),
			})
			.where(eq(organization.id, id))
			.returning(orgColumns);
		if (!row) throw new ORPCError("NOT_FOUND");
		return row;
	});

const organizationsRouter = base.router({
	listAll: orgListAll,
	current: orgCurrent,
	stats: orgStats,
	createSchool: orgCreateSchool,
	update: orgUpdate,
});

// ---------------------------------------------------------------------------
// users — admin-level cross-tenant overview
// ---------------------------------------------------------------------------

const AdminUserRowSchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string(),
	role: z.string(),
	organizationId: z.string().nullable(),
	organizationName: z.string().nullable(),
	createdAt: z.date(),
});

/**
 * Admin user overview. Superadmin sees every user across tenants (optionally
 * filtered to one org); keyuser+ sees only their own tenant. Per-tenant role
 * changes/invites are done via the existing `account.users.*` procedures; this
 * is the cross-tenant read used by the superadmin Scholen/Gebruikers view.
 */
const usersOverview = protectedProcedure
	.use(withPolicy(policies.readUsers, ownTenant))
	.route({ method: "GET", path: "/admin/users", tags: ["admin"] })
	.input(
		z
			.object({ organizationId: z.string().uuid().optional() })
			.optional(),
	)
	.output(z.array(AdminUserRowSchema))
	.handler(async ({ input, context }) => {
		const { actor } = context;

		// Non-superadmin is always pinned to their own tenant.
		const orgFilter = isSuperadmin(actor.role)
			? input?.organizationId
			: (actor.organizationId ?? "");

		const rows = await context.db
			.select({
				id: user.id,
				name: user.name,
				email: user.email,
				role: user.role,
				organizationId: user.organizationId,
				organizationName: organization.name,
				createdAt: user.createdAt,
			})
			.from(user)
			.leftJoin(organization, eq(user.organizationId, organization.id))
			.where(orgFilter ? eq(user.organizationId, orgFilter) : undefined)
			.orderBy(user.name);

		// Defence in depth: never leak cross-tenant rows to a non-superadmin.
		return rows.filter((r) => sameTenant(actor, r));
	});

const usersRouter = base.router({
	overview: usersOverview,
});

// ---------------------------------------------------------------------------
// templates — read-only overview of forms (#8/#9) & courses (#23)
// ---------------------------------------------------------------------------

const FormTemplateRowSchema = z.object({
	id: z.string(),
	name: z.string(),
	scope: z.enum(["ondivera", "school"]),
	organizationId: z.string().nullable(),
	isSchoolDefault: z.boolean(),
	createdAt: z.date(),
});

const CourseRowSchema = z.object({
	id: z.string(),
	title: z.string(),
	kind: z.enum(["ondivera_template", "school_template", "student_execution"]),
	organizationId: z.string().nullable(),
	createdAt: z.date(),
});

/**
 * Read-only list of form templates an admin can see. Superadmin sees all
 * (Ondivera + every school); keyuser+ sees Ondivera platform templates (scope
 * ondivera, no org) plus their own school's templates.
 */
const templatesForms = protectedProcedure
	.use(withPolicy(policies.readForm, ownTenant))
	.route({ method: "GET", path: "/admin/templates/forms", tags: ["admin"] })
	.output(z.array(FormTemplateRowSchema))
	.handler(async ({ context }) => {
		const { actor } = context;
		const rows = await context.db
			.select({
				id: formTemplate.id,
				name: formTemplate.name,
				scope: formTemplate.scope,
				organizationId: formTemplate.organizationId,
				isSchoolDefault: formTemplate.isSchoolDefault,
				createdAt: formTemplate.createdAt,
			})
			.from(formTemplate)
			.orderBy(formTemplate.scope, formTemplate.name);

		if (isSuperadmin(actor.role)) return rows;
		// Keyuser: Ondivera platform templates (visible to everyone) + own org.
		return rows.filter(
			(r) =>
				(r.scope === "ondivera" && r.organizationId === null) ||
				sameTenant(actor, r),
		);
	});

/**
 * Read-only list of courses (#23) for the admin overview. Superadmin sees all;
 * keyuser+ sees Ondivera templates + their own school's courses.
 */
const templatesCourses = protectedProcedure
	.use(withPolicy(policies.readCourse, ownTenant))
	.route({
		method: "GET",
		path: "/admin/templates/courses",
		tags: ["admin"],
	})
	.output(z.array(CourseRowSchema))
	.handler(async ({ context }) => {
		const { actor } = context;
		const rows = await context.db
			.select({
				id: course.id,
				title: course.title,
				kind: course.kind,
				organizationId: course.organizationId,
				createdAt: course.createdAt,
			})
			.from(course)
			.orderBy(course.kind, course.title);

		if (isSuperadmin(actor.role)) return rows;
		return rows.filter(
			(r) =>
				(r.kind === "ondivera_template" && r.organizationId === null) ||
				sameTenant(actor, r),
		);
	});

const templatesRouter = base.router({
	forms: templatesForms,
	courses: templatesCourses,
});

// ---------------------------------------------------------------------------
// audit — inzage (#60), tenant-scoped for keyuser, global for superadmin
// ---------------------------------------------------------------------------

const AuditRowSchema = z.object({
	id: z.string(),
	actor: z.string(),
	tableName: z.string(),
	rowId: z.string().nullable(),
	operation: z.string(),
	createdAt: z.date(),
});

/**
 * Read the audit log. The schema's `readAudit` policy is superadmin-only, but
 * #60 wants a keyuser to inspect *their own tenant's* activity. We therefore
 * gate at the handler: keyuser+ may read, and a non-superadmin is restricted to
 * audit rows whose `actor` is a user in their own organization (the actor
 * column holds `user:<id>` / `system`). See "ORCHESTRATOR TODO" — the
 * `readAudit` policy could be relaxed to formalise the keyuser tenant-scope.
 *
 * Filters: table name, operation, and a specific actor. Paged (limit/offset)
 * with a `hasMore` flag (fetch-one-extra).
 */
const auditList = protectedProcedure
	.route({ method: "GET", path: "/admin/audit", tags: ["admin"] })
	.input(
		z.object({
			limit: z.number().int().min(1).max(100).default(25),
			offset: z.number().int().min(0).default(0),
			tableName: z.string().optional(),
			operation: z.enum(["INSERT", "UPDATE", "DELETE"]).optional(),
			actor: z.string().optional(),
		}),
	)
	.output(
		z.object({
			items: z.array(AuditRowSchema),
			hasMore: z.boolean(),
			scope: z.enum(["global", "tenant"]),
		}),
	)
	.handler(async ({ input, context }) => {
		const { actor } = context;

		// Role gate: only keyuser+ may read the audit log at all.
		if (!atLeast(actor.role, "keyuser")) {
			throw new ORPCError("FORBIDDEN", {
				message: "Audit log inzage requires keyuser or higher",
			});
		}

		const conditions = [];
		if (input.tableName) {
			conditions.push(eq(auditLog.tableName, input.tableName));
		}
		if (input.operation) {
			conditions.push(eq(auditLog.operation, input.operation));
		}
		if (input.actor) {
			conditions.push(eq(auditLog.actor, input.actor));
		}

		const isGlobal = isSuperadmin(actor.role);
		if (!isGlobal) {
			// Tenant scope: only audit rows authored by an actor in our org.
			if (!actor.organizationId) {
				return { items: [], hasMore: false, scope: "tenant" as const };
			}
			const tenantUsers = await context.db
				.select({ id: user.id })
				.from(user)
				.where(eq(user.organizationId, actor.organizationId));
			const actorTokens = tenantUsers.map((u) => `user:${u.id}`);
			if (actorTokens.length === 0) {
				return { items: [], hasMore: false, scope: "tenant" as const };
			}
			conditions.push(inArray(auditLog.actor, actorTokens));
		}

		const where =
			conditions.length > 0 ? and(...conditions) : undefined;

		const rows = await context.db
			.select({
				id: auditLog.id,
				actor: auditLog.actor,
				tableName: auditLog.tableName,
				rowId: auditLog.rowId,
				operation: auditLog.operation,
				createdAt: auditLog.createdAt,
			})
			.from(auditLog)
			.where(where)
			.orderBy(desc(auditLog.createdAt))
			.limit(input.limit + 1)
			.offset(input.offset);

		const hasMore = rows.length > input.limit;
		return {
			items: hasMore ? rows.slice(0, input.limit) : rows,
			hasMore,
			scope: isGlobal ? ("global" as const) : ("tenant" as const),
		};
	});

const auditRouter = base.router({
	list: auditList,
});

// ---------------------------------------------------------------------------
// settings — bewaartermijnen / retention (#4 privacy) — STUB (no table yet)
// ---------------------------------------------------------------------------

/**
 * Retention / bewaartermijnen settings (#4, AVG). There is intentionally NO
 * settings/retention table in the schema (we may not edit it), so this is a
 * typed STUB: `get` returns documented defaults; `update` is rejected with a
 * clear message so the UI can render the intended shape without pretending to
 * persist. See "ORCHESTRATOR TODO" — a `settings`/`retention` table is needed
 * to make this real.
 */
const RetentionSettingsSchema = z.object({
	organizationId: z.string().nullable(),
	coachplanRetentionDays: z.number().int(),
	chatRetentionDays: z.number().int(),
	recordingRetentionDays: z.number().int(),
	transcriptRetentionDays: z.number().int(),
	deleteRecordingAfterTranscription: z.boolean(),
	// Marks this as a non-persisted default until a settings table exists.
	persisted: z.boolean(),
});

const DEFAULT_RETENTION = {
	coachplanRetentionDays: 365 * 2,
	chatRetentionDays: 365,
	recordingRetentionDays: 30,
	transcriptRetentionDays: 365,
	deleteRecordingAfterTranscription: true,
} as const;

/** Read retention settings (keyuser+ for their tenant; superadmin global). */
const settingsGet = protectedProcedure
	.use(withPolicy(policies.manageUsers, ownTenant))
	.route({
		method: "GET",
		path: "/admin/settings/retention",
		tags: ["admin"],
	})
	.output(RetentionSettingsSchema)
	.handler(async ({ context }) => {
		return {
			organizationId: context.actor.organizationId ?? null,
			...DEFAULT_RETENTION,
			persisted: false,
		};
	});

/**
 * Update retention settings — STUB. Returns BAD_REQUEST until a settings table
 * exists; the typed input shape documents what we will persist.
 */
const settingsUpdate = protectedProcedure
	.use(withPolicy(policies.manageUsers, ownTenant))
	.route({
		method: "PUT",
		path: "/admin/settings/retention",
		tags: ["admin"],
	})
	.input(
		z.object({
			coachplanRetentionDays: z.number().int().min(0).optional(),
			chatRetentionDays: z.number().int().min(0).optional(),
			recordingRetentionDays: z.number().int().min(0).optional(),
			transcriptRetentionDays: z.number().int().min(0).optional(),
			deleteRecordingAfterTranscription: z.boolean().optional(),
		}),
	)
	.output(RetentionSettingsSchema)
	.handler(() => {
		throw new ORPCError("NOT_IMPLEMENTED", {
			message:
				"Bewaartermijnen kunnen nog niet worden opgeslagen: er ontbreekt een settings/retention-tabel in het schema (zie ORCHESTRATOR TODO).",
		});
	});

const settingsRouter = base.router({
	getRetention: settingsGet,
	updateRetention: settingsUpdate,
});

// ---------------------------------------------------------------------------
// Domain router
// ---------------------------------------------------------------------------

export const adminRouter = base.router({
	organizations: organizationsRouter,
	users: usersRouter,
	templates: templatesRouter,
	audit: auditRouter,
	settings: settingsRouter,
});
