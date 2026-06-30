import type { UserRole } from "@incluvo/permissions";
import {
	createFileRoute,
	Outlet,
	redirect,
	useNavigate,
} from "@tanstack/solid-router";
import { createEffect, createSignal, onMount, Show } from "solid-js";
import { AppShell } from "../components/shell/app-shell";
import { navForRole, roleLabel } from "../components/shell/nav";
import { getCachedSession } from "../lib/auth/session";
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
		const data = await getCachedSession();
		if (!data?.session) {
			throw redirect({ to: "/login" });
		}
		return { user: data.user };
	},
	component: ProtectedLayout,
});

function ProtectedLayout() {
	// A route `beforeLoad` is baked at SPA-prerender time and is NOT re-run on
	// hydration, so on a full page load the protected tree mounts with no
	// session context. Render the shell only after `onMount` (client-side, once
	// hydration has settled) — this also means the child routes' queries fire
	// post-hydration instead of during solid-query's "restoring" phase, where
	// they hang forever (the cause of the "Bezig met laden…" wedge). Mirrors
	// clp's _protected layout.
	const [mounted, setMounted] = createSignal(false);
	onMount(() => setMounted(true));

	return (
		<Show
			when={mounted()}
			fallback={
				<div class="grid min-h-dvh place-items-center bg-bg text-muted">
					<p class="text-small">Bezig met laden…</p>
				</div>
			}
		>
			<AuthedShell />
		</Show>
	);
}

/**
 * Rendered only client-side (after `onMount`). Resolves the role + tenant from
 * `account.me` (oRPC) and redirects to /login if there is no valid session.
 * The server independently enforces auth on every procedure.
 */
function AuthedShell() {
	const me = useMe();
	const navigate = useNavigate();

	// `account.me` 401s when there is no valid session → bounce to /login. This
	// is the client-side gate for full page loads (where beforeLoad was baked at
	// prerender and could not run).
	createEffect(() => {
		if (!me.query.isLoading && me.query.isError) {
			navigate({ to: "/login" });
		}
	});

	const role = (): UserRole => me.role();

	const user = () => {
		const tone = role() === "coach" ? "coach" : "leerling";
		return {
			name: me.user()?.name ?? "Gebruiker",
			subtitle: me.user()?.email,
			organization: me.organization()?.name,
			roleLabel: roleLabel(role()),
			tone,
		} as const;
	};

	return (
		<AppShell user={user()} nav={navForRole(role())}>
			<Outlet />
		</AppShell>
	);
}
