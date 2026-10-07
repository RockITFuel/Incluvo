import { useMutation, useQuery, useQueryClient } from "@tanstack/solid-query";
import { Search } from "lucide-solid";
import { createEffect, createMemo, createSignal, For, on, Show } from "solid-js";
import { friendlyError } from "../../lib/errors";
import { orpc } from "../../lib/orpc";
import { Card } from "../ui/card";
import { ErrorState } from "../ui/error-state";
import { Pagination } from "../ui/pagination";
import { Select } from "../ui/select";
import { Switch } from "../ui/switch";
import { toast } from "../ui/toast";
import { CoursesPanel } from "./templates-panel";

const PAGE_SIZE = 20;
const ALL = "__all__";

/**
 * A school's courses on its school page (superadmin): which Ondivera courses
 * this school may use — one switch per course — and the school's own courses.
 * The per-course view of the same setting is the catalogue (/beheer/cursussen).
 */
export function SchoolCoursesPanel(props: { organizationId: string; readOnly?: boolean }) {
	const queryClient = useQueryClient();
	const courses = useQuery(() => orpc.courses.list.queryOptions({ input: {} }));
	const categories = useQuery(() => orpc.courses.catalog.categories.list.queryOptions());
	const [search, setSearch] = createSignal("");
	const [category, setCategory] = createSignal(ALL);
	const [onlyAvailable, setOnlyAvailable] = createSignal(ALL);
	const [page, setPage] = createSignal(1);

	const availableHere = (c: {
		availability: { allSchools: boolean; organizationIds: string[] } | null;
	}) => Boolean(c.availability?.allSchools || c.availability?.organizationIds.includes(props.organizationId));

	const templates = createMemo(() =>
		(courses.data ?? []).filter((c) => c.kind === "ondivera_template"),
	);
	const availableCount = createMemo(() => templates().filter(availableHere).length);

	const filtered = createMemo(() => {
		let rows = templates();
		const q = search().trim().toLowerCase();
		if (q) rows = rows.filter((c) => c.title.toLowerCase().includes(q));
		if (category() !== ALL) rows = rows.filter((c) => c.categoryIds.includes(category()));
		if (onlyAvailable() === "yes") rows = rows.filter(availableHere);
		if (onlyAvailable() === "no") rows = rows.filter((c) => !availableHere(c));
		return rows;
	});
	createEffect(on([search, category, onlyAvailable], () => setPage(1), { defer: true }));
	const pageCount = createMemo(() => Math.max(1, Math.ceil(filtered().length / PAGE_SIZE)));
	const currentPage = createMemo(() => Math.min(page(), pageCount()));
	const paged = createMemo(() => {
		const start = (currentPage() - 1) * PAGE_SIZE;
		return filtered().slice(start, start + PAGE_SIZE);
	});

	const toggle = useMutation(() =>
		orpc.courses.catalog.availability.setForSchool.mutationOptions({
			onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.courses.list.key() }),
			onError: (error) =>
				toast({ title: "Opslaan mislukt", description: friendlyError(error), tone: "danger" }),
		}),
	);

	return (
		<div class="flex flex-col gap-8">
			<section class="flex flex-col gap-4">
				<div>
					<h2 class="font-head text-h3 text-ink">Ondivera-cursussen</h2>
					<p class="mt-1 text-small text-muted">
						{availableCount()} van {templates().length} cursussen zijn beschikbaar voor deze
						school. Een cursus die voor alle scholen openstaat, kun je hier voor deze school
						uitzetten; de andere scholen houden hem.
					</p>
				</div>

				<div class="flex flex-wrap items-center gap-3">
					<label class="flex min-w-60 flex-1 items-center gap-2 rounded-2 border border-line bg-surface px-3 py-2 sm:max-w-80">
						<Search class="size-3.5 text-muted" aria-hidden="true" />
						<input
							value={search()}
							onInput={(e) => setSearch(e.currentTarget.value)}
							class="w-full bg-transparent text-small text-ink outline-none"
							placeholder="Zoek cursus…"
							aria-label="Zoek cursus"
						/>
					</label>
					<Select
						aria-label="Filter op categorie"
						options={[
							{ value: ALL, label: "Alle categorieën" },
							...(categories.data ?? []).map((c) => ({ value: c.id, label: c.name })),
						]}
						value={category()}
						onChange={(v) => setCategory(v ?? ALL)}
						triggerClass="min-w-48"
					/>
					<Select
						aria-label="Filter op beschikbaarheid"
						options={[
							{ value: ALL, label: "Alle cursussen" },
							{ value: "yes", label: "Beschikbaar" },
							{ value: "no", label: "Niet beschikbaar" },
						]}
						value={onlyAvailable()}
						onChange={(v) => setOnlyAvailable(v ?? ALL)}
						triggerClass="min-w-44"
					/>
				</div>

				<Show when={courses.error}>
					<ErrorState error={courses.error} what="de cursussen" onRetry={() => courses.refetch()} />
				</Show>
				<Show when={courses.data && filtered().length === 0}>
					<p class="text-muted">
						{templates().length === 0 ? "Er zijn nog geen Ondivera-cursussen." : "Geen cursussen gevonden."}
					</p>
				</Show>
				<Show when={filtered().length > 0}>
					<Card padding="none" class="overflow-hidden">
						<ul>
							<For each={paged()}>
								{(c) => (
									<li class="flex items-center justify-between gap-4 border-line-2 border-b px-4 py-3 last:border-b-0">
										<div class="min-w-0">
											<p class="font-medium text-ink">{c.title}</p>
											<p class="text-micro text-muted">
												{c.availability?.allSchools
													? "Beschikbaar voor alle scholen"
													: (c.availability?.organizationIds.length ?? 0) === 1
														? "1 school"
														: `${c.availability?.organizationIds.length ?? 0} scholen`}
											</p>
										</div>
										<Switch
											aria-label={`${c.title} beschikbaar voor deze school`}
											checked={availableHere(c)}
											disabled={toggle.isPending || props.readOnly}
											onChange={(available) =>
												toggle.mutate({
													courseId: c.id,
													organizationId: props.organizationId,
													available,
												})
											}
										/>
									</li>
								)}
							</For>
						</ul>
						<Pagination
							page={currentPage()}
							pageCount={pageCount()}
							pageSize={PAGE_SIZE}
							total={filtered().length}
							noun="cursussen"
							onPage={setPage}
						/>
					</Card>
				</Show>
			</section>

			<CoursesPanel organizationId={props.organizationId} />
		</div>
	);
}
