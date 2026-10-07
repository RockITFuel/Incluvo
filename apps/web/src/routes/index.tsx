import type { UserRole } from "@incluvo/permissions";
import { roleHome } from "../lib/auth/role-home";
import { createFileRoute, useNavigate } from "@tanstack/solid-router";
import { onMount } from "solid-js";
import { getCachedSession } from "../lib/auth/session";

/**
 * Root route: Incluvo has no marketing page — the app starts at the login.
 * Signed-in visitors go straight to their role's home (coach+ → dashboard,
 * leerling → welkom); everyone else lands on /login. The brief brand splash
 * below is what gets prerendered and what flashes during the client check.
 */
export const Route = createFileRoute("/")({
	component: RootRedirect,
});

function RootRedirect() {
	const navigate = useNavigate();

	onMount(async () => {
		try {
			const data = await getCachedSession();
			if (data?.session) {
				const role = ((data.user as { role?: string } | undefined)?.role ??
					"leerling") as UserRole;
				navigate({ to: roleHome(role), replace: true });
				return;
			}
		} catch {
			// fall through to login
		}
		navigate({ to: "/login", replace: true });
	});

	return (
		<div class="grid min-h-screen place-items-center bg-bg">
			<div class="flex items-center gap-3" aria-label="Incluvo laden">
				<span class="relative grid size-10 place-items-center rounded-[11px] bg-primary font-head text-xl font-semibold text-primary-fg">
					i
					<span class="absolute -right-1 -bottom-1 size-3 rounded-full border-2 border-bg bg-accent" />
				</span>
				<span class="font-head text-h2 font-semibold tracking-tight text-ink">
					Incluvo
				</span>
			</div>
		</div>
	);
}
