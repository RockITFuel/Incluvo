import type { UserRole } from "@incluvo/permissions";
import { createFileRoute, redirect } from "@tanstack/solid-router";
import { loadMe } from "../lib/auth/me";
import { roleHome } from "../lib/auth/role-home";

/**
 * Root route: Incluvo has no marketing page. Signed-in visitors go to their
 * role's start page, everyone else to /login.
 */
export const Route = createFileRoute("/")({
	beforeLoad: async () => {
		const me = await loadMe().catch(() => null);
		throw redirect({ to: me ? roleHome(me.role as UserRole) : "/login", replace: true });
	},
});
