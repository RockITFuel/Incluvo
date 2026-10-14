import { createFileRoute } from "@tanstack/solid-router";
import { useQuery } from "@tanstack/solid-query";
import { Search, UserPlus } from "lucide-solid";
import { createMemo, createSignal, For, Show } from "solid-js";
import { dutchDate, personId } from "../../../components/people/format";
import { PersonFormDialog } from "../../../components/people/person-form-dialog";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { ErrorState } from "../../../components/ui/error-state";
import { Pagination } from "../../../components/ui/pagination";
import { requireRole } from "../../../lib/auth/require-role";
import { RequireRole } from "../../../lib/auth/role-guard";
import { useMe } from "../../../lib/auth/use-me";
import { orpc } from "../../../lib/orpc";

/**
 * Coaches (INC-16): the coaches of the keyuser's school, with "Coach
 * toevoegen" (INC-17). A new coach has no leerlingen until the keyuser links
 * them on the Leerlingen page.
 */
export const Route = createFileRoute("/_protected/coaches/")({
	beforeLoad: () => requireRole("keyuser", undefined, { only: ["keyuser"] }),
	component: () => (
		<RequireRole min="keyuser" only={["keyuser"]}>
			<CoachesPage />
		</RequireRole>
	),
});

const PAGE_SIZE = 20;

function CoachesPage() {
	const me = useMe();
	const query = useQuery(() => orpc.people.coaches.list.queryOptions());
	const [adding, setAdding] = createSignal(false);
	const [search, setSearch] = createSignal("");
	const [page, setPage] = createSignal(1);

	const filtered = createMemo(() => {
		const q = search().trim().toLowerCase();
		const rows = query.data ?? [];
		if (!q) return rows;
		return rows.filter((r) =>
			[r.name, r.email, personId("coach", r.number)].some((v) => v.toLowerCase().includes(q)),
		);
	});
	const pageCount = () => Math.max(1, Math.ceil(filtered().length / PAGE_SIZE));
	const current = () => Math.min(page(), pageCount());
	const paged = () => filtered().slice((current() - 1) * PAGE_SIZE, current() * PAGE_SIZE);

	return (
		<section class="flex flex-col gap-6" data-page-title="Coaches">
			<div class="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h1 class="font-head text-h1 text-ink">Coaches</h1>
					<p class="mt-1 text-body text-muted">
						De coaches van{" "}
						<strong class="text-ink-2">{me.organization()?.name ?? "jouw school"}</strong>.
					</p>
				</div>
				<Button onClick={() => setAdding(true)}>
					<UserPlus class="size-4" aria-hidden="true" /> Coach toevoegen
				</Button>
			</div>

			<Show when={query.error}>
				<ErrorState error={query.error} what="de coaches" onRetry={() => query.refetch()} />
			</Show>
			<Show when={query.isLoading}>
				<p class="text-muted">Laden…</p>
			</Show>

			<Show when={query.data && query.data.length === 0}>
				<Card class="flex flex-col items-start gap-3">
					<h2 class="font-head text-h3 text-ink">Nog geen coaches</h2>
					<p class="text-body text-ink-2">
						Voeg een coach toe. Die krijgt een e-mail om een wachtwoord te kiezen; daarna koppel je
						leerlingen aan de coach op de pagina Leerlingen.
					</p>
					<Button onClick={() => setAdding(true)}>Coach toevoegen</Button>
				</Card>
			</Show>

			<Show when={(query.data?.length ?? 0) > 0}>
				<label class="flex max-w-96 items-center gap-2 rounded-2 border border-line bg-surface px-3 py-2">
					<Search class="size-3.5 text-muted" aria-hidden="true" />
					<input
						value={search()}
						onInput={(e) => {
							setSearch(e.currentTarget.value);
							setPage(1);
						}}
						class="w-full bg-transparent text-small text-ink outline-none"
						placeholder="Zoek op naam, e-mail of ID…"
						aria-label="Zoek coach"
					/>
				</label>
				<Card padding="none" class="overflow-x-auto">
					<table class="w-full text-left text-small">
						<thead class="border-line border-b bg-bg-2 text-micro uppercase tracking-wide text-muted">
							<tr>
								<th scope="col" class="px-4 py-3 font-medium">ID</th>
								<th scope="col" class="px-4 py-3 font-medium">Coach</th>
								<th scope="col" class="px-4 py-3 font-medium">In dienst</th>
								<th scope="col" class="px-4 py-3 font-medium">Leerlingen</th>
								<th scope="col" class="px-4 py-3 font-medium">Vervangt</th>
								<th scope="col" class="px-4 py-3 font-medium">Status</th>
							</tr>
						</thead>
						<tbody>
							<For each={paged()}>
								{(r) => (
									<tr class="border-line-2 border-b last:border-b-0">
										<td class="whitespace-nowrap px-4 py-3 font-mono text-micro text-muted">
											{r.number === null ? "—" : personId("coach", r.number)}
										</td>
										<td class="px-4 py-3">
											<p class="font-medium text-ink">{r.name}</p>
											<p class="text-micro text-muted [overflow-wrap:anywhere]">{r.email}</p>
										</td>
										<td class="whitespace-nowrap px-4 py-3 text-ink-2">
											{dutchDate(r.startDate)}
											<Show when={r.endDate}>
												<span class="text-muted"> t/m {dutchDate(r.endDate)}</span>
											</Show>
										</td>
										<td class="px-4 py-3 text-ink-2">{r.leerlingen}</td>
										<td class="px-4 py-3 text-ink-2">{r.vervangingen}</td>
										<td class="px-4 py-3">
											<div class="flex flex-wrap gap-1.5">
												<Badge variant={r.status === "actief" ? "success" : "neutral"}>
													{r.status === "actief" ? "Actief" : "Inactief"}
												</Badge>
												<Show when={r.account === "invited"}>
													<Badge variant="warning">Uitgenodigd</Badge>
												</Show>
											</div>
										</td>
									</tr>
								)}
							</For>
						</tbody>
					</table>
					<Show when={filtered().length === 0}>
						<p class="px-4 py-6 text-muted">Geen coaches gevonden.</p>
					</Show>
					<Pagination
						page={current()}
						pageCount={pageCount()}
						pageSize={PAGE_SIZE}
						total={filtered().length}
						noun="coaches"
						onPage={setPage}
					/>
				</Card>
			</Show>

			<PersonFormDialog kind="coach" open={adding()} onOpenChange={setAdding} />
		</section>
	);
}
