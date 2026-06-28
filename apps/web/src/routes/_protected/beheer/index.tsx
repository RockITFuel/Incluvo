import { createFileRoute } from "@tanstack/solid-router";
import { createMemo, Show } from "solid-js";
import { AuditPanel } from "../../../components/admin/audit-panel";
import { SchoolsPanel } from "../../../components/admin/schools-panel";
import { SettingsPanel } from "../../../components/admin/settings-panel";
import {
	CoursesPanel,
	FormsPanel,
} from "../../../components/admin/templates-panel";
import { UsersPanel } from "../../../components/admin/users-panel";
import { type TabItem, Tabs } from "../../../components/ui/tabs";
import { requireRole } from "../../../lib/auth/require-role";
import { useMe } from "../../../lib/auth/use-me";

/**
 * Admin omgeving (#60, Epic 9) — tabbed beheer voor keyuser (eigen school) en
 * superadmin (Ondivera, cross-tenant). Tabs are role-gated: a keyuser sees the
 * own-tenant tabs (Gebruikers, Formulieren, Cursussen, Audit, Instellingen);
 * the superadmin additionally sees Scholen. The server independently enforces
 * RBAC on every procedure — these gates are UX only.
 */
export const Route = createFileRoute("/_protected/beheer/")({
	beforeLoad: () => requireRole("keyuser"),
	component: BeheerPage,
});

function BeheerPage() {
	const me = useMe();

	const tabs = createMemo<TabItem[]>(() => {
		const isSuperadmin = me.is("superadmin");
		const items: TabItem[] = [
			{ value: "users", label: "Gebruikers", content: <UsersPanel /> },
		];
		if (isSuperadmin) {
			items.push({
				value: "schools",
				label: "Scholen",
				content: <SchoolsPanel />,
			});
		}
		items.push(
			{ value: "forms", label: "Formulieren", content: <FormsPanel /> },
			{ value: "courses", label: "Cursussen", content: <CoursesPanel /> },
			{ value: "audit", label: "Audit", content: <AuditPanel /> },
			{
				value: "settings",
				label: "Instellingen",
				content: <SettingsPanel />,
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
