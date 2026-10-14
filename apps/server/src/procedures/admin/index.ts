import {
	account,
	auditLog,
	coachAssignment,
	course,
	formSubmission,
	formTemplate,
	organization,
	session,
	user,
} from "@incluvo/drizzle/schema";
import {
	atLeast,
	coachesLeerlingen,
	isSuperadmin,
	policies,
	sameTenant,
} from "@incluvo/permissions";
import type { Database } from "@incluvo/drizzle";
import { ORPCError } from "@orpc/server";
import { and, count, countDistinct, desc, eq, inArray, max, ne, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { z } from "zod";
import { assertNotArchived } from "../../access";
import { toggleKoppeling } from "../../koppelingen";
import { env } from "../../env";
import {
	type AuthedContext,
	base,
	ownTenant,
	protectedProcedure,
	withPolicy,
} from "../base";

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
 *  - `settings`       — the bewaartermijnen policy (#4 privacy), read-only.
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
	archivedAt: z.date().nullable(),
	createdAt: z.date(),
});

const SchoolStatsSchema = z.object({
	organizationId: z.string(),
	userCount: z.number().int(),
	keyuserCount: z.number().int(),
	coachCount: z.number().int(),
	leerlingCount: z.number().int(),
	formTemplateCount: z.number().int(),
	courseCount: z.number().int(),
	/** Leerlingen whose coachplan waits for the coach (status `submitted`). */
	plansWaiting: z.number().int(),
	/** Most recent session activity of anyone in the school. */
	lastActiveAt: z.date().nullable(),
});

type SchoolStats = z.infer<typeof SchoolStatsSchema>;

const OrganizationWithStatsSchema = OrganizationSchema.extend({
	stats: SchoolStatsSchema.omit({ organizationId: true }),
});

const orgColumns = {
	id: organization.id,
	name: organization.name,
	kind: organization.kind,
	parentId: organization.parentId,
	archivedAt: organization.archivedAt,
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

/**
 * Per-organization aggregates in a handful of grouped queries (not one query
 * per school), so the platform overview stays cheap with many schools.
 * `orgIds` narrows every query to those organizations; omit it for all.
 */
async function schoolStats(
	db: Database,
	orgIds?: string[],
): Promise<Map<string, SchoolStats>> {
	const inOrgs = (column: PgColumn) =>
		orgIds ? inArray(column, orgIds) : undefined;

	const usersByOrg = await db
		.select({
			organizationId: user.organizationId,
			role: user.role,
			value: count(),
		})
		.from(user)
		.where(inOrgs(user.organizationId))
		.groupBy(user.organizationId, user.role);

	const templatesByOrg = await db
		.select({ organizationId: formTemplate.organizationId, value: count() })
		.from(formTemplate)
		.where(inOrgs(formTemplate.organizationId))
		.groupBy(formTemplate.organizationId);

	const coursesByOrg = await db
		.select({ organizationId: course.organizationId, value: count() })
		.from(course)
		.where(inOrgs(course.organizationId))
		.groupBy(course.organizationId);

	const plansByOrg = await db
		.select({
			organizationId: formSubmission.organizationId,
			value: countDistinct(formSubmission.leerlingId),
		})
		.from(formSubmission)
		.where(
			and(
				eq(formSubmission.status, "submitted"),
				inOrgs(formSubmission.organizationId),
			),
		)
		.groupBy(formSubmission.organizationId);

	const activityByOrg = await db
		.select({
			organizationId: user.organizationId,
			value: max(session.updatedAt),
		})
		.from(session)
		.innerJoin(user, eq(user.id, session.userId))
		.where(inOrgs(user.organizationId))
		.groupBy(user.organizationId);

	const stats = new Map<string, SchoolStats>();
	const statFor = (orgId: string): SchoolStats => {
		let row = stats.get(orgId);
		if (!row) {
			row = {
				organizationId: orgId,
				userCount: 0,
				keyuserCount: 0,
				coachCount: 0,
				leerlingCount: 0,
				formTemplateCount: 0,
				courseCount: 0,
				plansWaiting: 0,
				lastActiveAt: null,
			};
			stats.set(orgId, row);
		}
		return row;
	};
	for (const r of usersByOrg) {
		if (!r.organizationId) continue;
		const row = statFor(r.organizationId);
		row.userCount += r.value;
		if (r.role === "keyuser") row.keyuserCount = r.value;
		if (r.role === "coach") row.coachCount = r.value;
		if (r.role === "leerling") row.leerlingCount = r.value;
	}
	for (const r of templatesByOrg) {
		if (r.organizationId) statFor(r.organizationId).formTemplateCount = r.value;
	}
	for (const r of coursesByOrg) {
		if (r.organizationId) statFor(r.organizationId).courseCount = r.value;
	}
	for (const r of plansByOrg) statFor(r.organizationId).plansWaiting = r.value;
	for (const r of activityByOrg) {
		if (r.organizationId) statFor(r.organizationId).lastActiveAt = r.value;
	}
	return stats;
}

/** Stats for one org without its id (the shape nested under `stats`). */
function statsOf(stats: Map<string, SchoolStats>, orgId: string) {
	const { organizationId: _, ...rest } = stats.get(orgId) ?? {
		organizationId: orgId,
		userCount: 0,
		keyuserCount: 0,
		coachCount: 0,
		leerlingCount: 0,
		formTemplateCount: 0,
		courseCount: 0,
		plansWaiting: 0,
		lastActiveAt: null,
	};
	return rest;
}

// ---------------------------------------------------------------------------
// organizations / scholen
// ---------------------------------------------------------------------------

/**
 * List all organizations with admin-level aggregates (superadmin only).
 * Returns Ondivera + every school with per-school counts so the admin sees the
 * whole tenant tree at a glance (platform overview + Beheer → Scholen).
 */
const orgListAll = protectedProcedure
	.use(withPolicy(policies.manageTenant))
	.route({ method: "GET", path: "/admin/organizations", tags: ["admin"] })
	.output(z.array(OrganizationWithStatsSchema))
	.handler(async ({ context }) => {
		const orgs = await context.db
			.select(orgColumns)
			.from(organization)
			.orderBy(organization.kind, organization.name);
		const stats = await schoolStats(context.db);
		return orgs.map((o) => ({ ...o, stats: statsOf(stats, o.id) }));
	});

/** One organization with its stats, for the school page (superadmin only). */
const orgDetail = protectedProcedure
	.use(withPolicy(policies.manageTenant))
	.route({
		method: "GET",
		path: "/admin/organizations/{id}",
		tags: ["admin"],
	})
	.input(z.object({ id: z.string().uuid() }))
	.output(OrganizationWithStatsSchema)
	.handler(async ({ input, context }) => {
		const [o] = await context.db
			.select(orgColumns)
			.from(organization)
			.where(eq(organization.id, input.id));
		if (!o) throw new ORPCError("NOT_FOUND");
		const stats = await schoolStats(context.db, [o.id]);
		return { ...o, stats: statsOf(stats, o.id) };
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
		const stats = await schoolStats(context.db, [input.organizationId]);
		return {
			organizationId: input.organizationId,
			...statsOf(stats, input.organizationId),
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
			name: z.string().trim().min(1),
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
			name: z.string().trim().min(1).optional(),
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
		await assertNotArchived(context.db, id);

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

/**
 * Archive or restore a school (superadmin only). Archiving keeps every row but
 * locks the school out: its sessions are revoked here, new sessions are refused
 * in `auth.ts` and every API call is refused in `requireAuth`. Ondivera itself
 * cannot be archived.
 */
const orgSetArchived = protectedProcedure
	.use(withPolicy(policies.manageTenant))
	.route({
		method: "POST",
		path: "/admin/organizations/{id}/archived",
		tags: ["admin"],
	})
	.input(z.object({ id: z.string().uuid(), archived: z.boolean() }))
	.output(OrganizationSchema)
	.handler(async ({ input, context }) => {
		const [org] = await context.db
			.select({ kind: organization.kind })
			.from(organization)
			.where(eq(organization.id, input.id));
		if (!org) throw new ORPCError("NOT_FOUND");
		if (org.kind === "ondivera") {
			throw new ORPCError("BAD_REQUEST", {
				message: "Ondivera kan niet worden gearchiveerd.",
			});
		}

		const [row] = await context.db
			.update(organization)
			.set({
				archivedAt: input.archived ? new Date() : null,
				updatedAt: new Date(),
			})
			.where(eq(organization.id, input.id))
			.returning(orgColumns);
		if (!row) throw new ORPCError("NOT_FOUND");

		if (input.archived) {
			await context.db
				.delete(session)
				.where(
					inArray(
						session.userId,
						context.db
							.select({ id: user.id })
							.from(user)
							.where(eq(user.organizationId, input.id)),
					),
				);
		}
		return row;
	});

const organizationsRouter = base.router({
	listAll: orgListAll,
	detail: orgDetail,
	current: orgCurrent,
	stats: orgStats,
	createSchool: orgCreateSchool,
	update: orgUpdate,
	setArchived: orgSetArchived,
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
	/** INC-6: "invited" until the user has set a password via the invite link. */
	status: z.enum(["invited", "active"]),
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
				status: sql<"invited" | "active">`case when exists (
					select 1 from ${account}
					where ${account.userId} = ${user.id}
						and ${account.providerId} = 'credential'
						and ${account.password} is not null
				) then 'active' else 'invited' end`,
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
			// Templates only: a leerling's own copy is pupil data (sameSchool).
			.where(ne(course.kind, "student_execution"))
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
// settings — bewaartermijnen / retention (#4 privacy)
// ---------------------------------------------------------------------------

/**
 * Bewaartermijnen (decision 01-10-2026, docs/decisions/bewaartermijnen.md):
 * pupil data is kept without a time limit for now. Nothing is deleted
 * automatically except the audit log (AUDIT_RETENTION_DAYS, retention.ts).
 * Audio is never stored: it goes straight to transcription. Read-only — there
 * is nothing per school to configure until the policy changes.
 */
const RetentionPolicySchema = z.object({
	/** Days, or null for "onbeperkt". */
	coachplanDays: z.number().int().nullable(),
	chatDays: z.number().int().nullable(),
	transcriptDays: z.number().int().nullable(),
	/** Audio recordings are not stored at all. */
	recordingsStored: z.boolean(),
	auditLogDays: z.number().int(),
});

/** The retention policy (keyuser+). */
const settingsGet = protectedProcedure
	.use(withPolicy(policies.manageUsers, ownTenant))
	.route({
		method: "GET",
		path: "/admin/settings/retention",
		tags: ["admin"],
	})
	.output(RetentionPolicySchema)
	.handler(() => ({
		coachplanDays: null,
		chatDays: null,
		transcriptDays: null,
		recordingsStored: false,
		auditLogDays: env.AUDIT_RETENTION_DAYS,
	}));

const settingsRouter = base.router({
	getRetention: settingsGet,
});

// ---------------------------------------------------------------------------
// assignments — coach ↔ leerling koppelingen (FIX-PLAN phase 3, open finding)
// ---------------------------------------------------------------------------

const AssignmentPersonSchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string(),
});

const AssignmentsSchema = z.object({
	organizationId: z.string(),
	coaches: z.array(AssignmentPersonSchema),
	leerlingen: z.array(
		AssignmentPersonSchema.extend({ coachIds: z.array(z.string()) }),
	),
});

/**
 * The school whose koppelingen the actor manages: their own school for a
 * keyuser (any `organizationId` they pass must be it), the chosen school for
 * the superadmin. Throws when there is none or the actor may not manage it.
 */
function assignmentScope(
	actor: AuthedContext["actor"],
	organizationId: string | undefined,
): string {
	const orgId = organizationId ?? actor.organizationId;
	if (!orgId) {
		throw new ORPCError("BAD_REQUEST", { message: "Kies een school" });
	}
	if (!sameTenant(actor, { organizationId: orgId })) {
		throw new ORPCError("FORBIDDEN", {
			message: "Geen toegang tot de koppelingen van deze school",
		});
	}
	return orgId;
}

/** Coaches and leerlingen of one school, with who coaches whom. */
const assignmentsList = protectedProcedure
	.use(withPolicy(policies.manageUsers, ownTenant))
	.route({ method: "GET", path: "/admin/assignments", tags: ["admin"] })
	.input(z.object({ organizationId: z.string().uuid().optional() }).optional())
	.output(AssignmentsSchema)
	.handler(async ({ input, context }) => {
		const orgId = assignmentScope(context.actor, input?.organizationId);

		const people = await context.db
			.select({
				id: user.id,
				name: user.name,
				email: user.email,
				role: user.role,
			})
			.from(user)
			.where(
				and(
					eq(user.organizationId, orgId),
					inArray(user.role, ["coach", "leerling"]),
				),
			)
			.orderBy(user.name);

		const links = await context.db
			.select({
				coachId: coachAssignment.coachId,
				leerlingId: coachAssignment.leerlingId,
			})
			.from(coachAssignment)
			.where(eq(coachAssignment.organizationId, orgId));

		const coachIdsOf = new Map<string, string[]>();
		for (const l of links) {
			coachIdsOf.set(l.leerlingId, [...(coachIdsOf.get(l.leerlingId) ?? []), l.coachId]);
		}
		const person = (p: (typeof people)[number]) => ({
			id: p.id,
			name: p.name,
			email: p.email,
		});
		return {
			organizationId: orgId,
			// Only coaches coach; the keyuser manages (INC-16).
			coaches: people.filter((p) => coachesLeerlingen(p.role)).map(person),
			leerlingen: people
				.filter((p) => p.role === "leerling")
				.map((p) => ({ ...person(p), coachIds: coachIdsOf.get(p.id) ?? [] })),
		};
	});

/**
 * Link or unlink a coach and a leerling. Both must be in the same school, with
 * the roles coach and leerling, and the school may not be archived. Idempotent.
 */
const assignmentsSet = protectedProcedure
	.use(withPolicy(policies.manageUsers, ownTenant))
	.route({ method: "POST", path: "/admin/assignments", tags: ["admin"] })
	.input(
		z.object({
			coachId: z.string(),
			leerlingId: z.string(),
			assigned: z.boolean(),
		}),
	)
	.output(z.object({ assigned: z.boolean() }))
	.handler(async ({ input, context }) => {
		const rows = await context.db
			.select({
				id: user.id,
				role: user.role,
				organizationId: user.organizationId,
			})
			.from(user)
			.where(inArray(user.id, [input.coachId, input.leerlingId]));
		const coach = rows.find((r) => r.id === input.coachId);
		const leerling = rows.find((r) => r.id === input.leerlingId);
		if (!coach || !leerling) throw new ORPCError("NOT_FOUND");
		if (!coachesLeerlingen(coach.role) || leerling.role !== "leerling") {
			throw new ORPCError("BAD_REQUEST", {
				message: "Koppel een coach aan een leerling",
			});
		}
		if (!coach.organizationId || coach.organizationId !== leerling.organizationId) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Coach en leerling horen niet bij dezelfde school",
			});
		}
		const orgId = assignmentScope(context.actor, coach.organizationId);
		await assertNotArchived(context.db, orgId);
		// Vaste coach first, then a vervanger (INC-18).
		await toggleKoppeling(context.db, {
			organizationId: orgId,
			leerlingId: input.leerlingId,
			coachId: input.coachId,
			assigned: input.assigned,
		});
		return { assigned: input.assigned };
	});

const assignmentsRouter = base.router({
	list: assignmentsList,
	set: assignmentsSet,
});

// ---------------------------------------------------------------------------
// Domain router
// ---------------------------------------------------------------------------

export const adminRouter = base.router({
	organizations: organizationsRouter,
	users: usersRouter,
	assignments: assignmentsRouter,
	templates: templatesRouter,
	audit: auditRouter,
	settings: settingsRouter,
});
