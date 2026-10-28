import { createSignal, For, Show } from "solid-js";
import { ArrowLeft, Save, Upload } from "../../lib/icons";
import { Button } from "../ui/button";
import { Select } from "../ui/select";
import { Switch } from "../ui/switch";
import { Input } from "../ui/text-field";
import { toast } from "../ui/toast";
import type { BlockDTO } from "./block-view";
import { FileView } from "./file-view";
import { RichTextEditor } from "./rich-text-editor";
import { rememberLocalPreview } from "../../lib/course-files";
import { uploadFile } from "./upload";

export type BlockType = "pagina" | "youtube" | "bestand" | "opdracht";
type ResponseType = "text" | "files" | "text_and_files";

/** What the editor saves: the block and, for an opdracht, its own fields. */
export type BlockDraft = {
	type: BlockType;
	title: string;
	body: string;
	youtube: string;
	fileStorageKey: string | null;
	labels: string[];
	countsForProgress: boolean;
	asgName: string;
	asgDescription: string;
	responseType: ResponseType;
	/** yyyy-mm-dd, or empty. */
	dueAt: string;
};

export const blockTypeLabel: Record<BlockType, string> = {
	pagina: "Pagina",
	youtube: "YouTube-video",
	bestand: "Bestand",
	opdracht: "Opdracht",
};

const typeOptions = (Object.keys(blockTypeLabel) as BlockType[]).map((value) => ({
	value,
	label: blockTypeLabel[value],
}));

const pad = (n: number) => String(n).padStart(2, "0");

const toDateInput = (d: Date | string | null | undefined) => {
	if (!d) return "";
	const date = new Date(d);
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/** A draft for a new block, or from an existing one. */
export function draftOf(block: BlockDTO | null, type: BlockType = "pagina"): BlockDraft {
	return {
		type: (block?.type as BlockType | undefined) ?? type,
		title: block?.title ?? "",
		body: block?.body ?? "",
		youtube: block?.youtubeId ? `https://www.youtube.com/watch?v=${block.youtubeId}` : "",
		fileStorageKey: block?.fileStorageKey ?? null,
		labels: [...(block?.labels ?? [])],
		countsForProgress: block?.countsForProgress ?? true,
		asgName: block?.assignment?.name ?? "",
		asgDescription: block?.assignment?.description ?? "",
		responseType: (block?.assignment?.responseType as ResponseType | undefined) ?? "text_and_files",
		dueAt: toDateInput(block?.assignment?.dueAt ?? null),
	};
}

/**
 * Full-screen editor for one content block (INC-26): add a new one or change
 * an existing one. A fixed bar on top holds the title and Opslaan/Annuleren;
 * the text gets the room it needs (INC-25 editor). The route around it keeps
 * the draft, asks before throwing away changes and saves.
 */
export function BlockEditor(props: {
	draft: BlockDraft;
	/** True for a new block: the type can still be chosen. */
	isNew: boolean;
	courseTitle: string;
	availableLabels: string[];
	saving: boolean;
	onChange: (update: (draft: BlockDraft) => BlockDraft) => void;
	onSave: () => void;
	onCancel: () => void;
}) {
	const set = <K extends keyof BlockDraft>(key: K, value: BlockDraft[K]) =>
		props.onChange((d) => ({ ...d, [key]: value }));
	const [uploading, setUploading] = createSignal(false);

	const upload = async (file: File) => {
		setUploading(true);
		try {
			const key = await uploadFile(file, "bestand");
			// Shown from memory until the block is saved (the server only hands
			// out files a saved block refers to).
			rememberLocalPreview(key, file);
			set("fileStorageKey", key);
			toast({ title: "Bestand geüpload", tone: "success" });
		} catch (err) {
			toast({ title: "Upload mislukt", description: (err as Error).message, tone: "danger" });
		} finally {
			setUploading(false);
		}
	};

	const toggleLabel = (label: string) =>
		props.onChange((d) => ({
			...d,
			labels: d.labels.includes(label) ? d.labels.filter((l) => l !== label) : [...d.labels, label],
		}));

	const heading = () =>
		props.isNew
			? `${blockTypeLabel[props.draft.type]} toevoegen`
			: `${blockTypeLabel[props.draft.type]} bewerken`;

	return (
		<div class="fixed inset-0 z-40 overflow-y-auto bg-bg" data-page-title={heading()}>
			<header class="sticky top-0 z-20 border-line border-b bg-bg/95 backdrop-blur">
				<div class="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3 md:px-7">
					<Button variant="ghost" size="sm" onClick={() => props.onCancel()}>
						<ArrowLeft class="size-4" /> Annuleren
					</Button>
					<div class="min-w-0 flex-1">
						<p class="truncate text-micro text-muted">{props.courseTitle}</p>
						<h1 class="truncate font-head text-h3 text-ink">{heading()}</h1>
					</div>
					<Button disabled={props.saving || uploading()} onClick={() => props.onSave()}>
						<Save class="size-4" /> {props.saving ? "Opslaan…" : "Opslaan"}
					</Button>
				</div>
			</header>

			<form
				class="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-6 md:px-7"
				onSubmit={(e) => {
					e.preventDefault();
					props.onSave();
				}}
			>
				<div class="grid gap-4 md:grid-cols-[1fr_16rem]">
					<Input
						label="Titel"
						required
						value={props.draft.title}
						onInput={(e) => set("title", e.currentTarget.value)}
					/>
					<Show when={props.isNew}>
						<Select
							label="Type"
							options={typeOptions}
							value={props.draft.type}
							onChange={(v) => v && set("type", v as BlockType)}
						/>
					</Show>
				</div>

				<Show when={props.draft.type === "pagina"}>
					<div class="flex flex-col gap-1.5">
						<span class="text-small font-medium text-ink-2">Inhoud</span>
						<RichTextEditor
							label="Inhoud van de pagina"
							tall
							value={props.draft.body}
							onChange={(json) => set("body", json)}
						/>
					</div>
				</Show>

				<Show when={props.draft.type === "youtube"}>
					<Input
						label="YouTube-link of -id"
						placeholder="https://www.youtube.com/watch?v=… of 11-cijferig id"
						value={props.draft.youtube}
						onInput={(e) => set("youtube", e.currentTarget.value)}
					/>
				</Show>

				<Show when={props.draft.type === "bestand"}>
					<div class="flex flex-col gap-3">
						<label class="flex flex-col gap-1.5 text-small font-medium text-ink-2">
							{props.draft.fileStorageKey ? "Ander bestand kiezen" : "Bestand"} (PDF, Word,
							PowerPoint, Excel, afbeelding, audio of video)
							<input
								type="file"
								class="text-small file:mr-3 file:rounded-2 file:border-0 file:bg-primary-50 file:px-3 file:py-1.5 file:text-primary-700"
								onChange={(e) => {
									const f = e.currentTarget.files?.[0];
									if (f) void upload(f);
								}}
							/>
						</label>
						<Show when={uploading()}>
							<span class="text-micro text-muted">
								<Upload class="inline size-3" /> Uploaden…
							</span>
						</Show>
						<Show when={props.draft.fileStorageKey}>
							{(key) => <FileView storageKey={key()} title={props.draft.title || "Bestand"} />}
						</Show>
					</div>
				</Show>

				<Show when={props.draft.type === "opdracht"}>
					<div class="flex flex-col gap-4">
						<div class="grid gap-4 md:grid-cols-3">
							<Input
								label="Naam opdracht"
								placeholder="Standaard de titel"
								value={props.draft.asgName}
								onInput={(e) => set("asgName", e.currentTarget.value)}
							/>
							<Select
								label="Antwoordmogelijkheid"
								options={[
									{ value: "text", label: "Alleen tekst" },
									{ value: "files", label: "Alleen bestanden" },
									{ value: "text_and_files", label: "Tekst en bestanden" },
								]}
								value={props.draft.responseType}
								onChange={(v) => v && set("responseType", v as ResponseType)}
							/>
							<Input
								type="date"
								label="Inleverdeadline"
								value={props.draft.dueAt}
								onInput={(e) => set("dueAt", e.currentTarget.value)}
							/>
						</div>
						<div class="flex flex-col gap-1.5">
							<span class="text-small font-medium text-ink-2">Omschrijving</span>
							<RichTextEditor
								label="Omschrijving van de opdracht"
								tall
								value={props.draft.asgDescription}
								onChange={(json) => set("asgDescription", json)}
							/>
						</div>
					</div>
				</Show>

				<div class="grid gap-4 border-line border-t pt-5 md:grid-cols-2">
					<Show when={props.availableLabels.length > 0}>
						<div class="flex flex-col gap-1.5">
							<span class="text-small font-medium text-ink-2">Leervoorkeur-labels</span>
							<div class="flex flex-wrap gap-1.5">
								<For each={props.availableLabels}>
									{(l) => (
										<button
											type="button"
											onClick={() => toggleLabel(l)}
											aria-pressed={props.draft.labels.includes(l) ? "true" : "false"}
											class="rounded-pill border border-line px-2.5 py-1 text-micro aria-pressed:border-primary aria-pressed:bg-primary-100 aria-pressed:text-primary-700"
										>
											{l}
										</button>
									)}
								</For>
							</div>
						</div>
					</Show>
					<Switch
						label="Telt mee voor de voortgang"
						checked={props.draft.countsForProgress}
						onChange={(on) => set("countsForProgress", on)}
					/>
				</div>
				<button type="submit" class="hidden" aria-hidden="true" tabindex="-1" />
			</form>
		</div>
	);
}
