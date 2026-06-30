import type { UserRole } from "@incluvo/permissions";
import { createFileRoute, Outlet, redirect } from "@tanstack/solid-router";
import { Show } from "solid-js";
import { AppShell } from "../components/shell/app-shell";
import { navForRole, roleLabel } from "../components/shell/nav";
import { authClient } from "../lib/auth/auth-client";
import { useMe } from "../lib/auth/use-me";

/**
 * Layout route that gates everything under it behind an authenticated session
 * and wraps it in the calm Incluvo AppShell. The session is checked client-side
 * (SPA mode); the server independently enforces auth on every oRPC procedure.
 *
 * The shell is **role-aware**: navigation + the user area are driven by
 * `account.me` (`useMe()`), so each role sees the right menu and their tenant.
 */
export const Route = createFileRoute("/_protected")({
	beforeLoad: async () => {
		// The SPA shell is prerendered with Bun at build time, where there is no
		// `window` and no backend to reach. Calling `getSession()` there hits an
		// empty baseURL (see auth-client) and throws "fetch() URL is invalid",
		// which gets baked into the shell so every protected route renders the
		// error boundary on first paint. Skip the probe during prerender; the real
		// gate runs client-side on load and the server enforces auth on every RPC.
		if (typeof window === "undefined") {
			return { user: undefined };
		}
		const { data } = await authClient.getSession();
		if (!data?.session) {
			throw redirect({ to: "/login" });
		}
		return { user: data.user };
	},
	component: ProtectedLayout,
});

function ProtectedLayout() {
	const ctx = Route.useRouteContext();
	const me = useMe();

	const sessionUser = () =>
		ctx().user as
			| { name?: string; email?: string; role?: string }
			| undefined;

	// Prefer the authoritative role from account.me; fall back to the session.
	const role = (): UserRole =>
		me.role() !== "member"
			? me.role()
			: ((sessionUser()?.role ?? "member") as UserRole);

	const user = () => {
		const s = sessionUser();
		const name = me.user()?.name || s?.name || s?.email || "Gebruiker";
		const email = me.user()?.email || s?.email;
		const tone = role() === "coach" ? "coach" : "leerling";
		return {
			name,
			subtitle: email,
			organization: me.organization()?.name,
			roleLabel: roleLabel(role()),
			tone,
		} as const;
	};

	// While account.me is still resolving and the session role is ambiguous
	// (the default "member"), avoid flashing the leerling layout to a coach by
	// showing a brief calm placeholder until the authoritative role arrives.
	const resolving = () =>
		me.isLoading() && (sessionUser()?.role ?? "member") === "member";

	return (
		<Show
			when={!resolving()}
			fallback={
				<div class="grid min-h-dvh place-items-center bg-bg text-muted">
					<p class="text-small">Bezig met laden…</p>
				</div>
			}
		>
			<AppShell user={user()} nav={navForRole(role())}>
				<Outlet />
			</AppShell>
		</Show>
	);
}
