import type { Policy, PolicySubject } from "./policy";
import { ROLES, type UserRole } from "./role-types";

/** True when `role` is at least as privileged as `min` in the ROLES ordering. */
export function atLeast(role: UserRole, min: UserRole): boolean {
	return ROLES.indexOf(role) >= ROLES.indexOf(min);
}

/** Platform owner (Ondivera). Treated as cross-tenant superuser. */
export function isSuperadmin(role: UserRole): boolean {
	return role === "superadmin";
}

/**
 * Who builds course templates (#25–#36): the ontwikkelaar, a keyuser for their
 * school, and Ondivera. A capability rather than a rank, so a coach doesn't
 * get the builder just by being above the ontwikkelaar in `ROLES`.
 */
export function canBuildCourses(role: UserRole): boolean {
	return role === "ontwikkelaar" || role === "keyuser" || role === "superadmin";
}

/**
 * Who works with leerlingen (plans, taken, chat, AI-advies): the coach. Not
 * the keyuser — they manage the school's leerlingen, coaches and koppelingen
 * (INC-16, replacing D1) — and not the superadmin, who manages the platform
 * (see `sameSchool`).
 */
export function coachesLeerlingen(role: UserRole): boolean {
	return role === "coach";
}

/** A resource that is scoped to a tenant (organization). */
export interface TenantScoped {
	organizationId?: string | null;
}

/**
 * Tenant-scoping guard: the actor may only touch resources within their own
 * tenant. The superadmin (Ondivera) is exempt and may act across tenants.
 *
 * Returns `false` (deny) when either side lacks a tenant, so an actor without an
 * `organizationId` can never reach another tenant's data by accident.
 */
export function sameTenant(
	actor: PolicySubject,
	resource?: TenantScoped | null,
): boolean {
	if (isSuperadmin(actor.role)) return true;
	if (!resource) return false;
	if (!actor.organizationId || !resource.organizationId) return false;
	return actor.organizationId === resource.organizationId;
}

/**
 * Like `sameTenant`, but without the superadmin exemption. For pupil content
 * (plans, taken, opdrachten, a leerling's own course): Ondivera manages the
 * platform and the templates, it doesn't coach leerlingen, so it has no
 * business reading their data (AVG data minimisation; Ondivera is the
 * processor, the school the controller).
 */
export function sameSchool(
	actor: PolicySubject,
	resource?: TenantScoped | null,
): boolean {
	return !isSuperadmin(actor.role) && sameTenant(actor, resource);
}

/** Evaluate a single policy for an actor against an optional resource. */
export function checkPermission<Resource>(
	policy: Policy<Resource>,
	actor: PolicySubject,
	resource?: Resource,
): boolean {
	return policy.evaluate(actor, resource);
}

/** Convenience boolean check used by UI guards. */
export function can<Resource>(
	actor: PolicySubject,
	policy: Policy<Resource>,
	resource?: Resource,
): boolean {
	return checkPermission(policy, actor, resource);
}
