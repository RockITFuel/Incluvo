import { createFileRoute } from "@tanstack/solid-router";
import { useQuery } from "@tanstack/solid-query";
import { Search, UserPlus } from "lucide-solid";
import { createMemo, createSignal, For, Show } from "solid-js";
import { dutchDate, personId } from "../../../components/people/format";
import { KoppelDialog } from "../../../components/people/koppel-dialog";
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
 * Leerlingen (INC-16): the keyuser's overview of the leerlingen of their
 * school, with "Leerling toevoegen" (INC-15) and who coaches them (INC-18).
 */
export const Route = createFileRoute("/_protected/leerlingen/")({
	beforeLoad: () => requireRole("keyuser", undefined, { only: ["keyuser"] }),
	component: () => (
		<RequireRole min="keyuser" only={["keyuser"]}>
			<LeerlingenPage />
		</RequireRole>
	),
});

const PAGE_SIZE = 20;

type Row = NonNullable<ReturnType<typeof useLeerlingen>["data"]>[number];
function useLeerlingen() {
	return useQuery(() => orpc.people.leerlingen.list.queryOptions());
}

function LeerlingenPage() {
	const me = useMe();
	const query = useLeerlingen();
	const [adding, setAdding] = createSignal(false);
	const [koppel, setKoppel] = createSignal<Row | null>(null);
	const [search, setSearch] = createSignal("");
	const [page, setPage] = createSignal(1);

	const filtered = createMemo(() => {
		const q = search().trim().toLowerCase();
		const rows = query.data ?? [];
		if (!q) return rows;
		return rows.filter((r) =>
			[r.name, r.email, personId("leerling", r.number), r.vasteCoach?.name, r.vervanger?.name]
				.filter(Boolean)
				.some((v) => v!.toLowerCase().includes(q)),
		);
	});
	const pageCount = () => Math.max(1, Math.ceil(filtered().length / PAGE_SIZE));
	const current = () => Math.min(page(), pageCount());
	const paged = () => filtered().slice((current() - 1) * PAGE_SIZE, current() * PAGE_SIZE);

	// After adding, the keyuser can link a coach straight away (INC-15 AC4).
	const afterCreate = async (created: { id: string }) => {
		const { data } = await query.refetch();
		const row = data?.find((r) => r.id === created.id);
		if (row) setKoppel(row);
	};

	return (
		<section class="flex flex-col gap-6" data-page-title="Leerlingen">
			<div class="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h1 class="font-head text-h1 text-ink">Leerlingen</h1>
					<p class="mt-1 text-body text-muted">
						De leerlingen van{" "}
						<strong class="text-ink-2">{me.organization()?.name ?? "jouw school"}</strong> en wie
						ze begeleidt.
					</p>
				</div>
				<Button onClick={() => setAdding(true)}>
					<UserPlus class="size-4" aria-hidden="true" /> Leerling toevoegen
				</Button>
			</div>

			<Show when={query.error}>
				<ErrorState error={query.error} what="de leerlingen" onRetry={() => query.refetch()} />
			</Show>
			<Show when={query.isLoading}>
				<p class="text-muted">Laden…</p>
			</Show>

			{/* AC7: an empty school explains what to do. */}
			<Show when={query.data && query.data.length === 0}>
				<Card class="flex flex-col items-start gap-3">
					<h2 class="font-head text-h3 text-ink">Nog geen leerlingen</h2>
					<p class="text-body text-ink-2">
						Voeg een leerling toe. Die krijgt een e-mail om een wachtwoord te kiezen; daarna koppel
						je een coach die de leerling begeleidt.
					</p>
					<Button onClick={() => setAdding(true)}>Leerling toevoegen</Button>
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
						placeholder="Zoek op naam, e-mail, ID of coach…"
						aria-label="Zoek leerling"
					/>
				</label>
				<Card padding="none" class="overflow-x-auto">
					<table class="w-full text-left text-small">
						<thead class="border-line border-b bg-bg-2 text-micro uppercase tracking-wide text-muted">
							<tr>
								<th scope="col" class="px-4 py-3 font-medium">ID</th>
								<th scope="col" class="px-4 py-3 font-medium">Leerling</th>
								<th scope="col" class="px-4 py-3 font-medium">Vaste coach</th>
								<th scope="col" class="px-4 py-3 font-medium">Vervanger</th>
								<th scope="col" class="px-4 py-3 font-medium">Start</th>
								<th scope="col" class="px-4 py-3 font-medium">Status</th>
								<th scope="col" class="px-4 py-3">
									<span class="sr-only">Acties</span>
								</th>
							</tr>
						</thead>
						<tbody>
							<For each={paged()}>
								{(r) => (
									<tr class="border-line-2 border-b last:border-b-0">
										<td class="whitespace-nowrap px-4 py-3 font-mono text-micro text-muted">
											{r.number === null ? "—" : personId("leerling", r.number)}
										</td>
										<td class="px-4 py-3">
											<p class="font-medium text-ink">{r.name}</p>
											<p class="text-micro text-muted [overflow-wrap:anywhere]">{r.email}</p>
										</td>
										<td class="px-4 py-3 text-ink-2">
											{r.vasteCoach?.name ?? <span class="text-muted">Nog geen coach</span>}
										</td>
										<td class="px-4 py-3 text-ink-2">
											{r.vervanger?.name ?? <span class="text-muted">—</span>}
										</td>
										<td class="whitespace-nowrap px-4 py-3 text-ink-2">{dutchDate(r.startDate)}</td>
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
										<td class="px-4 py-3 text-right">
											<Button size="sm" variant="ghost" onClick={() => setKoppel(r)}>
												Coach koppelen
											</Button>
										</td>
									</tr>
								)}
							</For>
						</tbody>
					</table>
					<Show when={filtered().length === 0}>
						<p class="px-4 py-6 text-muted">Geen leerlingen gevonden.</p>
					</Show>
					<Pagination
						page={current()}
						pageCount={pageCount()}
						pageSize={PAGE_SIZE}
						total={filtered().length}
						noun="leerlingen"
						onPage={setPage}
					/>
				</Card>
			</Show>

			<PersonFormDialog
				kind="leerling"
				open={adding()}
				onOpenChange={setAdding}
				onCreated={(c) => void afterCreate(c)}
			/>
			<KoppelDialog leerling={koppel()} onOpenChange={(open) => !open && setKoppel(null)} />
		</section>
	);
}
