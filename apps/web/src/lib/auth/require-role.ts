import { atLeast, coachesLeerlingen, type UserRole } from "@incluvo/permissions";
import { redirect } from "@tanstack/solid-router";
import { roleHome } from "./role-home";
import { getCachedSession } from "./session";

/**
 * Route guard for `beforeLoad`. Ensures the signed-in user's session role is at
 * least `minRole`; otherwise redirects to `to` (default `/`). Use under the
 * `_protected` layout so a session already exists — this only checks the role.
 *
 *   export const Route = createFileRoute("/_protected/beheer/")({
 *     beforeLoad: () => requireRole("keyuser"),
 *     ...
 *   });
 *
 * The server independently enforces RBAC on every procedure; this is a UX gate
 * so insufficient roles never see the admin chrome.
 */
export async function requireRole(
	minRole: UserRole,
	to?: string,
	options: { coaching?: boolean; only?: UserRole[] } = {},
): Promise<{ role: UserRole }> {
	// Skip the session probe during the Bun SPA-shell prerender (no `window`,
	// empty auth baseURL → "fetch() URL is invalid", which would bake an error
	// into the shell). The real check runs client-side; the server re-enforces.
	if (typeof window === "undefined") {
		return { role: minRole };
	}
	const data = await getCachedSession();
	const role = ((data?.user as { role?: string } | undefined)?.role ??
		"leerling") as UserRole;

	if (!data?.session) {
		throw redirect({ to: "/login" });
	}
	if (
		!atLeast(role, minRole) ||
		(options.coaching && !coachesLeerlingen(role)) ||
		(options.only && !options.only.includes(role))
	) {
		// Default: the role's own home, so nobody bounces through "/".
		throw redirect({ to: to ?? roleHome(role) });
	}
	return { role };
}
