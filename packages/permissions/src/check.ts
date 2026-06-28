import type { Policy, PolicySubject } from "./policy";
import { ROLES, type UserRole } from "./role-types";

/** True when `role` is at least as privileged as `min` in the ROLES ordering. */
export function atLeast(role: UserRole, min: UserRole): boolean {
	return ROLES.indexOf(role) >= ROLES.indexOf(min);
}

/** Platform owner (Ondivera). Treated as cross-tenant superuser. */
export function isSuperadmin(role: UserRole): boolean {
	return role === "superadmin" || role === "admin";
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
