import { useQuery } from "@tanstack/solid-query";
import { Building2, GraduationCap, NotebookPen, Plus, Users } from "lucide-solid";
import { createMemo, createSignal, Show } from "solid-js";
import { KPI } from "../dashboard/kpi";
import { ErrorState } from "../ui/error-state";
import { orpc } from "../../lib/orpc";
import { CreateSchoolDialog } from "./create-school-dialog";
import { SchoolsTable } from "./schools-table";

const todayLabel = (): string =>
	new Date().toLocaleDateString("nl-NL", {
		weekday: "long",
		day: "numeric",
		month: "long",
	});

/**
 * Platform overview — the superadmin's (Ondivera) start page on /dashboard,
 * instead of the coach dashboard with every leerling of every school mixed
 * together (docs/decisions/superadmin-beheer.md, voorstel 3).
 *
 * KPIs over all active schools, then a schools table with the counts that
 * matter for Ondivera and a "Geen keyuser" flag: a new school's next step.
 * All from `admin.organizations.listAll` (grouped queries, no per-leerling
 * fan-out), so it stays cheap as schools are added.
 */
export function PlatformOverview() {
	const orgs = useQuery(() => orpc.admin.organizations.listAll.queryOptions());
	const [createOpen, setCreateOpen] = createSignal(false);

	const schools = createMemo(() =>
		(orgs.data ?? []).filter((o) => o.kind === "school"),
	);
	const active = createMemo(() => schools().filter((o) => !o.archivedAt));
	const noKeyuser = createMemo(() =>
		active().filter((o) => o.stats.keyuserCount === 0),
	);

	const kpis = createMemo(() => {
		const list = active();
		const sum = (pick: (o: (typeof list)[number]) => number) =>
			list.reduce((s, o) => s + pick(o), 0);
		return {
			schools: list.length,
			leerlingen: sum((o) => o.stats.leerlingCount),
			coaches: sum((o) => o.stats.coachCount),
			plansWaiting: sum((o) => o.stats.plansWaiting),
		};
	});

	return (
		<>
			<div class="page-head">
				<div>
					<h1>Overzicht</h1>
					<div class="sub">
						<span style={{ "text-transform": "capitalize" }}>{todayLabel()}</span>{" "}
						· {kpis().schools} {kpis().schools === 1 ? "school" : "scholen"}
					</div>
				</div>
				<div class="ds-row">
					<button
						type="button"
						class="btn primary"
						onClick={() => setCreateOpen(true)}
					>
						<Plus class="size-3.5" aria-hidden="true" /> Nieuwe school
					</button>
				</div>
			</div>

			<Show when={orgs.isLoading}>
				<div class="card text-muted">Laden…</div>
			</Show>
			<Show when={orgs.error}>
				<ErrorState error={orgs.error} what="de scholen" onRetry={() => orgs.refetch()} />
			</Show>

			<Show when={orgs.data}>
				<div class="ds-grid-tiles" style={{ "margin-bottom": "24px" }}>
					<KPI
						label="Actieve scholen"
						value={String(kpis().schools)}
						sub={
							noKeyuser().length > 0
								? `${noKeyuser().length} zonder keyuser`
								: "allemaal met keyuser"
						}
						tone="primary"
						icon={Building2}
					/>
					<KPI
						label="Leerlingen"
						value={String(kpis().leerlingen)}
						sub="op alle actieve scholen"
						tone="success"
						icon={GraduationCap}
					/>
					<KPI
						label="Coaches"
						value={String(kpis().coaches)}
						sub="op alle actieve scholen"
						tone="accent"
						icon={Users}
					/>
					<KPI
						label="Plannen wachten"
						value={String(kpis().plansWaiting)}
						sub="op beoordeling door een coach"
						tone="warning"
						icon={NotebookPen}
					/>
				</div>

				<SchoolsTable orgs={orgs.data ?? []} />
			</Show>

			<CreateSchoolDialog open={createOpen()} onOpenChange={setCreateOpen} />
		</>
	);
}
