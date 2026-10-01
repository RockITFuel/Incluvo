import { useQuery } from "@tanstack/solid-query";
import { Link, useNavigate } from "@tanstack/solid-router";
import {
	ArrowRight,
	Building2,
	GraduationCap,
	NotebookPen,
	Plus,
	Search,
	Users,
} from "lucide-solid";
import {
	createEffect,
	createMemo,
	createSignal,
	For,
	on,
	Show,
} from "solid-js";
import { relativeTime } from "../dashboard/plan-status";
import { KPI } from "../dashboard/kpi";
import { Pagination } from "../ui/pagination";
import { Tooltip } from "../ui/tooltip";
import { orpc } from "../../lib/orpc";
import { CreateSchoolDialog } from "./create-school-dialog";

type Filter = "active" | "no-keyuser" | "archived";

const PAGE_SIZE = 10;

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
	const navigate = useNavigate();
	const orgs = useQuery(() => orpc.admin.organizations.listAll.queryOptions());
	const [filter, setFilter] = createSignal<Filter>("active");
	const [search, setSearch] = createSignal("");
	const [page, setPage] = createSignal(1);
	const [createOpen, setCreateOpen] = createSignal(false);

	const schools = createMemo(() =>
		(orgs.data ?? []).filter((o) => o.kind === "school"),
	);
	const active = createMemo(() => schools().filter((o) => !o.archivedAt));
	const noKeyuser = createMemo(() =>
		active().filter((o) => o.stats.keyuserCount === 0),
	);
	const archived = createMemo(() => schools().filter((o) => o.archivedAt));

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

	const filtered = createMemo(() => {
		const f = filter();
		let list =
			f === "archived" ? archived() : f === "no-keyuser" ? noKeyuser() : active();
		const q = search().trim().toLowerCase();
		if (q) list = list.filter((o) => o.name.toLowerCase().includes(q));
		return list;
	});

	createEffect(on([filter, search], () => setPage(1), { defer: true }));
	const pageCount = createMemo(() =>
		Math.max(1, Math.ceil(filtered().length / PAGE_SIZE)),
	);
	const currentPage = createMemo(() => Math.min(page(), pageCount()));
	const paged = createMemo(() => {
		const start = (currentPage() - 1) * PAGE_SIZE;
		return filtered().slice(start, start + PAGE_SIZE);
	});

	const openSchool = (id: string) =>
		navigate({
			to: "/beheer/scholen/$organizationId",
			params: { organizationId: id },
		});

	const colTemplate = "2fr 1fr 1fr 1fr 1.2fr 1.2fr 60px";

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
				<div class="card text-danger">Kon de scholen niet laden.</div>
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

				<div
					class="ds-row"
					style={{ "margin-bottom": "14px", gap: "8px", "flex-wrap": "wrap" }}
				>
					<div class="seg" role="group" aria-label="Filter scholen">
						<button
							type="button"
							class={filter() === "active" ? "on" : ""}
							aria-pressed={filter() === "active"}
							onClick={() => setFilter("active")}
						>
							Actief ({active().length})
						</button>
						<button
							type="button"
							class={filter() === "no-keyuser" ? "on" : ""}
							aria-pressed={filter() === "no-keyuser"}
							onClick={() => setFilter("no-keyuser")}
						>
							Zonder keyuser ({noKeyuser().length})
						</button>
						<button
							type="button"
							class={filter() === "archived" ? "on" : ""}
							aria-pressed={filter() === "archived"}
							onClick={() => setFilter("archived")}
						>
							Gearchiveerd ({archived().length})
						</button>
					</div>
					<div class="ds-grow" />
					<div
						class="ds-row"
						style={{
							gap: "8px",
							padding: "7px 12px",
							background: "rgb(var(--surface))",
							"border-radius": "10px",
							border: "1px solid rgb(var(--line))",
						}}
					>
						<Search
							class="size-3.5"
							aria-hidden="true"
							style={{ color: "rgb(var(--muted))" }}
						/>
						<input
							value={search()}
							onInput={(e) => setSearch(e.currentTarget.value)}
							style={{
								border: "0",
								background: "transparent",
								outline: "none",
								"font-size": "0.8125rem",
								color: "rgb(var(--ink))",
							}}
							placeholder="Zoek school…"
							aria-label="Zoek school"
						/>
					</div>
				</div>

				<div class="card" style={{ padding: "0", overflow: "hidden" }}>
					<div style={{ "overflow-x": "auto" }}>
						<div style={{ "min-width": "760px" }} role="table" aria-label="Scholen">
							<div
								role="row"
								style={{
									display: "grid",
									"grid-template-columns": colTemplate,
									"column-gap": "24px",
									padding: "12px 20px",
									background: "rgb(var(--bg-2))",
									"border-bottom": "1px solid rgb(var(--line))",
									"font-size": "0.75rem",
									"font-weight": "600",
									color: "rgb(var(--muted))",
									"text-transform": "uppercase",
									"letter-spacing": "0.04em",
								}}
							>
								<div role="columnheader">School</div>
								<div role="columnheader">Keyusers</div>
								<div role="columnheader">Coaches</div>
								<div role="columnheader">Leerlingen</div>
								<div role="columnheader">Plannen wachten</div>
								<div role="columnheader">Laatst actief</div>
								<div role="columnheader">
									<span class="sr-only">Acties</span>
								</div>
							</div>

							<For each={paged()}>
								{(o) => (
									// Row click for mouse users; keyboard and screen-reader users
									// use the name link (no nested interactive content).
									<div
										role="row"
										style={{
											display: "grid",
											"grid-template-columns": colTemplate,
											"column-gap": "24px",
											padding: "14px 20px",
											"border-bottom": "1px solid rgb(var(--line-2))",
											"align-items": "center",
											cursor: "pointer",
										}}
										onClick={() => openSchool(o.id)}
									>
										<div role="cell" class="ds-row" style={{ "min-width": "0" }}>
											<div
												class="avatar"
												style={{ width: "34px", height: "34px" }}
												aria-hidden="true"
											>
												<Building2 class="size-4" />
											</div>
											<div style={{ "min-width": "0" }}>
												<Link
													to="/beheer/scholen/$organizationId"
													params={{ organizationId: o.id }}
													style={{ "font-weight": "500", "font-size": "0.875rem" }}
													onClick={(e) => e.stopPropagation()}
												>
													{o.name}
												</Link>
												<div
													style={{
														"font-size": "0.75rem",
														color: "rgb(var(--muted))",
													}}
												>
													{o.stats.userCount}{" "}
													{o.stats.userCount === 1 ? "gebruiker" : "gebruikers"}
												</div>
											</div>
											<Show when={!o.archivedAt && o.stats.keyuserCount === 0}>
												<span class="chip warning" style={{ "font-size": "0.6875rem" }}>
													Geen keyuser
												</span>
											</Show>
											<Show when={o.archivedAt}>
												<span class="chip" style={{ "font-size": "0.6875rem" }}>
													Gearchiveerd
												</span>
											</Show>
										</div>
										<Count value={o.stats.keyuserCount} />
										<Count value={o.stats.coachCount} />
										<Count value={o.stats.leerlingCount} />
										<Count value={o.stats.plansWaiting} highlight />
										<div
											role="cell"
											style={{
												"font-size": "0.8125rem",
												color: "rgb(var(--muted))",
												"white-space": "nowrap",
											}}
										>
											{o.stats.lastActiveAt
												? relativeTime(o.stats.lastActiveAt)
												: "Nog niet actief"}
										</div>
										<div
											role="cell"
											class="ds-row"
											style={{ "justify-content": "flex-end" }}
										>
											<Tooltip content="School openen">
												{(trigger) => (
													<Link
														{...trigger}
														to="/beheer/scholen/$organizationId"
														params={{ organizationId: o.id }}
														aria-label={`Open ${o.name}`}
														class="icon-btn"
														style={{ width: "30px", height: "30px" }}
														onClick={(e) => e.stopPropagation()}
													>
														<ArrowRight class="size-3.5" aria-hidden="true" />
													</Link>
												)}
											</Tooltip>
										</div>
									</div>
								)}
							</For>

							<Show when={filtered().length === 0}>
								<div role="row">
									<div
										role="cell"
										style={{
											padding: "24px 20px",
											"font-size": "0.8125rem",
											color: "rgb(var(--muted))",
										}}
									>
										{search()
											? "Geen scholen gevonden."
											: filter() === "no-keyuser"
												? "Elke actieve school heeft een keyuser."
												: filter() === "archived"
													? "Er zijn geen gearchiveerde scholen."
													: "Nog geen scholen. Maak de eerste aan met Nieuwe school."}
									</div>
								</div>
							</Show>
						</div>
					</div>
					<Pagination
						page={currentPage()}
						pageCount={pageCount()}
						pageSize={PAGE_SIZE}
						total={filtered().length}
						noun="scholen"
						onPage={setPage}
					/>
				</div>
			</Show>

			<CreateSchoolDialog open={createOpen()} onOpenChange={setCreateOpen} />
		</>
	);
}

function Count(props: { value: number; highlight?: boolean }) {
	return (
		<div
			role="cell"
			style={{
				"font-size": "0.875rem",
				"font-variant-numeric": "tabular-nums",
				"font-weight": props.highlight && props.value > 0 ? "600" : "400",
				color:
					props.highlight && props.value > 0
						? "rgb(var(--warning))"
						: props.value === 0
							? "rgb(var(--muted))"
							: "rgb(var(--ink))",
			}}
		>
			{props.value}
		</div>
	);
}
