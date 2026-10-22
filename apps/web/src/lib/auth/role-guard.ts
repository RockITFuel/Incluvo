import { atLeast, coachesLeerlingen, type UserRole } from "@incluvo/permissions";
import { redirect } from "@tanstack/solid-router";
import type { Me } from "./me";
import { roleHome } from "./role-home";

export interface RoleRule {
	min: UserRole;
	/** Only the role that works with leerlingen (the coach). */
	coaching?: boolean;
	/** Only these roles (on top of `min`). */
	only?: UserRole[];
}

export function allows(role: UserRole, rule: RoleRule): boolean {
	return (
		atLeast(role, rule.min) &&
		(!rule.coaching || coachesLeerlingen(role)) &&
		(!rule.only || rule.only.includes(role))
	);
}

/**
 * Route `beforeLoad` gate: sends a role that may not see the page to its own
 * start page. The server enforces the same rules on every procedure.
 *
 *   beforeLoad: ({ context }) => requireRole(context.me, { min: "coach", coaching: true }),
 */
export function requireRole(me: Me, rule: RoleRule): void {
	const role = me.role as UserRole;
	if (!allows(role, rule)) throw redirect({ to: roleHome(role), replace: true });
}
