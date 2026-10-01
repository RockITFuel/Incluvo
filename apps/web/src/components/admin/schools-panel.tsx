import { useQuery } from "@tanstack/solid-query";
import { Link } from "@tanstack/solid-router";
import { ArrowRight } from "lucide-solid";
import { createSignal, For, Show } from "solid-js";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { orpc } from "../../lib/orpc";
import { CreateSchoolDialog } from "./create-school-dialog";
import { formatDate, kindLabel } from "./format";

/**
 * Scholen / organisaties (#60) — superadmin only. Lists Ondivera + every school
 * with per-school stats and links to the school page, where rename, archive
 * and the school's users live (docs/decisions/superadmin-beheer.md). Backed by
 * the admin router's tenant-aggregations (`admin.organizations.listAll`).
 */
export function SchoolsPanel() {
	const [createOpen, setCreateOpen] = createSignal(false);

	const orgsQuery = useQuery(() =>
		orpc.admin.organizations.listAll.queryOptions(),
	);

	return (
		<section class="flex flex-col gap-4">
			<div class="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h2 class="font-head text-h3 text-ink">Scholen</h2>
					<p class="mt-1 text-small text-muted">
						Alle organisaties: Ondivera en de aangesloten scholen. Open een
						school om gebruikers uit te nodigen of de school te archiveren.
					</p>
				</div>
				<Button onClick={() => setCreateOpen(true)}>Nieuwe school</Button>
			</div>

			<Show when={orgsQuery.isLoading}>
				<p class="text-muted">Laden…</p>
			</Show>
			<Show when={orgsQuery.error}>
				<p class="text-danger">Kon organisaties niet laden.</p>
			</Show>

			<div class="grid gap-3 sm:grid-cols-2">
				<For each={orgsQuery.data}>
					{(o) => (
						<Card
							padding="md"
							class="flex flex-col gap-3"
							classList={{ "opacity-70": Boolean(o.archivedAt) }}
						>
							<div class="flex items-start justify-between gap-3">
								<div class="min-w-0">
									<p class="font-medium text-ink">{o.name}</p>
									<p class="text-micro text-muted">
										Aangemaakt {formatDate(o.createdAt)}
									</p>
								</div>
								<div class="flex flex-wrap justify-end gap-1.5">
									<Show when={o.archivedAt}>
										<Badge variant="neutral">Gearchiveerd</Badge>
									</Show>
									<Show
										when={
											o.kind === "school" &&
											!o.archivedAt &&
											o.stats.keyuserCount === 0
										}
									>
										<Badge variant="warning">Geen keyuser</Badge>
									</Show>
									<Badge
										variant={o.kind === "ondivera" ? "accent" : "primary"}
									>
										{kindLabel(o.kind)}
									</Badge>
								</div>
							</div>

							<dl class="grid grid-cols-3 gap-2 text-center">
								<Stat label="Keyusers" value={o.stats.keyuserCount} />
								<Stat label="Coaches" value={o.stats.coachCount} />
								<Stat label="Leerlingen" value={o.stats.leerlingCount} />
								<Stat
									label="Formulieren"
									value={o.stats.formTemplateCount}
								/>
								<Stat label="Cursussen" value={o.stats.courseCount} />
								<Stat label="Plannen wachten" value={o.stats.plansWaiting} />
							</dl>

							<div class="flex justify-end">
								<Link
									to="/beheer/scholen/$organizationId"
									params={{ organizationId: o.id }}
									class="inline-flex items-center gap-1.5 rounded-2 px-3 py-1.5 text-small font-medium text-primary-700 hover:bg-primary-50"
								>
									Open {o.kind === "school" ? "school" : "organisatie"}
									<ArrowRight class="size-3.5" aria-hidden="true" />
								</Link>
							</div>
						</Card>
					)}
				</For>
			</div>

			<CreateSchoolDialog open={createOpen()} onOpenChange={setCreateOpen} />
		</section>
	);
}

function Stat(props: { label: string; value: number }) {
	return (
		<div class="rounded-2 bg-bg-2 px-2 py-2">
			<dd class="font-head text-h3 text-ink">{props.value}</dd>
			<dt class="text-micro text-muted">{props.label}</dt>
		</div>
	);
}
