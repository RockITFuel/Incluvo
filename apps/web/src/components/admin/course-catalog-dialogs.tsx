import { useMutation, useQuery, useQueryClient } from "@tanstack/solid-query";
import { Check, Pencil, Search, Trash2, X } from "lucide-solid";
import { createEffect, createMemo, createSignal, For, on, Show } from "solid-js";
import { friendlyError } from "../../lib/errors";
import { orpc } from "../../lib/orpc";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Input } from "../ui/text-field";
import { toast } from "../ui/toast";

/** Refresh everything the catalogue shows after a change. */
function useInvalidateCatalog() {
	const queryClient = useQueryClient();
	return () => {
		void queryClient.invalidateQueries({ queryKey: orpc.courses.list.key() });
		void queryClient.invalidateQueries({ queryKey: orpc.courses.catalog.key() });
	};
}

const onError = (title: string) => (error: unknown) =>
	toast({ title, description: friendlyError(error), tone: "danger" });

/** A labelled native checkbox: keyboard- and screen-reader friendly. */
function CheckRow(props: {
	checked: boolean;
	onChange: (checked: boolean) => void;
	label: string;
	hint?: string;
	disabled?: boolean;
}) {
	return (
		<label class="flex cursor-pointer items-center gap-3 rounded-2 px-3 py-2 hover:bg-line-2">
			<input
				type="checkbox"
				class="size-4 accent-[rgb(var(--primary))]"
				checked={props.checked}
				disabled={props.disabled}
				onChange={(e) => props.onChange(e.currentTarget.checked)}
			/>
			<span class="min-w-0 flex-1 text-small text-ink">{props.label}</span>
			<Show when={props.hint}>
				<span class="text-micro text-muted">{props.hint}</span>
			</Show>
		</label>
	);
}

function SearchBox(props: { value: string; onInput: (v: string) => void; label: string }) {
	return (
		<label class="flex items-center gap-2 rounded-2 border border-line bg-surface px-3 py-2">
			<Search class="size-3.5 text-muted" aria-hidden="true" />
			<input
				value={props.value}
				onInput={(e) => props.onInput(e.currentTarget.value)}
				class="w-full bg-transparent text-small text-ink outline-none"
				placeholder={`${props.label}…`}
				aria-label={props.label}
			/>
		</label>
	);
}

// ---------------------------------------------------------------------------
// Categorieën beheren
// ---------------------------------------------------------------------------

export function CategoryManagerDialog(props: { open: boolean; onOpenChange: (o: boolean) => void }) {
	const invalidate = useInvalidateCatalog();
	const categories = useQuery(() => orpc.courses.catalog.categories.list.queryOptions());
	const [newName, setNewName] = createSignal("");
	const [editing, setEditing] = createSignal<string | null>(null);
	const [editName, setEditName] = createSignal("");
	const [confirmDelete, setConfirmDelete] = createSignal<string | null>(null);

	const create = useMutation(() =>
		orpc.courses.catalog.categories.create.mutationOptions({
			onSuccess: () => {
				setNewName("");
				invalidate();
			},
			onError: onError("Toevoegen mislukt"),
		}),
	);
	const rename = useMutation(() =>
		orpc.courses.catalog.categories.rename.mutationOptions({
			onSuccess: () => {
				setEditing(null);
				invalidate();
			},
			onError: onError("Wijzigen mislukt"),
		}),
	);
	const remove = useMutation(() =>
		orpc.courses.catalog.categories.delete.mutationOptions({
			onSuccess: () => {
				setConfirmDelete(null);
				invalidate();
			},
			onError: onError("Verwijderen mislukt"),
		}),
	);

	return (
		<Dialog
			open={props.open}
			onOpenChange={props.onOpenChange}
			title="Categorieën"
			description="Categorieën helpen scholen en Ondivera om cursussen te vinden. Een cursus kan in meerdere categorieën staan."
			footer={<Button onClick={() => props.onOpenChange(false)}>Klaar</Button>}
		>
			<form
				class="mb-4 flex items-end gap-2"
				onSubmit={(e) => {
					e.preventDefault();
					if (newName().trim()) create.mutate({ name: newName().trim() });
				}}
			>
				<div class="flex-1">
					<Input
						label="Nieuwe categorie"
						placeholder="bv. Rekenen"
						value={newName()}
						onInput={(e) => setNewName(e.currentTarget.value)}
					/>
				</div>
				<Button type="submit" disabled={create.isPending || !newName().trim()}>
					Toevoegen
				</Button>
			</form>

			<Show
				when={(categories.data?.length ?? 0) > 0}
				fallback={<p class="text-small text-muted">Nog geen categorieën.</p>}
			>
				<ul class="flex max-h-80 flex-col overflow-y-auto rounded-2 border border-line">
					<For each={categories.data}>
						{(c) => (
							<li class="flex items-center gap-2 border-line-2 border-b px-3 py-2 last:border-b-0">
								<Show
									when={editing() === c.id}
									fallback={
										<>
											<span class="min-w-0 flex-1 text-small text-ink">{c.name}</span>
											<span class="text-micro text-muted">
												{c.courseCount} {c.courseCount === 1 ? "cursus" : "cursussen"}
											</span>
											<Show
												when={confirmDelete() === c.id}
												fallback={
													<>
														<button
															type="button"
															class="icon-btn"
															style={{ width: "28px", height: "28px" }}
															aria-label={`${c.name} hernoemen`}
															onClick={() => {
																setEditing(c.id);
																setEditName(c.name);
															}}
														>
															<Pencil class="size-3.5" aria-hidden="true" />
														</button>
														<button
															type="button"
															class="icon-btn"
															style={{ width: "28px", height: "28px" }}
															aria-label={`${c.name} verwijderen`}
															onClick={() => setConfirmDelete(c.id)}
														>
															<Trash2 class="size-3.5" aria-hidden="true" />
														</button>
													</>
												}
											>
												<span class="text-micro text-danger">Verwijderen?</span>
												<Button
													size="sm"
													variant="danger"
													disabled={remove.isPending}
													onClick={() => remove.mutate({ id: c.id })}
												>
													Ja
												</Button>
												<Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>
													Nee
												</Button>
											</Show>
										</>
									}
								>
									<form
										class="flex flex-1 items-center gap-2"
										onSubmit={(e) => {
											e.preventDefault();
											if (editName().trim()) rename.mutate({ id: c.id, name: editName().trim() });
										}}
									>
										<input
											class="input flex-1"
											value={editName()}
											onInput={(e) => setEditName(e.currentTarget.value)}
											aria-label={`Nieuwe naam voor ${c.name}`}
										/>
										<button
											type="submit"
											class="icon-btn"
											style={{ width: "28px", height: "28px" }}
											aria-label="Opslaan"
										>
											<Check class="size-3.5" aria-hidden="true" />
										</button>
										<button
											type="button"
											class="icon-btn"
											style={{ width: "28px", height: "28px" }}
											aria-label="Annuleren"
											onClick={() => setEditing(null)}
										>
											<X class="size-3.5" aria-hidden="true" />
										</button>
									</form>
								</Show>
							</li>
						)}
					</For>
				</ul>
			</Show>
		</Dialog>
	);
}

// ---------------------------------------------------------------------------
// Categorieën van één cursus
// ---------------------------------------------------------------------------

export function CourseCategoriesDialog(props: {
	course: { id: string; title: string; categoryIds: string[] } | null;
	onClose: () => void;
	onManage: () => void;
}) {
	const invalidate = useInvalidateCatalog();
	const categories = useQuery(() => orpc.courses.catalog.categories.list.queryOptions());
	const [selected, setSelected] = createSignal<Set<string>>(new Set());
	createEffect(
		on(
			() => props.course,
			(c) => setSelected(new Set(c?.categoryIds ?? [])),
		),
	);

	const save = useMutation(() =>
		orpc.courses.catalog.setCategories.mutationOptions({
			onSuccess: () => {
				invalidate();
				toast({ title: "Categorieën opgeslagen", tone: "success" });
				props.onClose();
			},
			onError: onError("Opslaan mislukt"),
		}),
	);

	const toggle = (id: string, on: boolean) => {
		const next = new Set(selected());
		if (on) next.add(id);
		else next.delete(id);
		setSelected(next);
	};

	return (
		<Dialog
			open={props.course !== null}
			onOpenChange={(o) => !o && props.onClose()}
			title="Categorieën"
			description={props.course?.title}
			footer={
				<>
					<Button variant="ghost" onClick={() => props.onManage()}>
						Categorieën beheren
					</Button>
					<Button variant="subtle" onClick={() => props.onClose()}>
						Annuleren
					</Button>
					<Button
						disabled={save.isPending}
						onClick={() =>
							props.course &&
							save.mutate({ courseId: props.course.id, categoryIds: [...selected()] })
						}
					>
						Opslaan
					</Button>
				</>
			}
		>
			<Show
				when={(categories.data?.length ?? 0) > 0}
				fallback={
					<p class="text-small text-muted">
						Er zijn nog geen categorieën. Maak ze aan via Categorieën beheren.
					</p>
				}
			>
				<div class="flex max-h-80 flex-col overflow-y-auto">
					<For each={categories.data}>
						{(c) => (
							<CheckRow
								checked={selected().has(c.id)}
								onChange={(on) => toggle(c.id, on)}
								label={c.name}
							/>
						)}
					</For>
				</div>
			</Show>
		</Dialog>
	);
}

// ---------------------------------------------------------------------------
// Beschikbaarheid van één Ondivera-cursus
// ---------------------------------------------------------------------------

export function AvailabilityDialog(props: {
	course: {
		id: string;
		title: string;
		availability: { allSchools: boolean; organizationIds: string[] } | null;
	} | null;
	onClose: () => void;
}) {
	const invalidate = useInvalidateCatalog();
	const orgs = useQuery(() => orpc.admin.organizations.listAll.queryOptions());
	const [allSchools, setAllSchools] = createSignal(false);
	const [selected, setSelected] = createSignal<Set<string>>(new Set());
	const [search, setSearch] = createSignal("");

	createEffect(
		on(
			() => props.course,
			(c) => {
				setAllSchools(c?.availability?.allSchools ?? false);
				setSelected(new Set(c?.availability?.organizationIds ?? []));
				setSearch("");
			},
		),
	);

	const schools = createMemo(() =>
		(orgs.data ?? [])
			.filter((o) => o.kind === "school")
			.sort((a, b) => Number(Boolean(a.archivedAt)) - Number(Boolean(b.archivedAt))),
	);
	const shown = createMemo(() => {
		const q = search().trim().toLowerCase();
		return q ? schools().filter((s) => s.name.toLowerCase().includes(q)) : schools();
	});

	const save = useMutation(() =>
		orpc.courses.catalog.availability.set.mutationOptions({
			onSuccess: () => {
				invalidate();
				toast({ title: "Beschikbaarheid opgeslagen", tone: "success" });
				props.onClose();
			},
			onError: onError("Opslaan mislukt"),
		}),
	);

	const toggle = (id: string, on: boolean) => {
		const next = new Set(selected());
		if (on) next.add(id);
		else next.delete(id);
		setSelected(next);
	};
	const setShown = (on: boolean) => {
		const next = new Set(selected());
		for (const s of shown()) {
			if (on) next.add(s.id);
			else next.delete(s.id);
		}
		setSelected(next);
	};

	return (
		<Dialog
			open={props.course !== null}
			onOpenChange={(o) => !o && props.onClose()}
			title="Beschikbaar voor"
			description={props.course?.title}
			footer={
				<>
					<Button variant="subtle" onClick={() => props.onClose()}>
						Annuleren
					</Button>
					<Button
						disabled={save.isPending}
						onClick={() =>
							props.course &&
							save.mutate({
								courseId: props.course.id,
								allSchools: allSchools(),
								organizationIds: [...selected()],
							})
						}
					>
						Opslaan
					</Button>
				</>
			}
		>
			<fieldset class="mb-4 flex flex-col gap-1">
				<legend class="sr-only">Beschikbaarheid</legend>
				<label class="flex cursor-pointer items-start gap-3 rounded-2 px-3 py-2 hover:bg-line-2">
					<input
						type="radio"
						name="availability"
						class="mt-1 accent-[rgb(var(--primary))]"
						checked={allSchools()}
						onChange={() => setAllSchools(true)}
					/>
					<span>
						<span class="block text-small font-medium text-ink">Alle scholen</span>
						<span class="block text-micro text-muted">Ook scholen die later aansluiten.</span>
					</span>
				</label>
				<label class="flex cursor-pointer items-start gap-3 rounded-2 px-3 py-2 hover:bg-line-2">
					<input
						type="radio"
						name="availability"
						class="mt-1 accent-[rgb(var(--primary))]"
						checked={!allSchools()}
						onChange={() => setAllSchools(false)}
					/>
					<span>
						<span class="block text-small font-medium text-ink">
							Alleen geselecteerde scholen
						</span>
						<span class="block text-micro text-muted">
							Geen school geselecteerd = nog niet beschikbaar.
						</span>
					</span>
				</label>
			</fieldset>

			<Show when={!allSchools()}>
				<div class="flex flex-col gap-2">
					<SearchBox value={search()} onInput={setSearch} label="Zoek school" />
					<div class="flex items-center justify-between text-micro text-muted">
						<span>
							{selected().size} van {schools().length} scholen geselecteerd
						</span>
						<span class="flex gap-3">
							<button type="button" class="underline" onClick={() => setShown(true)}>
								{search() ? "Gevonden selecteren" : "Alles selecteren"}
							</button>
							<button type="button" class="underline" onClick={() => setShown(false)}>
								{search() ? "Gevonden wissen" : "Niets"}
							</button>
						</span>
					</div>
					<div class="flex max-h-72 flex-col overflow-y-auto rounded-2 border border-line">
						<For
							each={shown()}
							fallback={<p class="px-3 py-2 text-small text-muted">Geen scholen gevonden.</p>}
						>
							{(s) => (
								<CheckRow
									checked={selected().has(s.id)}
									onChange={(on) => toggle(s.id, on)}
									label={s.name}
									hint={s.archivedAt ? "gearchiveerd" : undefined}
								/>
							)}
						</For>
					</div>
				</div>
			</Show>
		</Dialog>
	);
}
