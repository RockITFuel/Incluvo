import {
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/solid-query";
import { createSignal, For, Show } from "solid-js";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Dialog } from "../ui/dialog";
import { Input } from "../ui/text-field";
import { toast } from "../ui/toast";
import { orpc } from "../../lib/orpc";
import { formatDate, kindLabel } from "./format";

/**
 * Scholen / organisaties (#60) — superadmin only. Lists Ondivera + every school
 * with per-school stats, lets the superadmin create a new school (kind=school,
 * parent=Ondivera) and rename an existing one. Backed by the admin router's
 * tenant-aggregations (`admin.organizations.listAll`).
 */
export function SchoolsPanel() {
	const queryClient = useQueryClient();
	const [createOpen, setCreateOpen] = createSignal(false);
	const [newName, setNewName] = createSignal("");
	const [editId, setEditId] = createSignal<string | null>(null);
	const [editName, setEditName] = createSignal("");

	const orgsQuery = useQuery(() =>
		orpc.admin.organizations.listAll.queryOptions(),
	);

	const invalidate = () =>
		queryClient.invalidateQueries({
			queryKey: orpc.admin.organizations.listAll.key(),
		});

	const create = useMutation(() =>
		orpc.admin.organizations.createSchool.mutationOptions({
			onSuccess: () => {
				invalidate();
				setCreateOpen(false);
				setNewName("");
				toast({ title: "School aangemaakt", tone: "success" });
			},
			onError: () =>
				toast({ title: "Aanmaken mislukt", tone: "danger" }),
		}),
	);

	const update = useMutation(() =>
		orpc.admin.organizations.update.mutationOptions({
			onSuccess: () => {
				invalidate();
				setEditId(null);
				toast({ title: "Opgeslagen", tone: "success" });
			},
			onError: () =>
				toast({ title: "Opslaan mislukt", tone: "danger" }),
		}),
	);

	return (
		<section class="flex flex-col gap-4">
			<div class="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h2 class="font-head text-h3 text-ink">Scholen</h2>
					<p class="mt-1 text-small text-muted">
						Beheer alle organisaties: Ondivera en de aangesloten scholen.
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
						<Card padding="md" class="flex flex-col gap-3">
							<div class="flex items-start justify-between gap-3">
								<div class="min-w-0">
									<p class="font-medium text-ink">{o.name}</p>
									<p class="text-micro text-muted">
										Aangemaakt {formatDate(o.createdAt)}
									</p>
								</div>
								<Badge
									variant={o.kind === "ondivera" ? "accent" : "primary"}
								>
									{kindLabel(o.kind)}
								</Badge>
							</div>

							<dl class="grid grid-cols-3 gap-2 text-center">
								<Stat label="Gebruikers" value={o.stats.userCount} />
								<Stat label="Coaches" value={o.stats.coachCount} />
								<Stat label="Leerlingen" value={o.stats.leerlingCount} />
								<Stat
									label="Formulieren"
									value={o.stats.formTemplateCount}
								/>
								<Stat label="Cursussen" value={o.stats.courseCount} />
							</dl>

							<div class="flex justify-end">
								<Button
									variant="subtle"
									size="sm"
									onClick={() => {
										setEditId(o.id);
										setEditName(o.name);
									}}
								>
									Naam wijzigen
								</Button>
							</div>
						</Card>
					)}
				</For>
			</div>

			{/* Create school */}
			<Dialog
				open={createOpen()}
				onOpenChange={setCreateOpen}
				title="Nieuwe school"
				description="De school wordt onder Ondivera aangemaakt."
				footer={
					<>
						<Button variant="subtle" onClick={() => setCreateOpen(false)}>
							Annuleren
						</Button>
						<Button
							disabled={create.isPending || newName().trim() === ""}
							onClick={() => create.mutate({ name: newName().trim() })}
						>
							Aanmaken
						</Button>
					</>
				}
			>
				<Input
					label="Naam van de school"
					required
					placeholder="bv. Voorbeeldcollege"
					value={newName()}
					onInput={(e) => setNewName(e.currentTarget.value)}
				/>
			</Dialog>

			{/* Rename */}
			<Dialog
				open={editId() !== null}
				onOpenChange={(open) => !open && setEditId(null)}
				title="Naam wijzigen"
				footer={
					<>
						<Button variant="subtle" onClick={() => setEditId(null)}>
							Annuleren
						</Button>
						<Button
							disabled={update.isPending || editName().trim() === ""}
							onClick={() => {
								const id = editId();
								if (id)
									update.mutate({ id, name: editName().trim() });
							}}
						>
							Opslaan
						</Button>
					</>
				}
			>
				<Input
					label="Naam"
					required
					value={editName()}
					onInput={(e) => setEditName(e.currentTarget.value)}
				/>
			</Dialog>
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
