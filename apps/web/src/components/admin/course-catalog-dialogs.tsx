import { useRouter } from "@tanstack/solid-router";
import { Check, Pencil, Search, Trash2, X } from "../../lib/icons";
import { createMemo, createSignal, For, Show } from "solid-js";
import { createAction } from "../../lib/action";
import { client, type Output } from "../../lib/orpc";
import { refresh } from "../../lib/refresh";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Input } from "../ui/text-field";
import { toast } from "../ui/toast";

export type Category = Output<typeof client.courses.catalog.categories.list>[number];
export type Organization = Output<typeof client.admin.organizations.listAll>[number];

/** Refresh everything the catalogue shows (courses, categories) after a change. */
function useRefreshCatalog() {
	const router = useRouter();
	return () => refresh(router, "courses");
}

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

export function CategoryManagerDialog(props: {
	open: boolean;
	onOpenChange: (o: boolean) => void;
	categories: Category[];
}) {
	const refreshCatalog = useRefreshCatalog();
	const [newName, setNewName] = createSignal("");
	const [editing, setEditing] = createSignal<string | null>(null);
	const [editName, setEditName] = createSignal("");
	const [confirmDelete, setConfirmDelete] = createSignal<string | null>(null);

	const create = createAction(
		async (input: { name: string }) => {
			await client.courses.catalog.categories.create(input);
			setNewName("");
			await refreshCatalog();
		},
		{ error: "Toevoegen mislukt" },
	);
	const rename = createAction(
		async (input: { id: string; name: string }) => {
			await client.courses.catalog.categories.rename(input);
			setEditing(null);
			await refreshCatalog();
		},
		{ error: "Wijzigen mislukt" },
	);
	const remove = createAction(
		async (input: { id: string }) => {
			await client.courses.catalog.categories.delete(input);
			setConfirmDelete(null);
			await refreshCatalog();
		},
		{ error: "Verwijderen mislukt" },
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
					if (newName().trim()) void create.run({ name: newName().trim() });
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
				<Button type="submit" disabled={create.pending() || !newName().trim()}>
					Toevoegen
				</Button>
			</form>

			<Show
				when={props.categories.length > 0}
				fallback={<p class="text-small text-muted">Nog geen categorieën.</p>}
			>
				<ul class="flex max-h-80 flex-col overflow-y-auto rounded-2 border border-line">
					<For each={props.categories}>
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
													disabled={remove.pending()}
													onClick={() => void remove.run({ id: c.id })}
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
											if (editName().trim()) void rename.run({ id: c.id, name: editName().trim() });
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
	categories: Category[];
}) {
	const refreshCatalog = useRefreshCatalog();
	// Starts from the opened course's categories, each time another one opens.
	const [selected, setSelected] = createSignal(() => new Set(props.course?.categoryIds ?? []));

	const save = createAction(
		async (input: { courseId: string; categoryIds: string[] }) => {
			await client.courses.catalog.setCategories(input);
			toast({ title: "Categorieën opgeslagen", tone: "success" });
			props.onClose();
			await refreshCatalog();
		},
		{ error: "Opslaan mislukt" },
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
						disabled={save.pending()}
						onClick={() =>
							props.course &&
							void save.run({ courseId: props.course.id, categoryIds: [...selected()] })
						}
					>
						Opslaan
					</Button>
				</>
			}
		>
			<Show
				when={props.categories.length > 0}
				fallback={
					<p class="text-small text-muted">
						Er zijn nog geen categorieën. Maak ze aan via Categorieën beheren.
					</p>
				}
			>
				<div class="flex max-h-80 flex-col overflow-y-auto">
					<For each={props.categories}>
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
	organizations: Organization[];
}) {
	const refreshCatalog = useRefreshCatalog();
	// Each starts from the opened course, each time another one opens.
	const [allSchools, setAllSchools] = createSignal(
		() => props.course?.availability?.allSchools ?? false,
	);
	const [selected, setSelected] = createSignal(
		() => new Set(props.course?.availability?.organizationIds ?? []),
	);
	const [search, setSearch] = createSignal(() => (props.course, ""));

	const schools = createMemo(() =>
		props.organizations
			.filter((o) => o.kind === "school")
			.sort((a, b) => Number(Boolean(a.archivedAt)) - Number(Boolean(b.archivedAt))),
	);
	const shown = createMemo(() => {
		const q = search().trim().toLowerCase();
		return q ? schools().filter((s) => s.name.toLowerCase().includes(q)) : schools();
	});

	const save = createAction(
		async (input: { courseId: string; allSchools: boolean; organizationIds: string[] }) => {
			await client.courses.catalog.availability.set(input);
			toast({ title: "Beschikbaarheid opgeslagen", tone: "success" });
			props.onClose();
			await refreshCatalog();
		},
		{ error: "Opslaan mislukt" },
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
						disabled={save.pending()}
						onClick={() =>
							props.course &&
							void save.run({
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
