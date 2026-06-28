import type {
	PermissionAction,
	PermissionSubject,
	UserRole,
} from "./role-types";

export interface PolicySubject {
	role: UserRole;
	userId: string;
	/**
	 * Tenant (organization) the actor belongs to. Optional so existing callers
	 * that build `{ userId, role }` keep compiling; tenant-scoped policies fall
	 * back to denying cross-tenant access when this is absent (see `sameTenant`).
	 */
	organizationId?: string | null;
}

/**
 * A policy answers a single question: may this subject perform `action` on
 * `subject`, optionally against a concrete resource? Returning `true` grants.
 */
export interface Policy<Resource = unknown> {
	name: string;
	subject: PermissionSubject;
	action: PermissionAction;
	evaluate: (actor: PolicySubject, resource?: Resource) => boolean;
}

export function definePolicy<Resource = unknown>(
	policy: Policy<Resource>,
): Policy<Resource> {
	return policy;
}
