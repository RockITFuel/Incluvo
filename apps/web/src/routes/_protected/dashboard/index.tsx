import { createFileRoute, Link } from "@tanstack/solid-router";
import { useQuery } from "@tanstack/solid-query";
import {
	ClipboardCheck,
	Flag,
	MessageSquare,
	NotebookPen,
	Search,
	TrendingUp,
	User,
} from "lucide-solid";
import {
	createEffect,
	createMemo,
	createSignal,
	For,
	on,
	Show,
} from "solid-js";
import {
	PlanStatusBadge,
	relativeTime,
} from "../../../components/dashboard/plan-status";
import { PlatformOverview } from "../../../components/admin/platform-overview";
import { KPI } from "../../../components/dashboard/kpi";
import { Quickpanel } from "../../../components/dashboard/quickpanel";
import { Pagination } from "../../../components/ui/pagination";
import { Tooltip } from "../../../components/ui/tooltip";
import { requireRole } from "../../../lib/auth/require-role";
import { RequireRole } from "../../../lib/auth/role-guard";
import { useMe } from "../../../lib/auth/use-me";
import { moodMeta } from "../../../lib/mood";
import { orpc } from "../../../lib/orpc";

/**
 * Coach dashboard (#42) — a 1:1 port of the approved "Coach" prototype page.
 * A dense, calm overview of the coach's assigned leerlingen: a KPI row, a
 * filter + zoek segmented control and a table with coachplan status, task
 * voortgang, last activity and an aandacht-badge. A row click opens the
 * Quickpanel slide-over (#43); the profiel-icon links to the full profile
 * route (#44); the chat-icon deep-links into /chat.
 *
 * All numbers are derived from the live `dashboard.overview` payload where the
 * data exists (plannen klaar, aandacht, gem. voortgang from task-completion).
 * Fields the backend does not yet carry (per-leerling mood, class name) are
 * shown as clearly-static demo placeholders, never fabricated per leerling.
 *
 * Gated to coach+ in the UI (`requireRole("coach")`); the server re-enforces
 * coach+ and the coach↔leerling assignment on every procedure.
 */
export const Route = createFileRoute("/_protected/dashboard/")({
	beforeLoad: () => requireRole("coach"),
	component: () => (
		<RequireRole min="coach">
			<DashboardOrOverview />
		</RequireRole>
	),
});

/**
 * The superadmin (Ondivera) manages schools rather than coaching leerlingen:
 * they get the platform overview (docs/decisions/superadmin-beheer.md).
 */
function DashboardOrOverview() {
	const me = useMe();
	return (
		<Show when={me.is("superadmin")} fallback={<DashboardPage />}>
			<PlatformOverview />
		</Show>
	);
}

type Filter = "all" | "attention" | "plan";

const PAGE_SIZE = 10;

/** Full date + time for the "laatst actief" tooltip. */
const fullDate = (date: Date | string): string =>
	new Date(date).toLocaleString("nl-NL", {
		weekday: "long",
		day: "numeric",
		month: "long",
		hour: "2-digit",
		minute: "2-digit",
	});

const initials = (name: string): string =>
	name
		.trim()
		.split(/\s+/)
		.map((w) => w[0] ?? "")
		.slice(0, 2)
		.join("")
		.toUpperCase();

/** Short "Voornaam L." label for the aandacht KPI subline. */
const shortName = (name: string): string => {
	const parts = name.trim().split(/\s+/);
	if (parts.length < 2) return parts[0] ?? "";
	return `${parts[0]} ${(parts[parts.length - 1] ?? "")[0] ?? ""}.`;
};

const todayLabel = (): string =>
	new Date().toLocaleDateString("nl-NL", {
		weekday: "long",
		day: "numeric",
		month: "long",
	});

function DashboardPage() {
	const overview = useQuery(() => orpc.dashboard.overview.queryOptions());
	// Today's SHARED mood per assigned leerling (server only returns opt-in rows).
	const moods = useQuery(() => orpc.mood.todayForLeerlingen.queryOptions());
	const moodByLeerling = createMemo(() => {
		const m = new Map<string, number>();
		for (const r of moods.data ?? []) m.set(r.leerlingId, r.mood);
		return m;
	});
	const [filter, setFilter] = createSignal<Filter>("all");
	const [search, setSearch] = createSignal("");
	const [openLeerling, setOpenLeerling] = createSignal<string | null>(null);
	const [openPlan, setOpenPlan] = createSignal<string | null>(null);
	const [openConvo, setOpenConvo] = createSignal<string | null>(null);

	const rows = createMemo(() => overview.data ?? []);
	type Row = NonNullable<typeof overview.data>[number];

	/** Per-leerling task-completion voortgang (real). */
	const voortgang = (row: Row) => {
		const total = row.tasks.open + row.tasks.done;
		return total > 0 ? Math.round((row.tasks.done / total) * 100) : 0;
	};

	const filtered = createMemo(() => {
		let list = rows();
		const f = filter();
		if (f === "attention") list = list.filter((r) => r.aandacht);
		else if (f === "plan")
			list = list.filter(
				(r) =>
					r.plan.status === "submitted" || r.plan.status === "coach_review",
			);
		const q = search().trim().toLowerCase();
		if (q) list = list.filter((r) => r.leerling.name.toLowerCase().includes(q));
		return list;
	});

	// --- Paginering (client-side; the overview returns all assigned leerlingen).
	const [page, setPage] = createSignal(1);
	createEffect(on([filter, search], () => setPage(1), { defer: true }));
	const pageCount = createMemo(() =>
		Math.max(1, Math.ceil(filtered().length / PAGE_SIZE)),
	);
	const currentPage = createMemo(() => Math.min(page(), pageCount()));
	const paged = createMemo(() => {
		const start = (currentPage() - 1) * PAGE_SIZE;
		return filtered().slice(start, start + PAGE_SIZE);
	});

	const attentionCount = createMemo(
		() => rows().filter((r) => r.aandacht).length,
	);

	// --- KPI derivations (real data) -----------------------------------------
	const kpis = createMemo(() => {
		const list = rows();
		const total = list.length;
		const klaar = list.filter(
			(r) =>
				r.plan.status === "completed" ||
				r.plan.status === "shared_with_leerling",
		).length;
		const inBehandeling = list.filter(
			(r) =>
				r.plan.status === "submitted" || r.plan.status === "coach_review",
		).length;
		const attentionNames = list
			.filter((r) => r.aandacht)
			.slice(0, 2)
			.map((r) => shortName(r.leerling.name));
		const totalOpen = list.reduce((s, r) => s + r.tasks.open, 0);
		const totalOverdue = list.reduce((s, r) => s + r.tasks.overdue, 0);
		const gemVoortgang =
			total > 0
				? Math.round(
						list.reduce((s, r) => {
							const t = r.tasks.open + r.tasks.done;
							return s + (t > 0 ? (r.tasks.done / t) * 100 : 0);
						}, 0) / total,
					)
				: 0;
		return {
			total,
			klaar,
			inBehandeling,
			attentionNames,
			totalOpen,
			totalOverdue,
			gemVoortgang,
		};
	});

	const openQuickpanel = (
		leerlingId: string,
		planSubmissionId: string | null,
		conversationId: string | null,
	) => {
		setOpenPlan(planSubmissionId);
		setOpenConvo(conversationId);
		setOpenLeerling(leerlingId);
	};

	const colTemplate = "2fr 1fr 1.5fr 1.5fr 1fr 100px";

	return (
		<>
			<div class="page-head">
				<div>
					<h1>Dashboard</h1>
					<div class="sub">
						<span style={{ "text-transform": "capitalize" }}>
							{todayLabel()}
						</span>{" "}
						· {rows().length} leerlingen
					</div>
				</div>
			</div>

			<Show when={overview.isLoading}>
				<div class="card text-muted">Laden…</div>
			</Show>

			<Show when={!overview.isLoading && rows().length === 0}>
				<div class="card" style={{ color: "rgb(var(--muted))" }}>
					Er zijn nog geen leerlingen aan jou gekoppeld.
				</div>
			</Show>

			<Show when={rows().length > 0}>
				{/* KPI row */}
				<div class="ds-grid-tiles" style={{ "margin-bottom": "24px" }}>
					<KPI
						label="Plannen klaar"
						value={`${kpis().klaar}/${kpis().total}`}
						sub={`${kpis().inBehandeling} in behandeling`}
						tone="primary"
						icon={NotebookPen}
					/>
					<KPI
						label="Aandacht nodig"
						value={String(attentionCount())}
						sub={
							kpis().attentionNames.length
								? kpis().attentionNames.join(" · ")
								: "Alles rustig"
						}
						tone="accent"
						icon={Flag}
					/>
					<KPI
						label="Open taken"
						value={String(kpis().totalOpen)}
						sub={
							kpis().totalOverdue > 0
								? `${kpis().totalOverdue} over tijd`
								: "niets over tijd"
						}
						tone="warning"
						icon={ClipboardCheck}
					/>
					<KPI
						label="Gem. voortgang"
						value={`${kpis().gemVoortgang}%`}
						sub="op basis van taken"
						tone="success"
						icon={TrendingUp}
					/>
				</div>

				{/* Filter + zoek */}
				<div
					class="ds-row"
					style={{
						"margin-bottom": "14px",
						gap: "8px",
						"flex-wrap": "wrap",
					}}
				>
					<div class="seg" role="group" aria-label="Filter leerlingen">
						<button
							type="button"
							class={filter() === "all" ? "on" : ""}
							aria-pressed={filter() === "all"}
							onClick={() => setFilter("all")}
						>
							Alle leerlingen
						</button>
						<button
							type="button"
							class={filter() === "attention" ? "on" : ""}
							aria-pressed={filter() === "attention"}
							onClick={() => setFilter("attention")}
						>
							Aandacht ({attentionCount()})
						</button>
						<button
							type="button"
							class={filter() === "plan" ? "on" : ""}
							aria-pressed={filter() === "plan"}
							onClick={() => setFilter("plan")}
						>
							Plan in behandeling
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
							placeholder="Zoek leerling…"
							aria-label="Zoek leerling"
						/>
					</div>
				</div>

				{/* Table */}
				<div class="card" style={{ padding: "0", overflow: "hidden" }}>
					<div style={{ "overflow-x": "auto" }}>
						<div style={{ "min-width": "720px" }} role="table" aria-label="Leerlingen">
							{/* Header */}
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
								<div role="columnheader">Leerling</div>
								<div role="columnheader">Mood</div>
								<div role="columnheader">Coachplan</div>
								<div role="columnheader">Voortgang</div>
								<div role="columnheader">Laatst actief</div>
								<div role="columnheader">
									<span class="sr-only">Acties</span>
								</div>
							</div>

							<For each={paged()}>
								{(row) => (
									// The row is clickable for mouse users; keyboard and screen-reader
									// users open the snelpanel with the name button (no nested
									// interactive content, WCAG 4.1.2).
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
											background:
												openLeerling() === row.leerling.id
													? "rgb(var(--primary-50))"
													: "transparent",
										}}
										onClick={() =>
											openQuickpanel(
												row.leerling.id,
												row.snelacties.planSubmissionId,
												row.snelacties.conversationId,
											)
										}
									>
										{/* Leerling */}
										<div role="cell" class="ds-row" style={{ "min-width": "0" }}>
											<div
												class="avatar"
												style={{
													width: "34px",
													height: "34px",
													"font-size": "0.75rem",
												}}
												aria-hidden="true"
											>
												{initials(row.leerling.name)}
											</div>
											<div style={{ "min-width": "0" }}>
												<button
													type="button"
													class="text-left"
													aria-label={`Snelpanel van ${row.leerling.name}`}
													aria-expanded={openLeerling() === row.leerling.id}
													onClick={(e) => {
														e.stopPropagation();
														openQuickpanel(
															row.leerling.id,
															row.snelacties.planSubmissionId,
															row.snelacties.conversationId,
														);
													}}
													style={{
														"font-weight": "500",
														"font-size": "0.875rem",
													}}
												>
													{row.leerling.name}
												</button>
												<div
													style={{
														"font-size": "0.75rem",
														color: "rgb(var(--muted))",
														overflow: "hidden",
														"text-overflow": "ellipsis",
														"white-space": "nowrap",
													}}
												>
													{row.leerling.email}
												</div>
											</div>
											<Show when={row.aandacht}>
												<span
													class="chip danger"
													style={{ "font-size": "0.6875rem" }}
												>
													<Flag class="size-3" aria-hidden="true" /> Aandacht
												</span>
											</Show>
										</div>

										{/* Mood — alleen getoond als de leerling het vandaag deelde. */}
										<Show
											when={moodByLeerling().has(row.leerling.id)}
											fallback={
												<div role="cell">
													<span
														role="img"
														style={{
															"font-size": "0.875rem",
															color: "rgb(var(--muted))",
														}}
														title="Nog geen mood gedeeld"
														aria-label="Mood: nog niet gedeeld"
													>
														—
													</span>
												</div>
											}
										>
											<div role="cell">
												<span
													role="img"
													style={{ "font-size": "1.375rem", "line-height": "1" }}
													title={moodMeta(moodByLeerling().get(row.leerling.id) as number).label}
													aria-label={`Mood: ${moodMeta(moodByLeerling().get(row.leerling.id) as number).label}`}
												>
													{moodMeta(moodByLeerling().get(row.leerling.id) as number).e}
												</span>
											</div>
										</Show>

										{/* Coachplan */}
										<div role="cell">
											<span style={{ display: "inline-flex" }}>
												<PlanStatusBadge status={row.plan.status} />
											</span>
											<div
												style={{
													"font-size": "0.6875rem",
													color: "rgb(var(--muted))",
													"margin-top": "3px",
												}}
											>
												{relativeTime(row.plan.updatedAt)}
											</div>
										</div>

										{/* Voortgang */}
										<div role="cell" class="ds-row" style={{ gap: "10px" }}>
											<div
												class="progress"
												style={{ flex: "1", "max-width": "160px" }}
												aria-hidden="true"
											>
												<span style={{ width: `${voortgang(row)}%` }} />
											</div>
											<span
												style={{
													"font-size": "0.75rem",
													color: "rgb(var(--muted))",
													"font-variant-numeric": "tabular-nums",
												}}
											>
												{voortgang(row)}%
											</span>
										</div>

										{/* Laatst actief */}
										<div
											role="cell"
											style={{
												"font-size": "0.8125rem",
												color: "rgb(var(--muted))",
												"white-space": "nowrap",
											}}
											title={
												row.lastActivityAt
													? fullDate(row.lastActivityAt)
													: "Nog geen activiteit"
											}
										>
											{row.lastActivityAt
												? relativeTime(row.lastActivityAt)
												: "Nog niet actief"}
										</div>

										{/* Snelacties */}
										<div
											role="cell"
											class="ds-row"
											style={{ gap: "4px", "justify-content": "flex-end" }}
										>
											<Tooltip content="Chat openen">
												{(trigger) => (
													<Link
														{...trigger}
														to="/chat"
														search={
															row.snelacties.conversationId
																? {
																		conversationId:
																			row.snelacties.conversationId,
																	}
																: { otherUserId: row.leerling.id }
														}
														aria-label={`Chat met ${row.leerling.name}`}
														class="icon-btn"
														style={{ width: "30px", height: "30px" }}
														onClick={(e) => e.stopPropagation()}
													>
														<MessageSquare class="size-3.5" aria-hidden="true" />
													</Link>
												)}
											</Tooltip>
											<Tooltip content="Profiel bekijken">
												{(trigger) => (
													<Link
														{...trigger}
														to="/dashboard/$leerlingId"
														params={{ leerlingId: row.leerling.id }}
														aria-label={`Profiel van ${row.leerling.name}`}
														class="icon-btn"
														style={{ width: "30px", height: "30px" }}
														onClick={(e) => e.stopPropagation()}
													>
														<User class="size-3.5" aria-hidden="true" />
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
										Geen leerlingen gevonden.
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
						noun="leerlingen"
						onPage={setPage}
					/>
				</div>
			</Show>

			<Quickpanel
				leerlingId={openLeerling()}
				planSubmissionId={openPlan()}
				conversationId={openConvo()}
				onClose={() => setOpenLeerling(null)}
			/>
		</>
	);
}
