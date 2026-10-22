import { createFileRoute, useRouter } from "@tanstack/solid-router";
import { createMemo, Show } from "solid-js";
import { AssignmentsPanel } from "../../../components/admin/assignments-panel";
import { AuditPanel } from "../../../components/admin/audit-panel";
import { SchoolsPanel } from "../../../components/admin/schools-panel";
import { SettingsPanel } from "../../../components/admin/settings-panel";
import { UsersPanel } from "../../../components/admin/users-panel";
import { RouteDataView } from "../../../components/ui/route-data-view";
import { type TabItem, Tabs } from "../../../components/ui/tabs";
import { requireRole } from "../../../lib/auth/role-guard";
import { useMe } from "../../../lib/auth/use-me";
import { client } from "../../../lib/orpc";
import { refresh } from "../../../lib/refresh";
import { granted, loadRouteData } from "../../../lib/route-data";

/**
 * Admin omgeving (#60, Epic 9) — tabbed beheer voor keyuser (eigen school) en
 * superadmin (Ondivera, cross-tenant). Tabs are role-gated: a keyuser sees the
 * own-tenant tabs (Gebruikers, Koppelingen, Audit, Instellingen); the
 * superadmin additionally sees Scholen. Formulieren and Cursussen are edited
 * on their own pages (/plan/beheer, /cursussen), both in the nav. The server independently enforces
 * RBAC on every procedure — these gates are UX only.
 *
 * The loader fetches the users, the organisations (superadmin) and the
 * retention policy; the audit and koppelingen panels page on their own.
 */
export const Route = createFileRoute("/_protected/beheer/")({
	beforeLoad: ({ context }) => requireRole(context.me, { min: "keyuser" }),
	loader: async ({ context, abortController }) => {
		const signal = abortController.signal;
		const superadmin = context.me.role === "superadmin";
		const [users, orgs, retention] = await Promise.all([
			loadRouteData(signal, (s) => client.admin.users.overview({}, { signal: s })),
			superadmin
				? loadRouteData(signal, (s) => client.admin.organizations.listAll(undefined, { signal: s }))
				: null,
			loadRouteData(signal, (s) => client.admin.settings.getRetention(undefined, { signal: s })),
		]);
		return { users, orgs, retention };
	},
	component: BeheerPage,
});

function BeheerPage() {
	const me = useMe();
	const router = useRouter();
	const data = Route.useLoaderData();
	const retry = () => void refresh(router, "admin");

	const orgs = () => data().orgs;
	// Depends on the role only: the panels read the loader data themselves, so
	// a refresh updates them in place instead of rebuilding them (and losing
	// their search, page and open dialogs).
	const tabs = createMemo<TabItem[]>(() => {
		const items: TabItem[] = [
			{
				value: "users",
				label: "Gebruikers",
				content: (
					<RouteDataView data={data().users} what="de gebruikers" onRetry={retry}>
						{(users) => (
							<UsersPanel
								users={users()}
								orgs={(() => { const o = orgs(); return o ? granted(o) : undefined; })()}
							/>
						)}
					</RouteDataView>
				),
			},
			{
				value: "assignments",
				label: "Koppelingen",
				content: <AssignmentsPanel />,
			},
		];
		if (me.is("superadmin")) {
			items.push({
				value: "schools",
				label: "Scholen",
				content: (
					<RouteDataView data={orgs() ?? { access: "denied" }} what="de scholen" onRetry={retry}>
						{(list) => <SchoolsPanel orgs={list()} />}
					</RouteDataView>
				),
			});
		}
		items.push(
			{ value: "audit", label: "Audit", content: <AuditPanel /> },
			{
				value: "settings",
				label: "Instellingen",
				content: (
					<RouteDataView data={data().retention} what="de bewaartermijnen" onRetry={retry}>
						{(policy) => <SettingsPanel policy={policy()} />}
					</RouteDataView>
				),
			},
		);
		return items;
	});

	return (
		<section class="flex flex-col gap-6">
			<div>
				<h1 class="font-head text-h1 text-ink">Beheer</h1>
				<p class="mt-1 text-body text-muted">
					<Show
						when={me.is("superadmin")}
						fallback={
							<>
								Beheeromgeving voor{" "}
								<strong class="text-ink-2">
									{me.organization()?.name ?? "jouw school"}
								</strong>
								.
							</>
						}
					>
						Ondivera-beheeromgeving voor alle scholen.
					</Show>
				</p>
			</div>

			<Tabs aria-label="Beheer" items={tabs()} />
		</section>
	);
}
