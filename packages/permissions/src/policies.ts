import { atLeast, isSuperadmin, sameTenant, type TenantScoped } from "./check";
import { definePolicy } from "./policy";

/**
 * RBAC policies for Incluvo. Roles (least→most privileged):
 *   leerling < ontwikkelaar < coach < keyuser < superadmin
 * Legacy "member" (lowest) and "admin" (highest) aliases stay valid.
 *
 * Tenant scoping: resource-scoped policies use `sameTenant(actor, resource)` so
 * a keyuser/coach/leerling can only act within their own organization, while
 * the superadmin (Ondivera) may act across tenants. Role-only gates (no
 * resource) are enforced by the `withPolicy` middleware; resource-scoped checks
 * are re-run inside handlers once the row is loaded.
 */

interface OwnedResource {
	ownerId?: string | null;
}

interface OwnedByLeerling extends TenantScoped {
	leerlingId?: string | null;
}

// ---------------------------------------------------------------------------
// Legacy sample `item` policies — kept so the existing vertical slice compiles.
// ---------------------------------------------------------------------------

/** Anyone authenticated may read items. */
export const readItems = definePolicy({
	name: "items:read",
	subject: "item",
	action: "read",
	evaluate: () => true,
});

/** Coaches and admins may create items. */
export const createItems = definePolicy({
	name: "items:create",
	subject: "item",
	action: "create",
	evaluate: (actor) => atLeast(actor.role, "coach"),
});

/** The owner, or any admin, may update an item. */
export const updateItem = definePolicy<OwnedResource>({
	name: "items:update",
	subject: "item",
	action: "update",
	evaluate: (actor, resource) =>
		isSuperadmin(actor.role) || resource?.ownerId === actor.userId,
});

/** Only admins may delete items. */
export const deleteItem = definePolicy({
	name: "items:delete",
	subject: "item",
	action: "delete",
	evaluate: (actor) => isSuperadmin(actor.role),
});

// ---------------------------------------------------------------------------
// Tenant & users (admin omgeving #60, multi-tenant)
// ---------------------------------------------------------------------------

/** Only the superadmin (Ondivera) may manage tenants/organizations. */
export const manageTenant = definePolicy<TenantScoped>({
	name: "tenant:manage",
	subject: "tenant",
	action: "update",
	evaluate: (actor) => isSuperadmin(actor.role),
});

/** Keyuser may read users within their tenant; superadmin anywhere. */
export const readUsers = definePolicy<TenantScoped>({
	name: "user:read",
	subject: "user",
	action: "read",
	evaluate: (actor, resource) =>
		atLeast(actor.role, "coach") && sameTenant(actor, resource),
});

/** Keyuser manages users within their tenant; superadmin anywhere. */
export const manageUsers = definePolicy<TenantScoped>({
	name: "user:manage",
	subject: "user",
	action: "update",
	evaluate: (actor, resource) =>
		atLeast(actor.role, "keyuser") && sameTenant(actor, resource),
});

// ---------------------------------------------------------------------------
// Coachplan / formulieren (#8–#21)
// ---------------------------------------------------------------------------

/**
 * Manage form templates (#8/#9). Superadmin manages Ondivera templates;
 * keyuser manages their school's templates.
 */
export const manageForms = definePolicy<TenantScoped>({
	name: "form:manage",
	subject: "form",
	action: "update",
	evaluate: (actor, resource) =>
		atLeast(actor.role, "keyuser") && sameTenant(actor, resource),
});

/** Read a form template within the tenant (coach builds/inspects). */
export const readForm = definePolicy<TenantScoped>({
	name: "form:read",
	subject: "form",
	action: "read",
	evaluate: (actor, resource) =>
		atLeast(actor.role, "coach") && sameTenant(actor, resource),
});

/** A leerling fills in their own coachplan (#11). */
export const fillCoachplan = definePolicy<OwnedByLeerling>({
	name: "coachplan:fill",
	subject: "coachplan",
	action: "update",
	evaluate: (actor, resource) =>
		sameTenant(actor, resource) && resource?.leerlingId === actor.userId,
});

/**
 * View a coachplan submission (#15). The owning leerling, their coach (or
 * higher) within the tenant, may read.
 */
export const readCoachplan = definePolicy<OwnedByLeerling>({
	name: "coachplan:read",
	subject: "coachplan",
	action: "read",
	evaluate: (actor, resource) =>
		sameTenant(actor, resource) &&
		(resource?.leerlingId === actor.userId || atLeast(actor.role, "coach")),
});

/** Coach fills in the coach-gedeelte / mapping (#16/#17). */
export const reviewCoachplan = definePolicy<OwnedByLeerling>({
	name: "coachplan:review",
	subject: "coachplan",
	action: "update",
	evaluate: (actor, resource) =>
		atLeast(actor.role, "coach") && sameTenant(actor, resource),
});

// ---------------------------------------------------------------------------
// Online cursus (#23–#36, #61)
// ---------------------------------------------------------------------------

/** Build/manage courses, sections, content blocks (#25–#36): ontwikkelaar+. */
export const manageCourse = definePolicy<TenantScoped>({
	name: "course:manage",
	subject: "course",
	action: "update",
	evaluate: (actor, resource) =>
		atLeast(actor.role, "ontwikkelaar") && sameTenant(actor, resource),
});

/** Read course content within the tenant (#23/#24/#35). */
export const readCourse = definePolicy<TenantScoped>({
	name: "course:read",
	subject: "course",
	action: "read",
	evaluate: (actor, resource) => sameTenant(actor, resource),
});

/** Grade an assignment submission (#28): coach+. */
export const gradeAssignment = definePolicy<TenantScoped>({
	name: "assignment:grade",
	subject: "assignment",
	action: "update",
	evaluate: (actor, resource) =>
		atLeast(actor.role, "coach") && sameTenant(actor, resource),
});

/** A leerling submits their own assignment (#27); coach may submit on behalf. */
export const submitAssignment = definePolicy<OwnedByLeerling>({
	name: "assignment:submit",
	subject: "assignment",
	action: "create",
	evaluate: (actor, resource) =>
		sameTenant(actor, resource) &&
		(resource?.leerlingId === actor.userId || atLeast(actor.role, "coach")),
});

// ---------------------------------------------------------------------------
// Takenlijst (#37–#41)
// ---------------------------------------------------------------------------

/** Read a leerling's task list: the leerling themselves, or their coach. */
export const readTask = definePolicy<OwnedByLeerling>({
	name: "task:read",
	subject: "task",
	action: "read",
	evaluate: (actor, resource) =>
		sameTenant(actor, resource) &&
		(resource?.leerlingId === actor.userId || atLeast(actor.role, "coach")),
});

/** Create/manage a task (#41): leerling for their own list, or coach. */
export const manageTask = definePolicy<OwnedByLeerling>({
	name: "task:manage",
	subject: "task",
	action: "update",
	evaluate: (actor, resource) =>
		sameTenant(actor, resource) &&
		(resource?.leerlingId === actor.userId || atLeast(actor.role, "coach")),
});

// ---------------------------------------------------------------------------
// Chat (#5–#7)
// ---------------------------------------------------------------------------

interface ChatResource extends TenantScoped {
	/** User ids that are members of the conversation. */
	memberIds?: string[];
}

/**
 * Participate in a chat. A member may read/post; a coach may always read along
 * in group chats they supervise (#6). Tenant-scoped.
 */
export const accessChat = definePolicy<ChatResource>({
	name: "chat:access",
	subject: "chat",
	action: "read",
	evaluate: (actor, resource) =>
		sameTenant(actor, resource) &&
		(resource?.memberIds?.includes(actor.userId) === true ||
			atLeast(actor.role, "coach")),
});

// ---------------------------------------------------------------------------
// Notifications (#3)
// ---------------------------------------------------------------------------

interface NotificationResource extends TenantScoped {
	userId?: string | null;
}

/** A user may read/update (mark read) only their own notifications. */
export const accessNotification = definePolicy<NotificationResource>({
	name: "notification:access",
	subject: "notification",
	action: "read",
	evaluate: (actor, resource) =>
		sameTenant(actor, resource) && resource?.userId === actor.userId,
});

// ---------------------------------------------------------------------------
// Audit (#60 admin inzage)
// ---------------------------------------------------------------------------

/** Only admins/superadmins may read the audit log. */
export const readAudit = definePolicy({
	name: "audit:read",
	subject: "audit",
	action: "read",
	evaluate: (actor) => isSuperadmin(actor.role),
});
