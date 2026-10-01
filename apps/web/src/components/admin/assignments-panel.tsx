import {
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/solid-query";
import { Search, X } from "lucide-solid";
import {
	createEffect,
	createMemo,
	createSignal,
	For,
	on,
	Show,
} from "solid-js";
import { Card } from "../ui/card";
import { Pagination } from "../ui/pagination";
import { Select } from "../ui/select";
import { toast } from "../ui/toast";
import { useMe } from "../../lib/auth/use-me";
import { orpc } from "../../lib/orpc";

const PAGE_SIZE = 20;

type Filter = "all" | "without";

/**
 * Koppelingen (FIX-PLAN phase 3): which coach coaches which leerling. The link
 * is what gives a coach access to a leerling's plan, taken, chat and courses,
 * so a school can't work without it.
 *
 * keyuser: their own school. superadmin: picks a school here, or the panel is
 * pinned to one with `organizationId` (the school page).
 */
export function AssignmentsPanel(props: {
	organizationId?: string;
	readOnly?: boolean;
}) {
	const me = useMe();
	const queryClient = useQueryClient();
	const [school, setSchool] = createSignal<string | undefined>();
	const [filter, setFilter] = createSignal<Filter>("all");
	const [search, setSearch] = createSignal("");
	const [page, setPage] = createSignal(1);

	/** Superadmin without a pinned school chooses one first. */
	const choosesSchool = () => me.is("superadmin") && !props.organizationId;
	const scopeId = () => props.organizationId ?? (choosesSchool() ? school() : undefined);

	const orgs = useQuery(() => ({
		...orpc.admin.organizations.listAll.queryOptions(),
		enabled: choosesSchool(),
	}));

	const list = useQuery(() => ({
		...orpc.admin.assignments.list.queryOptions({
			input: { organizationId: scopeId() },
		}),
		enabled: !choosesSchool() || scopeId() !== undefined,
	}));

	const coachName = createMemo(() => {
		const m = new Map<string, string>();
		for (const c of list.data?.coaches ?? []) m.set(c.id, c.name);
		return m;
	});

	const withoutCoach = createMemo(
		() => (list.data?.leerlingen ?? []).filter((l) => l.coachIds.length === 0).length,
	);

	const filtered = createMemo(() => {
		let rows = list.data?.leerlingen ?? [];
		if (filter() === "without") rows = rows.filter((l) => l.coachIds.length === 0);
		const q = search().trim().toLowerCase();
		if (q) {
			rows = rows.filter(
				(l) =>
					l.name.toLowerCase().includes(q) ||
					l.email.toLowerCase().includes(q) ||
					l.coachIds.some((id) => coachName().get(id)?.toLowerCase().includes(q)),
			);
		}
		return rows;
	});
	createEffect(on([filter, search, school], () => setPage(1), { defer: true }));
	const pageCount = createMemo(() =>
		Math.max(1, Math.ceil(filtered().length / PAGE_SIZE)),
	);
	const currentPage = createMemo(() => Math.min(page(), pageCount()));
	const paged = createMemo(() => {
		const start = (currentPage() - 1) * PAGE_SIZE;
		return filtered().slice(start, start + PAGE_SIZE);
	});

	const set = useMutation(() =>
		orpc.admin.assignments.set.mutationOptions({
			onSuccess: (_res, vars) => {
				queryClient.invalidateQueries({ queryKey: orpc.admin.assignments.key() });
				queryClient.invalidateQueries({ queryKey: orpc.dashboard.key() });
				toast({
					title: vars.assigned ? "Coach gekoppeld" : "Coach ontkoppeld",
					tone: "success",
				});
			},
			onError: (error) =>
				toast({
					title: "Koppelen mislukt",
					description: error.message,
					tone: "danger",
				}),
		}),
	);

	return (
		<section class="flex flex-col gap-4">
			<div>
				<h2 class="font-head text-h3 text-ink">Koppelingen</h2>
				<p class="mt-1 text-small text-muted">
					Welke coach begeleidt welke leerling. Een coach ziet alleen de
					leerlingen die aan hem of haar gekoppeld zijn.
				</p>
			</div>

			<div class="flex flex-wrap items-center gap-3">
				<Show when={choosesSchool()}>
					<Select
						aria-label="School"
						placeholder="Kies een school"
						options={(orgs.data ?? [])
							.filter((o) => o.kind === "school")
							.map((o) => ({
								value: o.id,
								label: o.archivedAt ? `${o.name} (gearchiveerd)` : o.name,
							}))}
						value={school()}
						onChange={setSchool}
						triggerClass="min-w-52"
					/>
				</Show>
				<Show when={list.data}>
					<div class="seg" role="group" aria-label="Filter leerlingen">
						<button
							type="button"
							class={filter() === "all" ? "on" : ""}
							aria-pressed={filter() === "all"}
							onClick={() => setFilter("all")}
						>
							Alle leerlingen ({list.data?.leerlingen.length ?? 0})
						</button>
						<button
							type="button"
							class={filter() === "without" ? "on" : ""}
							aria-pressed={filter() === "without"}
							onClick={() => setFilter("without")}
						>
							Zonder coach ({withoutCoach()})
						</button>
					</div>
					<label class="flex min-w-60 flex-1 items-center gap-2 rounded-2 border border-line bg-surface px-3 py-2 sm:max-w-80">
						<Search class="size-3.5 text-muted" aria-hidden="true" />
						<input
							value={search()}
							onInput={(e) => setSearch(e.currentTarget.value)}
							class="w-full bg-transparent text-small text-ink outline-none"
							placeholder="Zoek leerling of coach…"
							aria-label="Zoek leerling of coach"
						/>
					</label>
				</Show>
			</div>

			<Show when={choosesSchool() && !school()}>
				<p class="text-muted">Kies een school om de koppelingen te zien.</p>
			</Show>
			<Show when={list.isLoading && list.fetchStatus !== "idle"}>
				<p class="text-muted">Laden…</p>
			</Show>
			<Show when={list.error}>
				<p class="text-danger">Kon de koppelingen niet laden.</p>
			</Show>

			<Show when={list.data}>
				{(data) => (
					<>
						<Show when={data().coaches.length === 0}>
							<Card padding="sm" class="text-small text-muted">
								Deze school heeft nog geen coaches. Nodig eerst een coach uit
								onder Gebruikers.
							</Card>
						</Show>
						<Show when={data().leerlingen.length === 0}>
							<p class="text-muted">Deze school heeft nog geen leerlingen.</p>
						</Show>
						<Show when={data().leerlingen.length > 0 && filtered().length === 0}>
							<p class="text-muted">
								{search()
									? "Geen leerlingen gevonden."
									: "Elke leerling heeft een coach."}
							</p>
						</Show>

						<Show when={filtered().length > 0}>
							<Card padding="none" class="overflow-hidden">
								<ul>
									<For each={paged()}>
										{(l) => (
											<li class="flex flex-wrap items-center justify-between gap-3 border-line-2 border-b px-4 py-3 last:border-b-0">
												<div class="min-w-0">
													<p class="font-medium text-ink">{l.name}</p>
													<p class="truncate text-small text-muted">{l.email}</p>
												</div>
												<div class="flex flex-wrap items-center justify-end gap-2">
													<Show
														when={l.coachIds.length > 0}
														fallback={
															<span class="chip warning" style={{ "font-size": "0.75rem" }}>
																Geen coach
															</span>
														}
													>
														<ul class="flex flex-wrap gap-1.5" aria-label={`Coaches van ${l.name}`}>
															<For each={l.coachIds}>
																{(coachId) => (
																	<li class="chip primary" style={{ "font-size": "0.75rem" }}>
																		{coachName().get(coachId) ?? "Onbekende coach"}
																		<Show when={!props.readOnly}>
																			<button
																				type="button"
																				class="-mr-1 ml-0.5 rounded-full p-0.5 hover:bg-primary-100"
																				aria-label={`Ontkoppel ${coachName().get(coachId) ?? "coach"} van ${l.name}`}
																				disabled={set.isPending}
																				onClick={() =>
																					set.mutate({
																						coachId,
																						leerlingId: l.id,
																						assigned: false,
																					})
																				}
																			>
																				<X class="size-3" aria-hidden="true" />
																			</button>
																		</Show>
																	</li>
																)}
															</For>
														</ul>
													</Show>
													<Show
														when={
															!props.readOnly &&
															data().coaches.some((c) => !l.coachIds.includes(c.id))
														}
													>
														<Select
															aria-label={`Coach koppelen aan ${l.name}`}
															placeholder="Coach koppelen"
															options={data()
																.coaches.filter((c) => !l.coachIds.includes(c.id))
																.map((c) => ({ value: c.id, label: c.name }))}
															value={undefined}
															disabled={set.isPending}
															triggerClass="min-w-44"
															onChange={(coachId) => {
																if (coachId) {
																	set.mutate({
																		coachId,
																		leerlingId: l.id,
																		assigned: true,
																	});
																}
															}}
														/>
													</Show>
												</div>
											</li>
										)}
									</For>
								</ul>
								<Pagination
									page={currentPage()}
									pageCount={pageCount()}
									pageSize={PAGE_SIZE}
									total={filtered().length}
									noun="leerlingen"
									onPage={setPage}
								/>
							</Card>
						</Show>
					</>
				)}
			</Show>
		</section>
	);
}
