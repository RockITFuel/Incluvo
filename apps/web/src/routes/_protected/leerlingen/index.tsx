import { createFileRoute, useRouter } from "@tanstack/solid-router";
import { Search, UserPlus } from "../../../lib/icons";
import { createMemo, createSignal, For, Show } from "solid-js";
import { dutchDate, personId } from "../../../components/people/format";
import { KoppelDialog } from "../../../components/people/koppel-dialog";
import { PersonFormDialog } from "../../../components/people/person-form-dialog";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { Pagination } from "../../../components/ui/pagination";
import { RouteDataView } from "../../../components/ui/route-data-view";
import { requireRole } from "../../../lib/auth/role-guard";
import { useMe } from "../../../lib/auth/use-me";
import { client, type Output } from "../../../lib/orpc";
import { refresh } from "../../../lib/refresh";
import { granted, loadRouteData } from "../../../lib/route-data";

/**
 * Leerlingen (INC-16): the keyuser's overview of the leerlingen of their
 * school, with "Leerling toevoegen" (INC-15) and who coaches them (INC-18).
 */
export const Route = createFileRoute("/_protected/leerlingen/")({
	beforeLoad: ({ context }) => requireRole(context.me, { min: "keyuser", only: ["keyuser"] }),
	loader: async ({ abortController }) => ({
		leerlingen: await loadRouteData(abortController.signal, (s) =>
			client.people.leerlingen.list(undefined, { signal: s }),
		),
	}),
	component: LeerlingenPage,
});

const PAGE_SIZE = 20;

type Row = Output<typeof client.people.leerlingen.list>[number];

function LeerlingenPage() {
	const me = useMe();
	const router = useRouter();
	const data = Route.useLoaderData();
	const all = () => granted(data().leerlingen) ?? [];
	const [adding, setAdding] = createSignal(false);
	const [koppel, setKoppel] = createSignal<Row | null>(null);
	const [search, setSearch] = createSignal("");
	// Back to the first page whenever the search changes.
	const [page, setPage] = createSignal(() => (search(), 1));

	const filtered = createMemo(() => {
		const q = search().trim().toLowerCase();
		const rows = all();
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
	// The dialog awaited the refresh, so the new leerling is in the list.
	const afterCreate = (created: { id: string }) => {
		const row = all().find((r) => r.id === created.id);
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

			<Show when={data().leerlingen.access !== "granted"}>
				<RouteDataView data={data().leerlingen} what="de leerlingen" onRetry={() => void refresh(router, "people")}>
					{() => null}
				</RouteDataView>
			</Show>

			{/* AC7: an empty school explains what to do. */}
			<Show when={data().leerlingen.access === "granted" && all().length === 0}>
				<Card class="flex flex-col items-start gap-3">
					<h2 class="font-head text-h3 text-ink">Nog geen leerlingen</h2>
					<p class="text-body text-ink-2">
						Voeg een leerling toe. Die krijgt een e-mail om een wachtwoord te kiezen; daarna koppel
						je een coach die de leerling begeleidt.
					</p>
					<Button onClick={() => setAdding(true)}>Leerling toevoegen</Button>
				</Card>
			</Show>

			<Show when={all().length > 0}>
				<label class="flex max-w-96 items-center gap-2 rounded-2 border border-line bg-surface px-3 py-2">
					<Search class="size-3.5 text-muted" aria-hidden="true" />
					<input
						value={search()}
						onInput={(e) => setSearch(e.currentTarget.value)}
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
				onCreated={afterCreate}
			/>
			<KoppelDialog leerling={koppel()} onOpenChange={(open) => !open && setKoppel(null)} />
		</section>
	);
}
