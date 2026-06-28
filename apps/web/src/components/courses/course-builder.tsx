import { useQueryClient } from "@tanstack/solid-query";
import {
	ChevronDown,
	ChevronUp,
	FileText,
	GripVertical,
	MessageSquare,
	PlayCircle,
	Plus,
	Trash2,
	Upload,
} from "lucide-solid";
import { createSignal, For, Show } from "solid-js";
import { client, orpc } from "../../lib/orpc";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
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

/**
 * Ontwikkelaar/keyuser course builder (#25/#26). Add/rename/reorder sections;
 * add content blocks of each CbS type (#27–#32) via a typed dialog with a Tiptap
 * page editor (#29), YouTube id (#31), file upload (#30), opdracht fields (#27)
 * and leervoorkeur labels (#36); reorder/delete blocks. Reorder uses up/down
 * buttons (keyboard-accessible; DnD is an enhancement, see ORCHESTRATOR TODO).
 */
export function CourseBuilder(props: {
	courseId: string;
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
	// Polite live-region text announced after a keyboard reorder so screen-reader
	// users hear where the section/block landed (the visual order changes silently).
	const [reorderStatus, setReorderStatus] = createSignal("");

	const addSection = async () => {
		if (!newSection().trim()) return;
		await client.courses.addSection({
			courseId: props.courseId,
			title: newSection(),
		});
		setNewSection("");
		toast({ title: "Sectie toegevoegd", tone: "success" });
		await invalidate();
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
		await client.courses.reorderSections({
			courseId: props.courseId,
			orderedIds: next,
		});
		setReorderStatus(`Sectie naar positie ${index + dir + 1} verplaatst`);
		await invalidate();
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
		await client.courses.reorderBlocks({ sectionId, orderedIds: next });
		setReorderStatus(`Blok naar positie ${index + dir + 1} verplaatst`);
		await invalidate();
	};

	const deleteSection = async (id: string) => {
		await client.courses.deleteSection({ id });
		await invalidate();
	};
	const deleteBlock = async (id: string) => {
		await client.courses.deleteBlock({ id });
		await invalidate();
	};

	return (
		<div class="flex flex-col gap-4">
			<p aria-live="polite" class="sr-only">
				{reorderStatus()}
			</p>
			<For each={props.sections}>
				{(section, i) => (
					<Card class="flex flex-col gap-3">
						<div class="flex items-center justify-between gap-2">
							<div class="flex items-center gap-2">
								<GripVertical class="size-4 text-muted" aria-hidden="true" />
								<h2 class="font-head text-h3 text-ink">{section.title}</h2>
							</div>
							<div class="flex items-center gap-1">
								<Button
									variant="ghost"
									size="icon"
									aria-label="Sectie omhoog"
									onClick={() => moveSection(i(), -1)}
								>
									<ChevronUp class="size-4" />
								</Button>
								<Button
									variant="ghost"
									size="icon"
									aria-label="Sectie omlaag"
									onClick={() => moveSection(i(), 1)}
								>
									<ChevronDown class="size-4" />
								</Button>
								<Button
									variant="ghost"
									size="icon"
									aria-label="Sectie verwijderen"
									onClick={() => deleteSection(section.id)}
								>
									<Trash2 class="size-4 text-danger" />
								</Button>
							</div>
						</div>

						<For each={section.blocks}>
							{(block, bi) => (
								<div class="flex items-center justify-between gap-2 rounded-2 border border-line px-3 py-2">
									<div class="flex items-center gap-2">
										<Badge variant="neutral">{block.type}</Badge>
										<span class="text-body text-ink-2">{block.title}</span>
										<Show when={block.labels.length > 0}>
											<For each={block.labels}>
												{(l) => <Badge variant="outline">{l}</Badge>}
											</For>
										</Show>
									</div>
									<div class="flex items-center gap-1">
										<Button
											variant="ghost"
											size="icon"
											aria-label="Blok omhoog"
											onClick={() =>
												moveBlock(section.id, section.blocks, bi(), -1)
											}
										>
											<ChevronUp class="size-4" />
										</Button>
										<Button
											variant="ghost"
											size="icon"
											aria-label="Blok omlaag"
											onClick={() =>
												moveBlock(section.id, section.blocks, bi(), 1)
											}
										>
											<ChevronDown class="size-4" />
										</Button>
										<Button
											variant="ghost"
											size="icon"
											aria-label="Blok verwijderen"
											onClick={() => deleteBlock(block.id)}
										>
											<Trash2 class="size-4 text-danger" />
										</Button>
									</div>
								</div>
							)}
						</For>

						<AddBlockDialog
							sectionId={section.id}
							availableLabels={props.availableLabels}
							onDone={invalidate}
						/>
					</Card>
				)}
			</For>

			<Card class="flex items-end gap-2">
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
			</Card>
		</div>
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
			trigger={
				<Button variant="subtle" size="sm">
					<Plus class="size-4" /> Content
				</Button>
			}
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
					</div>
				</Show>

				<Show when={type() === "forum"}>
					<p class="text-small text-muted">
						Er wordt automatisch een groepschat/forum aangemaakt en gekoppeld
						aan dit blok (#32).
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
