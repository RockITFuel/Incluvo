import { membership, organization, user } from "@incluvo/drizzle/schema";
import {
	atLeast,
	can,
	INCLUVO_ROLES,
	type IncluvoRole,
	isSuperadmin,
	policies,
	sameTenant,
	type UserRole,
} from "@incluvo/permissions";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { base, ownTenant, protectedProcedure, withPolicy } from "../base";

/**
 * Account / organization / user-management domain (Epic 1: auth, rollen &
 * multi-tenant; admin omgeving #60). Everything here is tenant-scoped: a
 * keyuser/coach acts only within their own organization, the superadmin
 * (Ondivera) acts across tenants. Role-only gates use `withPolicy(...)`; once a
 * row is loaded, handlers re-check `sameTenant(actor, row)`.
 */

// ---------------------------------------------------------------------------
// Shared Zod shapes
// ---------------------------------------------------------------------------

const OrganizationSchema = z.object({
	id: z.string(),
	name: z.string(),
	kind: z.enum(["ondivera", "school"]),
	parentId: z.string().nullable(),
});

const RoleSchema = z.enum(INCLUVO_ROLES);

const UserRowSchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string(),
	role: z.string(),
	organizationId: z.string().nullable(),
});

/** Capabilities the UI can branch on without re-deriving policy logic. */
const CapabilitiesSchema = z.object({
	canManageTenant: z.boolean(),
	canReadUsers: z.boolean(),
	canManageUsers: z.boolean(),
	canManageCourses: z.boolean(),
	isSuperadmin: z.boolean(),
});

// ---------------------------------------------------------------------------
// me
// ---------------------------------------------------------------------------

const me = protectedProcedure
	.route({ method: "GET", path: "/account/me", tags: ["account"] })
	.output(
		z.object({
			user: z.object({
				id: z.string(),
				name: z.string(),
				email: z.string(),
				role: z.string(),
			}),
			role: z.string(),
			organization: OrganizationSchema.nullable(),
			capabilities: CapabilitiesSchema,
		}),
	)
	.handler(async ({ context }) => {
		const { actor } = context;

		const [row] = await context.db
			.select({
				id: user.id,
				name: user.name,
				email: user.email,
				role: user.role,
				organizationId: user.organizationId,
			})
			.from(user)
			.where(eq(user.id, actor.userId));
		if (!row) throw new ORPCError("NOT_FOUND");

		let org: z.infer<typeof OrganizationSchema> | null = null;
		if (row.organizationId) {
			const [o] = await context.db
				.select({
					id: organization.id,
					name: organization.name,
					kind: organization.kind,
					parentId: organization.parentId,
				})
				.from(organization)
				.where(eq(organization.id, row.organizationId));
			if (o) org = o;
		}

		return {
			user: {
				id: row.id,
				name: row.name,
				email: row.email,
				role: row.role,
			},
			role: row.role,
			organization: org,
			capabilities: {
				canManageTenant: can(actor, policies.manageTenant),
				canReadUsers: atLeast(actor.role, "coach"),
				canManageUsers: atLeast(actor.role, "keyuser"),
				canManageCourses: atLeast(actor.role, "ontwikkelaar"),
				isSuperadmin: isSuperadmin(actor.role),
			},
		};
	});

// ---------------------------------------------------------------------------
// organizations
// ---------------------------------------------------------------------------

/** The actor's own organization. */
const orgCurrent = protectedProcedure
	.route({ method: "GET", path: "/account/organizations/current", tags: ["account"] })
	.output(OrganizationSchema.nullable())
	.handler(async ({ context }) => {
		if (!context.actor.organizationId) return null;
		const [o] = await context.db
			.select({
				id: organization.id,
				name: organization.name,
				kind: organization.kind,
				parentId: organization.parentId,
			})
			.from(organization)
			.where(eq(organization.id, context.actor.organizationId));
		return o ?? null;
	});

/** List all organizations (superadmin only). */
const orgList = protectedProcedure
	.use(withPolicy(policies.manageTenant))
	.route({ method: "GET", path: "/account/organizations", tags: ["account"] })
	.output(z.array(OrganizationSchema))
	.handler(async ({ context }) => {
		return context.db
			.select({
				id: organization.id,
				name: organization.name,
				kind: organization.kind,
				parentId: organization.parentId,
			})
			.from(organization)
			.orderBy(organization.name);
	});

/** Create an organization (superadmin only). */
const orgCreate = protectedProcedure
	.use(withPolicy(policies.manageTenant))
	.route({ method: "POST", path: "/account/organizations", tags: ["account"] })
	.input(
		z.object({
			name: z.string().min(1),
			kind: z.enum(["ondivera", "school"]).default("school"),
			parentId: z.string().uuid().nullable().optional(),
		}),
	)
	.output(OrganizationSchema)
	.handler(async ({ input, context }) => {
		const [row] = await context.db
			.insert(organization)
			.values({
				name: input.name,
				kind: input.kind,
				parentId: input.parentId ?? null,
			})
			.returning({
				id: organization.id,
				name: organization.name,
				kind: organization.kind,
				parentId: organization.parentId,
			});
		if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");
		return row;
	});

/** Update an organization (superadmin only). */
const orgUpdate = protectedProcedure
	.use(withPolicy(policies.manageTenant))
	.route({ method: "PUT", path: "/account/organizations/{id}", tags: ["account"] })
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
		const { id, ...patch } = input;
		const [row] = await context.db
			.update(organization)
			.set({ ...patch, updatedAt: new Date() })
			.where(eq(organization.id, id))
			.returning({
				id: organization.id,
				name: organization.name,
				kind: organization.kind,
				parentId: organization.parentId,
			});
		if (!row) throw new ORPCError("NOT_FOUND");
		return row;
	});

const organizationsRouter = base.router({
	current: orgCurrent,
	list: orgList,
	create: orgCreate,
	update: orgUpdate,
});

// ---------------------------------------------------------------------------
// users (tenant-scoped management)
// ---------------------------------------------------------------------------

/**
 * Guard a role-change/management action against a target user that has already
 * been loaded: tenant scoping + a sane role transition. A keyuser may not
 * promote anyone to superadmin (only the superadmin owns the Ondivera tier);
 * the superadmin may set any role anywhere.
 */
function assertCanManage(
	actor: { userId: string; role: UserRole; organizationId?: string | null },
	target: { organizationId?: string | null },
): void {
	if (!can(actor, policies.manageUsers, target)) {
		throw new ORPCError("FORBIDDEN", {
			message: "Not allowed to manage users in this tenant",
		});
	}
}

/** Roles a given actor may assign. Superadmin: all. Keyuser: everything below. */
function assignableRoles(actorRole: UserRole): IncluvoRole[] {
	if (isSuperadmin(actorRole)) return [...INCLUVO_ROLES];
	// keyuser and below: may not grant superadmin.
	return INCLUVO_ROLES.filter((r) => r !== "superadmin");
}

/** List users within the actor's tenant (coach+ via readUsers). */
const usersList = protectedProcedure
	.use(withPolicy(policies.readUsers, ownTenant))
	.route({ method: "GET", path: "/account/users", tags: ["account"] })
	.output(z.array(UserRowSchema))
	.handler(async ({ context }) => {
		const { actor } = context;
		// Superadmin sees everyone; everyone else only their tenant.
		const rows = await context.db
			.select({
				id: user.id,
				name: user.name,
				email: user.email,
				role: user.role,
				organizationId: user.organizationId,
			})
			.from(user)
			.where(
				isSuperadmin(actor.role)
					? undefined
					: eq(user.organizationId, actor.organizationId ?? ""),
			)
			.orderBy(user.name);
		// Defence in depth: never leak cross-tenant rows.
		return rows.filter((r) => sameTenant(actor, r));
	});

/** Change a user's role (keyuser+ via manageUsers, tenant-scoped). */
const usersSetRole = protectedProcedure
	.use(withPolicy(policies.manageUsers, ownTenant))
	.route({ method: "POST", path: "/account/users/set-role", tags: ["account"] })
	.input(
		z.object({
			userId: z.string(),
			role: RoleSchema,
		}),
	)
	.output(UserRowSchema)
	.handler(async ({ input, context }) => {
		const { actor } = context;

		const [target] = await context.db
			.select({
				id: user.id,
				name: user.name,
				email: user.email,
				role: user.role,
				organizationId: user.organizationId,
			})
			.from(user)
			.where(eq(user.id, input.userId));
		if (!target) throw new ORPCError("NOT_FOUND");

		// Tenant scope + role-transition validation.
		assertCanManage(actor, target);
		if (!assignableRoles(actor.role).includes(input.role)) {
			throw new ORPCError("FORBIDDEN", {
				message: `Not allowed to assign role "${input.role}"`,
			});
		}

		const [row] = await context.db
			.update(user)
			.set({ role: input.role, updatedAt: new Date() })
			.where(eq(user.id, input.userId))
			.returning({
				id: user.id,
				name: user.name,
				email: user.email,
				role: user.role,
				organizationId: user.organizationId,
			});
		if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");

		// Keep the explicit membership row in sync with the denormalised role.
		if (row.organizationId) {
			await context.db
				.update(membership)
				.set({ role: input.role, updatedAt: new Date() })
				.where(
					and(
						eq(membership.userId, row.id),
						eq(membership.organizationId, row.organizationId),
					),
				);
		}

		return row;
	});

/**
 * Invite / create a user inside a tenant (keyuser+ via manageUsers). A keyuser
 * may only create in their own org; superadmin may target any org. This records
 * the intended user + role + tenant via a `membership` row and (for an existing
 * account) flips their tenant/role. Actual credential provisioning (better-auth
 * signup / magic link, QUESTIONS 3.4) is wired by the auth flow / seed; here we
 * keep it idempotent on email.
 */
const usersInvite = protectedProcedure
	.use(withPolicy(policies.manageUsers, ownTenant))
	.route({ method: "POST", path: "/account/users/invite", tags: ["account"] })
	.input(
		z.object({
			email: z.string().email(),
			role: RoleSchema.default("leerling"),
			organizationId: z.string().uuid().optional(),
		}),
	)
	.output(
		z.object({
			email: z.string(),
			role: RoleSchema,
			organizationId: z.string(),
			existingUserId: z.string().nullable(),
		}),
	)
	.handler(async ({ input, context }) => {
		const { actor } = context;

		// Target tenant: default to the actor's own org.
		const organizationId = input.organizationId ?? actor.organizationId;
		if (!organizationId) {
			throw new ORPCError("BAD_REQUEST", {
				message: "No target organization",
			});
		}

		// Tenant scope + role-transition validation.
		assertCanManage(actor, { organizationId });
		if (!assignableRoles(actor.role).includes(input.role)) {
			throw new ORPCError("FORBIDDEN", {
				message: `Not allowed to assign role "${input.role}"`,
			});
		}

		// If the account already exists, attach it to the tenant + role.
		const [existing] = await context.db
			.select({ id: user.id, organizationId: user.organizationId })
			.from(user)
			.where(eq(user.email, input.email));

		if (existing) {
			// Re-check tenant against the existing row (can't steal another tenant's user).
			if (
				existing.organizationId &&
				!sameTenant(actor, { organizationId: existing.organizationId })
			) {
				throw new ORPCError("FORBIDDEN", {
					message: "User belongs to another tenant",
				});
			}
			await context.db
				.update(user)
				.set({ role: input.role, organizationId, updatedAt: new Date() })
				.where(eq(user.id, existing.id));
		}

		// Upsert an explicit membership row (idempotent on user/org).
		if (existing) {
			const [m] = await context.db
				.select({ id: membership.id })
				.from(membership)
				.where(
					and(
						eq(membership.userId, existing.id),
						eq(membership.organizationId, organizationId),
					),
				);
			if (m) {
				await context.db
					.update(membership)
					.set({ role: input.role, updatedAt: new Date() })
					.where(eq(membership.id, m.id));
			} else {
				await context.db
					.insert(membership)
					.values({ userId: existing.id, organizationId, role: input.role });
			}
		}

		return {
			email: input.email,
			role: input.role,
			organizationId,
			existingUserId: existing?.id ?? null,
		};
	});

const usersRouter = base.router({
	listInTenant: usersList,
	setRole: usersSetRole,
	invite: usersInvite,
});

// ---------------------------------------------------------------------------
// Domain router
// ---------------------------------------------------------------------------

export const accountRouter = base.router({
	me,
	organizations: organizationsRouter,
	users: usersRouter,
});
