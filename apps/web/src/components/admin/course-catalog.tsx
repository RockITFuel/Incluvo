import { Link, useRouter } from "@tanstack/solid-router";
import { ArrowRight, Building2, Plus, Search, Tags } from "../../lib/icons";
import { createMemo, createSignal, For, Show } from "solid-js";
import type { client, Output } from "../../lib/orpc";
import { refresh } from "../../lib/refresh";
import { useServerEvent } from "../../lib/sse/use-events";
import { formatDate } from "./format";
import { Pagination } from "../ui/pagination";
import { Select } from "../ui/select";
import { Tooltip } from "../ui/tooltip";
import {
	AvailabilityDialog,
	type Category,
	CategoryManagerDialog,
	CourseCategoriesDialog,
	type Organization,
} from "./course-catalog-dialogs";
import { CreateCourseDialog } from "./create-course-dialog";

const PAGE_SIZE = 20;
const ALL = "__all__";
const NONE = "__none__";

type Tab = "ondivera" | "school";
export type CourseRow = Output<typeof client.courses.list>[number];

/** "Alle scholen" / "3 scholen" / "Nog geen school" for an Ondivera template. */
function availabilityLabel(c: CourseRow): { text: string; tone: "ok" | "partial" | "none" } {
	const a = c.availability;
	if (!a) return { text: "—", tone: "none" };
	if (a.allSchools) return { text: "Alle scholen", tone: "ok" };
	const n = a.organizationIds.length;
	if (n === 0) return { text: "Nog geen school", tone: "none" };
	return { text: n === 1 ? "1 school" : `${n} scholen`, tone: "partial" };
}

/**
 * Cursuscatalogus (superadmin, /beheer/cursussen). Ondivera's own templates —
 * which schools may use each, in which categories — and, read-only, the
 * schools' own templates. Built for many courses: search, category and
 * availability filters, pagination. Schools keep using /cursussen.
 *
 * The data comes from the route loader (routes/_protected/beheer/cursussen).
 */
export function CourseCatalog(props: {
	courses: CourseRow[];
	categories: Category[];
	organizations: Organization[];
}) {
	const router = useRouter();
	useServerEvent("course.changed", () => void refresh(router, "courses"));

	const [tab, setTab] = createSignal<Tab>("ondivera");
	const [search, setSearch] = createSignal("");
	const [category, setCategory] = createSignal(ALL);
	const [availability, setAvailability] = createSignal(ALL);
	const [school, setSchool] = createSignal(ALL);
	// Back to page 1 whenever the tab or a filter changes.
	const [page, setPage] = createSignal(
		() => (tab(), search(), category(), availability(), school(), 1),
	);
	const [manageOpen, setManageOpen] = createSignal(false);
	const [createOpen, setCreateOpen] = createSignal(false);
	const [editCategories, setEditCategories] = createSignal<CourseRow | null>(null);
	const [editAvailability, setEditAvailability] = createSignal<CourseRow | null>(null);

	const categoryName = createMemo(() => {
		const m = new Map<string, string>();
		for (const c of props.categories) m.set(c.id, c.name);
		return m;
	});
	const schoolName = createMemo(() => {
		const m = new Map<string, string>();
		for (const o of props.organizations) m.set(o.id, o.name);
		return m;
	});

	const ondivera = createMemo(() =>
		props.courses.filter((c) => c.kind === "ondivera_template"),
	);
	const schoolCourses = createMemo(() =>
		props.courses.filter((c) => c.kind === "school_template"),
	);

	const filtered = createMemo(() => {
		let rows = tab() === "ondivera" ? ondivera() : schoolCourses();
		const q = search().trim().toLowerCase();
		if (q) {
			rows = rows.filter(
				(c) =>
					c.title.toLowerCase().includes(q) ||
					(c.description ?? "").toLowerCase().includes(q),
			);
		}
		const cat = category();
		if (cat === NONE) rows = rows.filter((c) => c.categoryIds.length === 0);
		else if (cat !== ALL) rows = rows.filter((c) => c.categoryIds.includes(cat));
		if (tab() === "ondivera" && availability() !== ALL) {
			rows = rows.filter((c) => availabilityLabel(c).tone === availability());
		}
		if (tab() === "school" && school() !== ALL) {
			rows = rows.filter((c) => c.organizationId === school());
		}
		return rows;
	});

	const pageCount = createMemo(() => Math.max(1, Math.ceil(filtered().length / PAGE_SIZE)));
	const currentPage = createMemo(() => Math.min(page(), pageCount()));
	const paged = createMemo(() => {
		const start = (currentPage() - 1) * PAGE_SIZE;
		return filtered().slice(start, start + PAGE_SIZE);
	});

	const notYetAvailable = createMemo(
		() => ondivera().filter((c) => availabilityLabel(c).tone === "none").length,
	);

	const categoryOptions = createMemo(() => [
		{ value: ALL, label: "Alle categorieën" },
		{ value: NONE, label: "Zonder categorie" },
		...props.categories.map((c) => ({ value: c.id, label: c.name })),
	]);

	const colTemplate = () =>
		tab() === "ondivera" ? "2.4fr 1.6fr 1.1fr 0.9fr 108px" : "2.4fr 1.6fr 1.2fr 0.9fr 40px";

	return (
		<>
			<div class="page-head">
				<div>
					<h1>Cursuscatalogus</h1>
					<div class="sub">
						{ondivera().length} {ondivera().length === 1 ? "Ondivera-cursus" : "Ondivera-cursussen"} ·{" "}
						{props.categories.length}{" "}
						{props.categories.length === 1 ? "categorie" : "categorieën"}
						<Show when={notYetAvailable() > 0}>
							{" "}
							· {notYetAvailable()} nog voor geen enkele school beschikbaar
						</Show>
					</div>
				</div>
				<div class="ds-row">
					<button type="button" class="btn ghost" onClick={() => setManageOpen(true)}>
						<Tags class="size-3.5" aria-hidden="true" /> Categorieën beheren
					</button>
					<button type="button" class="btn primary" onClick={() => setCreateOpen(true)}>
						<Plus class="size-3.5" aria-hidden="true" /> Nieuwe cursus
					</button>
				</div>
			</div>

			<div class="ds-row" style={{ "margin-bottom": "14px", gap: "8px", "flex-wrap": "wrap" }}>
				<div class="seg" role="group" aria-label="Soort cursus">
					<button
						type="button"
						class={tab() === "ondivera" ? "on" : ""}
						aria-pressed={tab() === "ondivera" ? "true" : "false"}
						onClick={() => setTab("ondivera")}
					>
						Ondivera-cursussen ({ondivera().length})
					</button>
					<button
						type="button"
						class={tab() === "school" ? "on" : ""}
						aria-pressed={tab() === "school" ? "true" : "false"}
						onClick={() => setTab("school")}
					>
						Cursussen van scholen ({schoolCourses().length})
					</button>
				</div>
				<div class="ds-grow" />
				<Select
					aria-label="Filter op categorie"
					options={categoryOptions()}
					value={category()}
					onChange={(v) => setCategory(v ?? ALL)}
					triggerClass="min-w-48"
				/>
				<Show
					when={tab() === "ondivera"}
					fallback={
						<Select
							aria-label="Filter op school"
							options={[
								{ value: ALL, label: "Alle scholen" },
								...props.organizations
									.filter((o) => o.kind === "school")
									.map((o) => ({ value: o.id, label: o.name })),
							]}
							value={school()}
							onChange={(v) => setSchool(v ?? ALL)}
							triggerClass="min-w-48"
						/>
					}
				>
					<Select
						aria-label="Filter op beschikbaarheid"
						options={[
							{ value: ALL, label: "Elke beschikbaarheid" },
							{ value: "ok", label: "Alle scholen" },
							{ value: "partial", label: "Geselecteerde scholen" },
							{ value: "none", label: "Nog niet beschikbaar" },
						]}
						value={availability()}
						onChange={(v) => setAvailability(v ?? ALL)}
						triggerClass="min-w-48"
					/>
				</Show>
				<label
					class="ds-row"
					style={{
						gap: "8px",
						padding: "7px 12px",
						background: "rgb(var(--surface))",
						"border-radius": "10px",
						border: "1px solid rgb(var(--line))",
					}}
				>
					<Search class="size-3.5" aria-hidden="true" style={{ color: "rgb(var(--muted))" }} />
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
						placeholder="Zoek cursus…"
						aria-label="Zoek cursus"
					/>
				</label>
			</div>

			<div>
				<div class="card" style={{ padding: "0", overflow: "hidden" }}>
					<div style={{ "overflow-x": "auto" }}>
						<div style={{ "min-width": "820px" }} role="table" aria-label="Cursussen">
							<div
								role="row"
								style={{
									display: "grid",
									"grid-template-columns": colTemplate(),
									"column-gap": "20px",
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
								<div role="columnheader">Cursus</div>
								<div role="columnheader">Categorieën</div>
								<div role="columnheader">{tab() === "ondivera" ? "Beschikbaar voor" : "School"}</div>
								<div role="columnheader">Gewijzigd</div>
								<div role="columnheader">
									<span class="sr-only">Acties</span>
								</div>
							</div>

							<For each={paged()}>
								{(c) => (
									<div
										role="row"
										style={{
											display: "grid",
											"grid-template-columns": colTemplate(),
											"column-gap": "20px",
											padding: "12px 20px",
											"border-bottom": "1px solid rgb(var(--line-2))",
											"align-items": "center",
										}}
									>
										<div role="cell" style={{ "min-width": "0" }}>
											<Link
												to="/cursussen/$courseId"
												params={{ courseId: c.id }}
												style={{ "font-weight": "500", "font-size": "0.875rem" }}
											>
												{c.title}
											</Link>
											<div
												style={{
													"font-size": "0.75rem",
													color: "rgb(var(--muted))",
													overflow: "hidden",
													"text-overflow": "ellipsis",
													"white-space": "nowrap",
												}}
											>
												{c.description || "Nog geen omschrijving"}
											</div>
										</div>
										<div role="cell" class="ds-row" style={{ gap: "4px", "flex-wrap": "wrap" }}>
											<For
												each={c.categoryIds}
												fallback={
													<span style={{ "font-size": "0.75rem", color: "rgb(var(--muted))" }}>
														—
													</span>
												}
											>
												{(id) => (
													<span class="chip" style={{ "font-size": "0.6875rem" }}>
														{categoryName().get(id) ?? "…"}
													</span>
												)}
											</For>
										</div>
										<div role="cell" style={{ "font-size": "0.8125rem" }}>
											<Show
												when={tab() === "ondivera"}
												fallback={<span>{schoolName().get(c.organizationId ?? "") ?? "—"}</span>}
											>
												<Show
													when={availabilityLabel(c).tone !== "none"}
													fallback={
														<span class="chip warning" style={{ "font-size": "0.6875rem" }}>
															Nog geen school
														</span>
													}
												>
													<span
														title={
															c.availability?.allSchools
																? undefined
																: c.availability?.organizationIds
																		.map((id) => schoolName().get(id) ?? "")
																		.join(", ")
														}
													>
														{availabilityLabel(c).text}
													</span>
												</Show>
											</Show>
										</div>
										<div
											role="cell"
											style={{ "font-size": "0.8125rem", color: "rgb(var(--muted))" }}
										>
											{formatDate(c.contentUpdatedAt)}
										</div>
										<div role="cell" class="ds-row" style={{ gap: "4px", "justify-content": "flex-end" }}>
											<Show when={tab() === "ondivera"}>
												<Tooltip content="Beschikbaar voor">
													{(trigger) => (
														<button
															{...trigger}
															type="button"
															class="icon-btn"
															style={{ width: "30px", height: "30px" }}
															aria-label={`Beschikbaarheid van ${c.title}`}
															onClick={() => setEditAvailability(c)}
														>
															<Building2 class="size-3.5" aria-hidden="true" />
														</button>
													)}
												</Tooltip>
												<Tooltip content="Categorieën">
													{(trigger) => (
														<button
															{...trigger}
															type="button"
															class="icon-btn"
															style={{ width: "30px", height: "30px" }}
															aria-label={`Categorieën van ${c.title}`}
															onClick={() => setEditCategories(c)}
														>
															<Tags class="size-3.5" aria-hidden="true" />
														</button>
													)}
												</Tooltip>
											</Show>
											<Tooltip content="Cursus openen">
												{(trigger) => (
													<Link
														{...trigger}
														to="/cursussen/$courseId"
														params={{ courseId: c.id }}
														class="icon-btn"
														style={{ width: "30px", height: "30px" }}
														aria-label={`${c.title} openen`}
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
										{search() || category() !== ALL || availability() !== ALL || school() !== ALL
											? "Geen cursussen gevonden met deze filters."
											: tab() === "ondivera"
												? "Nog geen Ondivera-cursussen. Maak de eerste aan met Nieuwe cursus."
												: "Scholen hebben nog geen eigen cursussen."}
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
						noun="cursussen"
						onPage={setPage}
					/>
				</div>
			</div>

			<CategoryManagerDialog
				open={manageOpen()}
				onOpenChange={setManageOpen}
				categories={props.categories}
			/>
			<CourseCategoriesDialog
				categories={props.categories}
				course={editCategories()}
				onClose={() => setEditCategories(null)}
				onManage={() => {
					setEditCategories(null);
					setManageOpen(true);
				}}
			/>
			<AvailabilityDialog
				organizations={props.organizations}
				course={editAvailability()}
				onClose={() => setEditAvailability(null)}
			/>
			<CreateCourseDialog open={createOpen()} onOpenChange={setCreateOpen} />
		</>
	);
}
