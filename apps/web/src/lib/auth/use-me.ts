import { atLeast, canBuildCourses, type UserRole } from "@incluvo/permissions";
import { useQuery } from "@tanstack/solid-query";
import { orpc } from "../orpc";

/**
 * Identity resource for the authed app. Wraps the `account.me` RPC in a
 * TanStack Query and exposes the current `user`, `role`, `organization`, the
 * server-computed `capabilities`, plus role-comparison helpers.
 *
 *   const me = useMe();
 *   me.role();                 // "coach"
 *   me.is("coach");            // true
 *   me.hasAtLeast("keyuser");  // false
 *   me.organization()?.name;   // "Demo School"
 *
 * While `account.me` loads, `role()` is null and every role check is false.
 *
 * The query is cached app-wide by oRPC's query key, so calling `useMe()` in
 * several components reuses the same fetch.
 */
export function useMe() {
	const query = useQuery(() => ({
		...orpc.account.me.queryOptions(),
		staleTime: 60_000,
	}));

	const role = (): UserRole | null => (query.data?.role as UserRole | undefined) ?? null;

	return {
		query,
		isLoading: () => query.isLoading,
		user: () => query.data?.user,
		role,
		organization: () => query.data?.organization ?? null,
		capabilities: () => query.data?.capabilities,
		/** True when the current role is at least `min` in the role hierarchy. */
		hasAtLeast: (min: UserRole) => {
			const r = role();
			return r !== null && atLeast(r, min);
		},
		/** True when the current role equals `target` exactly. */
		is: (target: UserRole) => role() === target,
		/** May build course templates (ontwikkelaar, keyuser, superadmin). */
		canBuildCourses: () => {
			const r = role();
			return r !== null && canBuildCourses(r);
		},
	};
}
