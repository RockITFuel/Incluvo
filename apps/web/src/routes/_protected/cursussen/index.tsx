import { createFileRoute, Link, useNavigate } from "@tanstack/solid-router";
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { BookOpen, Compass, FlaskConical, Plus, Search } from "lucide-solid";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { CreateCourseDialog } from "../../../components/admin/create-course-dialog";
import { Select } from "../../../components/ui/select";
import { useMe } from "../../../lib/auth/use-me";
import { orpc } from "../../../lib/orpc";
import { useServerEvent } from "../../../lib/sse/use-events";
import { ErrorState } from "../../../components/ui/error-state";

/**
 * Cursussen overzicht (#23) — a 1:1 port of the approved "Cursussen" prototype.
 * A leerling sees their own courses; an ontwikkelaar/keyuser/coach sees the
 * templates + school courses they can build or follow. Ontwikkelaar+ can create
 * a new course here. Each card links to the course view.
 *
 * The card layout is the prototype's; the per-card accent colour and header icon
 * are a deterministic cycle by index (we have no per-course subject colour). The
 * course list endpoint carries no per-leerling voortgang, so cards show no
 * progress — the real percentage is computed on the course view once opened.
 */
export const Route = createFileRoute("/_protected/cursussen/")({
	component: CursussenPage,
});

const kindLabel: Record<string, string> = {
	ondivera_template: "Ondivera-sjabloon",
	school_template: "Schooltemplate",
	student_execution: "Mijn cursus",
};

/** Deterministic accent cycle by card index — the prototype's primary/accent/warning tones. */
const tones = [
	{ bg: "rgb(var(--primary-100))", fg: "rgb(var(--primary))", icon: BookOpen },
	{ bg: "rgb(var(--accent-100))", fg: "rgb(var(--accent-700))", icon: FlaskConical },
	{ bg: "rgb(var(--warning-100))", fg: "rgb(var(--warning))", icon: Compass },
] as const;

const ALL = "__all__";

function CursussenPage() {
	const me = useMe();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const coursesQuery = useQuery(() => orpc.courses.list.queryOptions({ input: {} }));
	const [createOpen, setCreateOpen] = createSignal(false);
	const [search, setSearch] = createSignal("");
	const [category, setCategory] = createSignal(ALL);

	// Ondivera manages its courses in the catalogue (/beheer/cursussen).
	// Once: navigating re-runs the effect mid-transition and would loop.
	let redirected = false;
	createEffect(() => {
		if (!redirected && me.is("superadmin")) {
			redirected = true;
			navigate({ to: "/beheer/cursussen", replace: true });
		}
	});

	useServerEvent("course.changed", () =>
		queryClient.invalidateQueries({ queryKey: orpc.courses.list.key() }),
	);

	// Search + category filter for those who see templates (not a leerling).
	const canFilter = () => !me.is("leerling") && (coursesQuery.data?.length ?? 0) > 0;
	const categories = useQuery(() => ({
		...orpc.courses.catalog.categories.list.queryOptions(),
		enabled: me.role() !== null && !me.is("leerling"),
	}));
	const usedCategories = createMemo(() => {
		const used = new Set((coursesQuery.data ?? []).flatMap((c) => c.categoryIds));
		return (categories.data ?? []).filter((c) => used.has(c.id));
	});
	const shown = createMemo(() => {
		let rows = coursesQuery.data ?? [];
		const q = search().trim().toLowerCase();
		if (q) rows = rows.filter((c) => c.title.toLowerCase().includes(q));
		if (category() !== ALL) rows = rows.filter((c) => c.categoryIds.includes(category()));
		return rows;
	});

	return (
		<>
			<div class="page-head">
				<div>
					<h1>Cursussen</h1>
					<div class="sub">Jouw cursussen, op jouw manier ingesteld.</div>
				</div>
				<div class="ds-row">
					<Show when={(coursesQuery.data?.length ?? 0) > 0}>
						<span class="chip">{coursesQuery.data?.length} actief</span>
					</Show>
					<Show when={me.canBuildCourses()}>
						<button type="button" class="btn primary" onClick={() => setCreateOpen(true)}>
							<Plus class="size-3.5" aria-hidden="true" /> Nieuwe cursus
						</button>
						<CreateCourseDialog open={createOpen()} onOpenChange={setCreateOpen} />
					</Show>
				</div>
			</div>

			<Show when={coursesQuery.isLoading}>
				<p class="text-muted">Laden…</p>
			</Show>
			<Show when={coursesQuery.error}>
				<ErrorState
					error={coursesQuery.error}
					what="de cursussen"
					onRetry={() => coursesQuery.refetch()}
				/>
			</Show>
			<Show when={coursesQuery.data?.length === 0}>
				<div class="card" style={{ "text-align": "center", color: "rgb(var(--muted))" }}>
					Nog geen cursussen.
				</div>
			</Show>

			<Show when={canFilter()}>
				<div class="ds-row" style={{ "margin-bottom": "16px", gap: "8px", "flex-wrap": "wrap" }}>
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
					<Show when={usedCategories().length > 0}>
						<Select
							aria-label="Filter op categorie"
							options={[
								{ value: ALL, label: "Alle categorieën" },
								...usedCategories().map((c) => ({ value: c.id, label: c.name })),
							]}
							value={category()}
							onChange={(v) => setCategory(v ?? ALL)}
							triggerClass="min-w-48"
						/>
					</Show>
				</div>
			</Show>
			<Show when={canFilter() && shown().length === 0}>
				<p class="text-muted">Geen cursussen gevonden met deze filters.</p>
			</Show>

			<div
				class="ds-grid-cards"
			>
				<For each={shown()}>
					{(c, i) => {
						const tone = tones[i() % tones.length]!;
						return (
							<Link
								to="/cursussen/$courseId"
								params={{ courseId: c.id }}
								style={{ "text-decoration": "none", color: "inherit" }}
							>
								<div class="card lift" style={{ padding: "0", overflow: "hidden" }}>
									<div
										style={{
											height: "96px",
											background: tone.bg,
											position: "relative",
											display: "grid",
											"place-items": "center",
										}}
									>
										<tone.icon
											style={{ width: "32px", height: "32px", color: tone.fg }}
											aria-hidden="true"
										/>
										<span
											class="chip"
											style={{
												position: "absolute",
												top: "10px",
												right: "10px",
												background: "rgb(255 255 255 / 0.85)",
											}}
										>
											{c.kind === "student_execution" && !me.is("leerling")
												? "Van een leerling"
												: kindLabel[c.kind]}
										</span>
									</div>
									<div style={{ padding: "16px" }}>
										<h2 style={{ "font-size": "1.0625rem", "margin-bottom": "6px" }}>
											{c.title}
										</h2>
										<div
											style={{
												"font-size": "0.8125rem",
												color: "rgb(var(--muted))",
												"margin-bottom": "12px",
												display: "-webkit-box",
												"-webkit-line-clamp": "2",
												"-webkit-box-orient": "vertical",
												overflow: "hidden",
											}}
										>
											<Show
												when={c.description}
												fallback={<>Nog geen omschrijving.</>}
											>
												{c.description}
											</Show>
										</div>
										<div
											class="ds-row ds-between"
											style={{ "font-size": "0.75rem", color: "rgb(var(--muted))" }}
										>
											<span>Bekijk cursus →</span>
										</div>
									</div>
								</div>
							</Link>
						);
					}}
				</For>
			</div>
		</>
	);
}
