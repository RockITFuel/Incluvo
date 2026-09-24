import { organization, user } from "@incluvo/drizzle/schema";
import {
	atLeast,
	canBuildCourses,
	can,
	INCLUVO_ROLES,
	type IncluvoRole,
	isSuperadmin,
	policies,
	sameTenant,
	type UserRole,
} from "@incluvo/permissions";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createAccount, hasPassword, sendInvite } from "../../users";
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
				canManageCourses: canBuildCourses(actor.role),
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
		return row;
	});

/**
 * Invite a user into a tenant (keyuser+ via manageUsers). A keyuser may only
 * invite into their own org; superadmin may target any org.
 *
 * - New e-mail: creates the account (no password) and mails a set-password
 *   link. This is the only way accounts are created; public sign-up is off.
 * - Existing account in the same tenant: updates the role, and re-sends the
 *   link while they haven't set a password yet (so "invite again" = resend).
 * - Existing account without a tenant, or in another tenant: refused. Such an
 *   account was not created by an invite, and attaching it would hand the
 *   invited role to whoever registered that address.
 */
const usersInvite = protectedProcedure
	.use(withPolicy(policies.manageUsers, ownTenant))
	.route({ method: "POST", path: "/account/users/invite", tags: ["account"] })
	.input(
		z.object({
			email: z.string().email(),
			name: z.string().trim().min(1).max(200).optional(),
			role: RoleSchema.default("leerling"),
			organizationId: z.string().uuid().optional(),
		}),
	)
	.output(
		z.object({
			email: z.string(),
			role: RoleSchema,
			organizationId: z.string(),
			userId: z.string(),
			created: z.boolean(),
			/** False when the set-password mail could not be sent (SMTP down). */
			mailSent: z.boolean(),
		}),
	)
	.handler(async ({ input, context }) => {
		const { actor } = context;
		const email = input.email.toLowerCase();

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

		const [existing] = await context.db
			.select({
				id: user.id,
				name: user.name,
				organizationId: user.organizationId,
			})
			.from(user)
			.where(eq(user.email, email));

		if (existing && existing.organizationId !== organizationId) {
			throw new ORPCError(existing.organizationId ? "FORBIDDEN" : "CONFLICT", {
				message: existing.organizationId
					? "Deze gebruiker hoort bij een andere organisatie"
					: "Er bestaat al een account met dit e-mailadres dat niet via een uitnodiging is aangemaakt. Neem contact op met Ondivera.",
			});
		}

		let userId: string;
		let name: string;
		if (existing) {
			userId = existing.id;
			name = existing.name;
		} else {
			name = input.name ?? email.split("@")[0]!;
			userId = await createAccount({
				email,
				name,
				role: input.role,
				organizationId,
			});
		}

		await context.db
			.update(user)
			.set({ role: input.role, updatedAt: new Date() })
			.where(eq(user.id, userId));

		let mailSent = true;
		if (!existing || !(await hasPassword(userId))) {
			try {
				await sendInvite({ id: userId, email, name });
			} catch (error) {
				console.error("[invite] set-password mail failed", error);
				mailSent = false;
			}
		}

		return {
			email,
			role: input.role,
			organizationId,
			userId,
			created: !existing,
			mailSent,
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
