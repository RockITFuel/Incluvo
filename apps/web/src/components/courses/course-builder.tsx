import { useQueryClient } from "@tanstack/solid-query";
import {
	Check,
	ChevronDown,
	ChevronRight,
	ChevronUp,
	ClipboardList,
	Copy,
	Eye,
	File as FileIcon,
	FileText,
	GripVertical,
	MessageSquare,
	PlayCircle,
	Plus,
	Sparkles,
	Trash2,
	Upload,
	Youtube,
} from "lucide-solid";
import { createSignal, For, Show } from "solid-js";
import type { Component } from "solid-js";
import { Dynamic } from "solid-js/web";
import { client, orpc } from "../../lib/orpc";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Select } from "../ui/select";
import { Switch } from "../ui/switch";
import { Input, Textarea } from "../ui/text-field";
import { toast } from "../ui/toast";
import type { BlockDTO } from "./block-view";
import { PageEditor } from "./page-editor";
import { uploadFile } from "./upload";

type Section = {
	id: string;
	title: string;
	position: number;
	blocks: BlockDTO[];
};

const blockIcon: Record<BlockDTO["type"], Component<{ style?: Record<string, string> }>> = {
	pagina: FileText,
	youtube: Youtube,
	bestand: FileIcon,
	opdracht: ClipboardList,
	forum: MessageSquare,
	lti: Sparkles,
};
const blockLabel: Record<BlockDTO["type"], string> = {
	pagina: "Pagina",
	youtube: "Video",
	bestand: "Bestand",
	opdracht: "Opdracht",
	forum: "Forum",
	lti: "Externe tool",
};

const palette: [BlockDTO["type"] | "lti", string, Component<{ style?: Record<string, string> }>][] = [
	["pagina", "Pagina", FileText],
	["opdracht", "Opdracht", ClipboardList],
	["bestand", "Bestand", FileIcon],
	["youtube", "YouTube", Youtube],
	["forum", "Forum", MessageSquare],
	["lti", "LTI", Sparkles],
];

/**
 * Ontwikkelaar/keyuser course builder (#25/#26) — a 1:1 port of the prototype's
 * "Cursusbouwer". Collapsible sections; add/reorder/delete sections and content
 * blocks of each CbS type (#27–#32) via a typed dialog (Tiptap page editor #29,
 * YouTube id #31, file upload #30, opdracht fields #27, leervoorkeur labels #36).
 * Reorder uses up/down buttons (keyboard-accessible; the drag handle is a visual
 * a11y-substitute). The sidebar exposes the leervoorkeur-labels of the course and
 * a real "Toon voortgangsbalk aan leerlingen" toggle (#24); the content-palette
 * and Publiceren/kopiëren buttons are visual affordances (no publish endpoint —
 * afleiden lives on the detail header via DeriveDialog).
 */
export function CourseBuilder(props: {
	courseId: string;
	courseTitle: string;
	courseKindLabel: string;
	progressBarHidden: boolean;
	sections: Section[];
	availableLabels: string[];
	refetch: () => void;
}) {
	const queryClient = useQueryClient();
	const invalidate = async () => {
		await queryClient.invalidateQueries({ queryKey: orpc.courses.tree.key() });
		props.refetch();
	};

	const [newSection, setNewSection] = createSignal("");
	const [addingSection, setAddingSection] = createSignal(false);
	// Collapsed section ids — sections default to open, like the prototype.
	const [collapsed, setCollapsed] = createSignal<Set<string>>(new Set());
	const isOpen = (id: string) => !collapsed().has(id);
	const toggleSection = (id: string) =>
		setCollapsed((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});

	// Polite live-region text announced after a keyboard reorder so screen-reader
	// users hear where the section/block landed (the visual order changes silently).
	const [reorderStatus, setReorderStatus] = createSignal("");
	// Guards the move buttons in flight so a double-click can't reorder against a
	// stale order (the server response drives the next render).
	const [reordering, setReordering] = createSignal(false);

	const addSection = async () => {
		if (!newSection().trim()) return;
		try {
			await client.courses.addSection({
				courseId: props.courseId,
				title: newSection(),
			});
			setNewSection("");
			setAddingSection(false);
			toast({ title: "Sectie toegevoegd", tone: "success" });
			await invalidate();
		} catch {
			toast({ title: "Sectie toevoegen mislukt. Probeer het opnieuw.", tone: "danger" });
		}
	};

	/** Move element at `index` by `dir`, returning the reordered id list. */
	const swap = (ids: string[], index: number, dir: -1 | 1): string[] | null => {
		const j = index + dir;
		if (j < 0 || j >= ids.length) return null;
		const next = [...ids];
		const a = next[index];
		const b = next[j];
		if (a === undefined || b === undefined) return null;
		next[index] = b;
		next[j] = a;
		return next;
	};

	const moveSection = async (index: number, dir: -1 | 1) => {
		const next = swap(
			props.sections.map((s) => s.id),
			index,
			dir,
		);
		if (!next) return;
		setReordering(true);
		try {
			await client.courses.reorderSections({
				courseId: props.courseId,
				orderedIds: next,
			});
			setReorderStatus(`Sectie naar positie ${index + dir + 1} verplaatst`);
			await invalidate();
		} catch {
			toast({ title: "Verplaatsen mislukt. Probeer het opnieuw.", tone: "danger" });
		} finally {
			setReordering(false);
		}
	};

	const moveBlock = async (
		sectionId: string,
		blocks: BlockDTO[],
		index: number,
		dir: -1 | 1,
	) => {
		const next = swap(
			blocks.map((b) => b.id),
			index,
			dir,
		);
		if (!next) return;
		setReordering(true);
		try {
			await client.courses.reorderBlocks({ sectionId, orderedIds: next });
			setReorderStatus(`Blok naar positie ${index + dir + 1} verplaatst`);
			await invalidate();
		} catch {
			toast({ title: "Verplaatsen mislukt. Probeer het opnieuw.", tone: "danger" });
		} finally {
			setReordering(false);
		}
	};

	const deleteSection = async (id: string) => {
		try {
			await client.courses.deleteSection({ id });
			await invalidate();
		} catch {
			toast({ title: "Verwijderen mislukt. Probeer het opnieuw.", tone: "danger" });
		}
	};
	const deleteBlock = async (id: string) => {
		try {
			await client.courses.deleteBlock({ id });
			await invalidate();
		} catch {
			toast({ title: "Verwijderen mislukt. Probeer het opnieuw.", tone: "danger" });
		}
	};

	const toggleProgressBar = async () => {
		try {
			await client.courses.setProgressBarHidden({
				id: props.courseId,
				hidden: !props.progressBarHidden,
			});
			toast({
				title: props.progressBarHidden
					? "Voortgangsbalk getoond"
					: "Voortgangsbalk verborgen",
			});
			await invalidate();
		} catch {
			toast({ title: "Aanpassen mislukt. Probeer het opnieuw.", tone: "danger" });
		}
	};

	return (
		<>
			<p aria-live="polite" class="sr-only">
				{reorderStatus()}
			</p>

			<div class="page-head">
				<div>
					<h1>Cursusbouwer</h1>
					<div class="sub">
						{props.courseTitle} · {props.courseKindLabel}
					</div>
				</div>
				<div class="ds-row">
					<span class="chip">
						<Eye style={{ width: "12px", height: "12px" }} /> Voorvertoning
					</span>
					<button
						type="button"
						class="btn ghost"
						onClick={() =>
							toast({
								title: "Sjabloon kopiëren",
								description: "Gebruik ‘Afleiden’ bovenaan om een kopie te maken.",
							})
						}
					>
						<Copy style={{ width: "14px", height: "14px" }} /> Sjabloon kopiëren
					</button>
					<button
						type="button"
						class="btn primary"
						onClick={() =>
							toast({
								title: "Publiceren is niet nodig",
								description:
									"Elke aanpassing wordt direct opgeslagen en is meteen zichtbaar voor gekoppelde leerlingen.",
							})
						}
					>
						<Check style={{ width: "14px", height: "14px" }} /> Publiceren
					</button>
				</div>
			</div>

			<div
				class="ds-grid"
				style={{ "grid-template-columns": "1fr 280px", gap: "24px" }}
			>
				{/* ── Sections column ─────────────────────────────────────────── */}
				<div class="ds-col" style={{ gap: "16px" }}>
					<For each={props.sections}>
						{(section, i) => (
							<div class="card" style={{ padding: "0", overflow: "hidden" }}>
								<div
									class="ds-row"
									style={{
										padding: "14px 18px",
										background: "rgb(var(--bg-2))",
										"border-bottom": isOpen(section.id)
											? "1px solid rgb(var(--line))"
											: "none",
										gap: "10px",
									}}
								>
									<GripVertical
										style={{ width: "16px", height: "16px", color: "rgb(var(--muted))" }}
										aria-hidden="true"
									/>
									<button
										type="button"
										onClick={() => toggleSection(section.id)}
										aria-expanded={isOpen(section.id)}
										style={{
											border: "0",
											background: "transparent",
											padding: "0",
											cursor: "pointer",
											display: "flex",
											"align-items": "center",
											gap: "8px",
											flex: "1",
											"text-align": "left",
											"min-width": "0",
										}}
									>
										<Show
											when={isOpen(section.id)}
											fallback={
												<ChevronRight style={{ width: "16px", height: "16px" }} />
											}
										>
											<ChevronDown style={{ width: "16px", height: "16px" }} />
										</Show>
										<span
											style={{
												"font-family": "var(--font-head)",
												"font-weight": "600",
												"font-size": "16px",
											}}
										>
											{section.title}
										</span>
										<span
											class="chip"
											style={{ "margin-left": "8px", "font-size": "11px" }}
										>
											{section.blocks.length} items
										</span>
									</button>
									<button
										type="button"
										class="icon-btn"
										style={{ width: "30px", height: "30px" }}
										aria-label="Sectie omhoog"
										disabled={reordering()}
										onClick={() => moveSection(i(), -1)}
									>
										<ChevronUp style={{ width: "13px", height: "13px" }} />
									</button>
									<button
										type="button"
										class="icon-btn"
										style={{ width: "30px", height: "30px" }}
										aria-label="Sectie omlaag"
										disabled={reordering()}
										onClick={() => moveSection(i(), 1)}
									>
										<ChevronDown style={{ width: "13px", height: "13px" }} />
									</button>
									<button
										type="button"
										class="icon-btn"
										style={{ width: "30px", height: "30px" }}
										aria-label="Sectie verwijderen"
										onClick={() => deleteSection(section.id)}
									>
										<Trash2
											style={{ width: "13px", height: "13px", color: "rgb(var(--danger))" }}
										/>
									</button>
								</div>

								<Show when={isOpen(section.id)}>
									<div
										style={{
											padding: "14px",
											display: "flex",
											"flex-direction": "column",
											gap: "8px",
										}}
									>
										<For each={section.blocks}>
											{(block, bi) => (
												<div
													class="ds-row"
													style={{
														padding: "10px 12px",
														border: "1px solid rgb(var(--line))",
														"border-radius": "10px",
														gap: "12px",
													}}
												>
													<GripVertical
														style={{ width: "14px", height: "14px", color: "rgb(var(--muted))" }}
														aria-hidden="true"
													/>
													<div
														style={{
															width: "32px",
															height: "32px",
															"border-radius": "8px",
															background: "rgb(var(--bg-2))",
															display: "grid",
															"place-items": "center",
															"flex-shrink": "0",
														}}
													>
														<Dynamic
															component={blockIcon[block.type]}
															style={{ width: "15px", height: "15px" }}
														/>
													</div>
													<div class="ds-grow" style={{ "min-width": "0" }}>
														<div
															style={{
																"font-size": "11px",
																color: "rgb(var(--muted))",
																"text-transform": "uppercase",
																"letter-spacing": "0.06em",
																"font-weight": "600",
																"margin-bottom": "2px",
															}}
														>
															{blockLabel[block.type]}
														</div>
														<div style={{ "font-size": "14px", "font-weight": "500" }}>
															{block.title}
														</div>
													</div>
													<Show when={block.labels.length > 0}>
														<div class="ds-row" style={{ gap: "4px", "flex-wrap": "wrap" }}>
															<For each={block.labels}>
																{(l) => (
																	<span class="chip" style={{ "font-size": "11px" }}>
																		{l}
																	</span>
																)}
															</For>
														</div>
													</Show>
													<button
														type="button"
														class="icon-btn"
														style={{ width: "28px", height: "28px" }}
														aria-label="Blok omhoog"
														disabled={reordering()}
														onClick={() => moveBlock(section.id, section.blocks, bi(), -1)}
													>
														<ChevronUp style={{ width: "12px", height: "12px" }} />
													</button>
													<button
														type="button"
														class="icon-btn"
														style={{ width: "28px", height: "28px" }}
														aria-label="Blok omlaag"
														disabled={reordering()}
														onClick={() => moveBlock(section.id, section.blocks, bi(), 1)}
													>
														<ChevronDown style={{ width: "12px", height: "12px" }} />
													</button>
													<button
														type="button"
														class="icon-btn"
														style={{ width: "28px", height: "28px" }}
														aria-label="Blok verwijderen"
														onClick={() => deleteBlock(block.id)}
													>
														<Trash2
															style={{ width: "12px", height: "12px", color: "rgb(var(--danger))" }}
														/>
													</button>
												</div>
											)}
										</For>

										<AddBlockDialog
											sectionId={section.id}
											availableLabels={props.availableLabels}
											onDone={invalidate}
										/>
									</div>
								</Show>
							</div>
						)}
					</For>

					<Show
						when={addingSection()}
						fallback={
							<button
								type="button"
								onClick={() => setAddingSection(true)}
								style={{
									padding: "14px",
									border: "1.5px dashed rgb(var(--line))",
									"border-radius": "12px",
									background: "transparent",
									color: "rgb(var(--muted))",
									"font-size": "14px",
									"font-weight": "500",
									cursor: "pointer",
									display: "inline-flex",
									"align-items": "center",
									"justify-content": "center",
									gap: "8px",
								}}
							>
								<Plus style={{ width: "14px", height: "14px" }} /> Sectie toevoegen
							</button>
						}
					>
						<div class="card ds-row" style={{ "align-items": "flex-end", gap: "8px" }}>
							<Input
								class="flex-1"
								label="Nieuwe sectie"
								placeholder="Bijv. Week 1 of Thema 1"
								value={newSection()}
								onInput={(e) => setNewSection(e.currentTarget.value)}
							/>
							<Button onClick={addSection} disabled={!newSection().trim()}>
								<Plus class="size-4" /> Sectie
							</Button>
							<Button
								variant="ghost"
								onClick={() => {
									setAddingSection(false);
									setNewSection("");
								}}
							>
								Annuleren
							</Button>
						</div>
					</Show>
				</div>

				{/* ── Sidebar ─────────────────────────────────────────────────── */}
				<div class="ds-col" style={{ gap: "14px" }}>
					<div class="card">
						<div class="card-head">
							<h3 style={{ "font-size": "15px" }}>Content toevoegen</h3>
						</div>
						<div
							class="ds-grid"
							style={{ "grid-template-columns": "1fr 1fr", gap: "6px" }}
						>
							<For each={palette}>
								{([, label, Icon]) => (
									<button
										type="button"
										class="btn ghost sm"
										style={{ "justify-content": "flex-start", padding: "10px 12px" }}
										onClick={() =>
											toast({
												title: "Kies een sectie",
												description:
													"Gebruik ‘+ Content toevoegen’ binnen een sectie om dit type toe te voegen.",
											})
										}
									>
										<Dynamic component={Icon} style={{ width: "14px", height: "14px" }} />{" "}
										{label}
									</button>
								)}
							</For>
						</div>
						<div
							style={{
								"margin-top": "10px",
								padding: "10px 12px",
								background: "rgb(var(--accent-100))",
								"border-radius": "10px",
								"font-size": "12px",
								color: "rgb(var(--accent-700))",
							}}
						>
							<Sparkles style={{ width: "12px", height: "12px" }} /> Tip:
							Ondivera-advies importeren →
						</div>
					</div>

					<div class="card">
						<div class="card-head">
							<h3 style={{ "font-size": "15px" }}>Leervoorkeur-labels</h3>
						</div>
						<div
							style={{
								"font-size": "12px",
								color: "rgb(var(--muted))",
								"margin-bottom": "10px",
							}}
						>
							Items met deze labels worden aanbevolen aan leerlingen die ze in hun
							plan hebben.
						</div>
						<Show
							when={props.availableLabels.length > 0}
							fallback={
								<div style={{ "font-size": "12px", color: "rgb(var(--muted))" }}>
									Nog geen labels — deze komen uit het coachplan van de gekoppelde
									leerling (#36).
								</div>
							}
						>
							<div class="ds-row" style={{ "flex-wrap": "wrap", gap: "6px" }}>
								<For each={props.availableLabels}>
									{(l) => <span class="chip primary">{l}</span>}
								</For>
							</div>
						</Show>
					</div>

					<div class="card">
						<div class="card-head">
							<h3 style={{ "font-size": "15px" }}>Voortgang</h3>
						</div>
						<Switch
							label="Toon voortgangsbalk aan leerlingen"
							checked={!props.progressBarHidden}
							onChange={toggleProgressBar}
						/>
					</div>
				</div>
			</div>
		</>
	);
}

const blockTypeOptions = [
	{ value: "pagina", label: "Pagina (tekst)" },
	{ value: "youtube", label: "YouTube-video" },
	{ value: "bestand", label: "Bestand" },
	{ value: "opdracht", label: "Opdracht" },
	{ value: "forum", label: "Forum / groepschat" },
];

function AddBlockDialog(props: {
	sectionId: string;
	availableLabels: string[];
	onDone: () => Promise<void>;
}) {
	const [open, setOpen] = createSignal(false);
	const [type, setType] = createSignal("pagina");
	const [title, setTitle] = createSignal("");
	const [body, setBody] = createSignal("");
	const [youtube, setYoutube] = createSignal("");
	const [fileKey, setFileKey] = createSignal<string | null>(null);
	const [labels, setLabels] = createSignal<string[]>([]);
	const [busy, setBusy] = createSignal(false);

	// opdracht fields
	const [asgName, setAsgName] = createSignal("");
	const [asgDesc, setAsgDesc] = createSignal("");
	const [isGroup, setIsGroup] = createSignal(false);
	const [responseType, setResponseType] = createSignal("text_and_files");
	const [asgDue, setAsgDue] = createSignal("");

	const reset = () => {
		setType("pagina");
		setTitle("");
		setBody("");
		setYoutube("");
		setFileKey(null);
		setLabels([]);
		setAsgName("");
		setAsgDesc("");
		setIsGroup(false);
		setResponseType("text_and_files");
		setAsgDue("");
	};

	const toggleLabel = (l: string) =>
		setLabels((prev) =>
			prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l],
		);

	const handleUpload = async (file: File) => {
		try {
			const key = await uploadFile(file, "bestand");
			setFileKey(key);
			toast({ title: "Bestand geüpload", tone: "success" });
		} catch (err) {
			toast({
				title: "Upload mislukt",
				description: (err as Error).message,
				tone: "danger",
			});
		}
	};

	const save = async () => {
		setBusy(true);
		try {
			await client.courses.addBlock({
				sectionId: props.sectionId,
				type: type() as never,
				title: title(),
				body: type() === "pagina" ? body() : undefined,
				youtube: type() === "youtube" ? youtube() : undefined,
				fileStorageKey:
					type() === "bestand" ? (fileKey() ?? undefined) : undefined,
				labels: labels(),
				assignment:
					type() === "opdracht"
						? {
								name: asgName() || title(),
								description: asgDesc() || undefined,
								isGroup: isGroup(),
								responseType: responseType() as never,
								dueAt: asgDue()
									? new Date(`${asgDue()}T00:00:00`)
									: undefined,
							}
						: undefined,
			});
			toast({ title: "Blok toegevoegd", tone: "success" });
			setOpen(false);
			reset();
			await props.onDone();
		} catch (err) {
			toast({
				title: "Toevoegen mislukt",
				description: (err as Error).message,
				tone: "danger",
			});
		} finally {
			setBusy(false);
		}
	};

	const typeIcon = () => {
		switch (type()) {
			case "youtube":
				return <PlayCircle class="size-4" />;
			case "forum":
				return <MessageSquare class="size-4" />;
			default:
				return <FileText class="size-4" />;
		}
	};

	return (
		<Dialog
			open={open()}
			onOpenChange={setOpen}
			title="Content toevoegen"
			class="max-w-2xl"
			trigger={{
				class:
					"w-full justify-center border border-dashed border-line bg-transparent px-3 py-2.5 text-small font-medium text-muted hover:bg-line-2",
				children: (
					<>
						<Plus class="size-4" aria-hidden="true" /> Content toevoegen
					</>
				),
			}}
			footer={
				<>
					<Button variant="ghost" onClick={() => setOpen(false)}>
						Annuleren
					</Button>
					<Button onClick={save} disabled={busy() || !title().trim()}>
						{typeIcon()}
						{busy() ? "Bezig…" : "Toevoegen"}
					</Button>
				</>
			}
		>
			<div class="flex flex-col gap-3">
				<Select
					label="Type"
					options={blockTypeOptions}
					value={type()}
					onChange={(v) => setType(v ?? "pagina")}
				/>
				<Input
					label="Titel"
					value={title()}
					onInput={(e) => setTitle(e.currentTarget.value)}
					required
				/>

				<Show when={type() === "pagina"}>
					<div class="flex flex-col gap-1.5">
						<span class="text-small font-medium text-ink-2">Inhoud</span>
						<PageEditor value={body()} onChange={setBody} />
					</div>
				</Show>

				<Show when={type() === "youtube"}>
					<Input
						label="YouTube-link of -id"
						placeholder="https://www.youtube.com/watch?v=… of 11-cijferig id"
						value={youtube()}
						onInput={(e) => setYoutube(e.currentTarget.value)}
					/>
				</Show>

				<Show when={type() === "bestand"}>
					<label class="flex flex-col gap-1.5 text-small font-medium text-ink-2">
						Bestand (PDF, Word, PowerPoint, afbeelding)
						<input
							type="file"
							class="text-small file:mr-3 file:rounded-2 file:border-0 file:bg-primary-50 file:px-3 file:py-1.5 file:text-primary-700"
							onChange={(e) => {
								const f = e.currentTarget.files?.[0];
								if (f) handleUpload(f);
							}}
						/>
						<Show when={fileKey()}>
							<span class="text-micro text-success">
								<Upload class="inline size-3" /> Geüpload
							</span>
						</Show>
					</label>
				</Show>

				<Show when={type() === "opdracht"}>
					<div class="flex flex-col gap-2 rounded-2 border border-line p-3">
						<Input
							label="Naam opdracht"
							value={asgName()}
							onInput={(e) => setAsgName(e.currentTarget.value)}
						/>
						<Textarea
							label="Omschrijving"
							value={asgDesc()}
							onInput={(e) => setAsgDesc(e.currentTarget.value)}
						/>
						<Switch
							label="Groepsopdracht"
							checked={isGroup()}
							onChange={setIsGroup}
						/>
						<Select
							label="Antwoordmogelijkheid"
							options={[
								{ value: "text", label: "Alleen tekst" },
								{ value: "files", label: "Alleen bestanden" },
								{ value: "text_and_files", label: "Tekst en bestanden" },
							]}
							value={responseType()}
							onChange={(v) => setResponseType(v ?? "text_and_files")}
						/>
						<Input
							type="date"
							label="Inleverdeadline"
							value={asgDue()}
							onInput={(e) => setAsgDue(e.currentTarget.value)}
						/>
					</div>
				</Show>

				<Show when={type() === "forum"}>
					<p class="text-small text-muted">
						Er wordt automatisch een groepschat/forum aangemaakt en gekoppeld aan
						dit blok (#32).
					</p>
				</Show>

				{/* Leervoorkeur labels (#36) */}
				<Show when={props.availableLabels.length > 0}>
					<div class="flex flex-col gap-1.5">
						<span class="text-small font-medium text-ink-2">
							Leervoorkeur-labels (#36)
						</span>
						<div class="flex flex-wrap gap-1.5">
							<For each={props.availableLabels}>
								{(l) => (
									<button
										type="button"
										onClick={() => toggleLabel(l)}
										aria-pressed={labels().includes(l)}
										class="rounded-pill border border-line px-2.5 py-1 text-micro aria-pressed:border-primary aria-pressed:bg-primary-100 aria-pressed:text-primary-700"
									>
										{l}
									</button>
								)}
							</For>
						</div>
					</div>
				</Show>
			</div>
		</Dialog>
	);
}
