import { Link, useNavigate } from "@tanstack/solid-router";
import { ArrowRight, Building2, Search } from "lucide-solid";
import { createEffect, createMemo, createSignal, For, on, Show } from "solid-js";
import { relativeTime } from "../dashboard/plan-status";
import { Pagination } from "../ui/pagination";
import { Tooltip } from "../ui/tooltip";
import type { orpc } from "../../lib/orpc";

type Filter = "active" | "no-keyuser" | "archived";

type School = Awaited<
	ReturnType<typeof orpc.admin.organizations.listAll.call>
>[number];

const PAGE_SIZE = 20;

/**
 * The schools table: Actief / Zonder keyuser / Gearchiveerd, search,
 * pagination, one row per school with its counts. Used by the platform
 * overview and Beheer → Scholen, so both scale with the number of schools.
 */
export function SchoolsTable(props: { orgs: School[] }) {
	const navigate = useNavigate();
	const [filter, setFilter] = createSignal<Filter>("active");
	const [search, setSearch] = createSignal("");
	const [page, setPage] = createSignal(1);

	const schools = createMemo(() => props.orgs.filter((o) => o.kind === "school"));
	const active = createMemo(() => schools().filter((o) => !o.archivedAt));
	const noKeyuser = createMemo(() => active().filter((o) => o.stats.keyuserCount === 0));
	const archived = createMemo(() => schools().filter((o) => o.archivedAt));

	const filtered = createMemo(() => {
		const f = filter();
		let list = f === "archived" ? archived() : f === "no-keyuser" ? noKeyuser() : active();
		const q = search().trim().toLowerCase();
		if (q) list = list.filter((o) => o.name.toLowerCase().includes(q));
		return list;
	});

	createEffect(on([filter, search], () => setPage(1), { defer: true }));
	const pageCount = createMemo(() => Math.max(1, Math.ceil(filtered().length / PAGE_SIZE)));
	const currentPage = createMemo(() => Math.min(page(), pageCount()));
	const paged = createMemo(() => {
		const start = (currentPage() - 1) * PAGE_SIZE;
		return filtered().slice(start, start + PAGE_SIZE);
	});

	const openSchool = (id: string) =>
		navigate({ to: "/beheer/scholen/$organizationId", params: { organizationId: id } });

	const colTemplate = "2fr 1fr 1fr 1fr 1.2fr 1.2fr 60px";

	return (
		<>
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
												{/* Status under the name, so long names never get squeezed. */}
												<div
													class="ds-row"
													style={{
														gap: "6px",
														"font-size": "0.75rem",
														color: "rgb(var(--muted))",
														"white-space": "nowrap",
													}}
												>
													{o.stats.userCount}{" "}
													{o.stats.userCount === 1 ? "gebruiker" : "gebruikers"}
													<Show when={!o.archivedAt && o.stats.keyuserCount === 0}>
														<span class="chip warning" style={{ "font-size": "0.6875rem", padding: "1px 7px" }}>
															Geen keyuser
														</span>
													</Show>
													<Show when={o.archivedAt}>
														<span class="chip" style={{ "font-size": "0.6875rem", padding: "1px 7px" }}>
															Gearchiveerd
														</span>
													</Show>
												</div>
											</div>
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
