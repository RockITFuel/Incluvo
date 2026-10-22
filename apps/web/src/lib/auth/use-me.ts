import { atLeast, canBuildCourses, type UserRole } from "@incluvo/permissions";
import { useRouteContext } from "@tanstack/solid-router";

/**
 * The signed-in identity, read from the `/_protected` route context that its
 * `beforeLoad` filled (lib/auth/me.ts). Every protected page has it before it
 * renders, so `role()` is never "still loading".
 *
 *   const me = useMe();
 *   me.role();                 // "coach"
 *   me.is("coach");            // true
 *   me.hasAtLeast("keyuser");  // false
 */
export function useMe() {
	const context = useRouteContext({ from: "/_protected" });
	const data = () => context().me;
	const role = (): UserRole => data().role as UserRole;

	return {
		data,
		user: () => data().user,
		role,
		roles: () => data().roles as UserRole[],
		organization: () => data().organization ?? null,
		capabilities: () => data().capabilities,
		/** True when the current role is at least `min` in the role hierarchy. */
		hasAtLeast: (min: UserRole) => atLeast(role(), min),
		/** True when the current role equals `target` exactly. */
		is: (target: UserRole) => role() === target,
		/** May build course templates (ontwikkelaar, keyuser, superadmin). */
		canBuildCourses: () => canBuildCourses(role()),
	};
}
