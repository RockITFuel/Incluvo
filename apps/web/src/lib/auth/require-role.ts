import { atLeast, type UserRole } from "@incluvo/permissions";
import { redirect } from "@tanstack/solid-router";
import { authClient } from "./auth-client";

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
	to: string = "/",
): Promise<{ role: UserRole }> {
	const { data } = await authClient.getSession();
	const role = ((data?.user as { role?: string } | undefined)?.role ??
		"member") as UserRole;

	if (!data?.session) {
		throw redirect({ to: "/login" });
	}
	if (!atLeast(role, minRole)) {
		throw redirect({ to });
	}
	return { role };
}
