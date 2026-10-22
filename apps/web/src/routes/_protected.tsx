import { coachesLeerlingen, type UserRole } from "@incluvo/permissions";
import { createFileRoute, Outlet, redirect, useRouter } from "@tanstack/solid-router";
import { AppShell } from "../components/shell/app-shell";
import { navForRole, roleLabel } from "../components/shell/nav";
import { toast } from "../components/ui/toast";
import { clearMe, loadMe } from "../lib/auth/me";
import { roleHome } from "../lib/auth/role-home";
import { friendlyError } from "../lib/errors";
import { client } from "../lib/orpc";
import { loadRouteData } from "../lib/route-data";

/**
 * Layout route for everything behind a login, wrapped in the AppShell.
 *
 * `beforeLoad` resolves the identity (`account.me`, cached in lib/auth/me.ts)
 * and puts it in the route context, so every protected page knows the role
 * before it renders (`useMe()`, `requireRole`). The loader fetches what the
 * shell itself shows: the menu badges and the recent notifications. The
 * server enforces auth on every procedure regardless.
 */
export const Route = createFileRoute("/_protected")({
	beforeLoad: async () => {
		const me = await loadMe();
		if (!me) throw redirect({ to: "/login" });
		return { me };
	},
	loader: async ({ context, abortController }) => {
		const signal = abortController.signal;
		const role = context.me.role as UserRole;
		const [taken, inbox, notifications] = await Promise.all([
			// A leerling's open taken voor vandaag, a coach's ingeleverde coachplannen.
			role === "leerling"
				? loadRouteData(signal, (s) => client.tasks.list({}, { signal: s }))
				: null,
			coachesLeerlingen(role)
				? loadRouteData(signal, (s) => client.coachplan.inbox(undefined, { signal: s }))
				: null,
			loadRouteData(signal, (s) =>
				client.notifications.list({ limit: 8, offset: 0 }, { signal: s }),
			),
		]);
		return {
			badges: {
				taken: taken?.access === "granted" ? taken.value.vandaag.length : 0,
				// Plans waiting for the coach, not the ones already shared.
				coachplannen:
					inbox?.access === "granted"
						? inbox.value.filter(
								(r) =>
									r.submission.status === "submitted" ||
									r.submission.status === "coach_review",
							).length
						: 0,
			},
			notifications,
		};
	},
	component: ProtectedLayout,
});

function ProtectedLayout() {
	const router = useRouter();
	const context = Route.useRouteContext();
	const shell = Route.useLoaderData();
	const me = () => context().me;
	const role = () => me().role as UserRole;

	// INC-24: work in another of your roles. Every cached page belongs to the
	// old role, so it goes; the new role starts on its own start screen.
	const switchRole = async (next: string) => {
		try {
			await client.account.switchRole({ role: next as UserRole });
		} catch (error) {
			toast({ title: "Wisselen lukte niet", description: friendlyError(error), tone: "danger" });
			return;
		}
		clearMe();
		router.clearCache();
		await router.navigate({ to: roleHome(next as UserRole) });
		toast({ title: `Je werkt nu als ${roleLabel(next as UserRole).toLowerCase()}`, tone: "success" });
	};

	const user = () =>
		({
			name: me().user.name,
			subtitle: me().user.email,
			organization: me().organization?.name,
			roleLabel: roleLabel(role()),
			tone: role() === "coach" ? "coach" : "leerling",
			roles: (me().roles as UserRole[]).map((r) => ({ value: r, label: roleLabel(r) })),
			activeRole: role(),
			onSwitchRole: switchRole,
		}) as const;

	return (
		<AppShell user={user()} nav={navForRole(role(), shell().badges)}>
			<Outlet />
		</AppShell>
	);
}
