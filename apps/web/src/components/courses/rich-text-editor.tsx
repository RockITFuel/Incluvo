import { Editor } from "@tiptap/core";
import { TableKit } from "@tiptap/extension-table";
import { TextAlign } from "@tiptap/extension-text-align";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import { Youtube } from "@tiptap/extension-youtube";
import { StarterKit } from "@tiptap/starter-kit";
import type { JSX } from "@solidjs/web";
import { createSignal, For, onSettled, Show, untrack } from "solid-js";
import {
	Bold,
	Heading2,
	Heading3,
	Image as ImageIcon,
	Italic,
	Link as LinkIcon,
	List,
	ListOrdered,
	Palette,
	Quote,
	Redo2,
	Table as TableIcon,
	TextAlignCenter,
	TextAlignEnd,
	TextAlignStart,
	Underline,
	Undo2,
	Youtube as YoutubeIcon,
} from "../../lib/icons";
import { TEXT_COLORS } from "../../lib/text-colors";
import { rememberLocalPreview, safeHref, youtubeId } from "../../lib/course-files";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Input } from "../ui/text-field";
import { toast } from "../ui/toast";
import { CourseImage } from "./tiptap-image";
import { uploadFile } from "./upload";

/**
 * The text editor of the course builder (INC-25): pages and opdracht
 * descriptions. Tiptap v3 on `@tiptap/core` directly (solid-tiptap targets
 * Solid 1). Persists **ProseMirror JSON** (as a string) via `onChange`; the
 * leerling sees it through `RichTextView`. Only what the schema knows survives
 * a paste from Word or Google Docs: headings, bold/italic/underline, lists,
 * quotes and links stay, fonts and colours go (AC7).
 */
export function RichTextEditor(props: {
	/** Initial ProseMirror JSON as a string, plain text, or empty. */
	value?: string | null;
	onChange: (json: string) => void;
	/** Accessible name of the text area. */
	label: string;
	/** Taller editing area, for the full-screen editor (INC-26). */
	tall?: boolean;
}) {
	let element: HTMLDivElement | undefined;
	// Tiptap calls back from its own code (sometimes while Solid owns the
	// scope), so these signals allow owned writes.
	const [editor, setEditor] = createSignal<Editor | undefined>(undefined, { ownedWrite: true });
	// Bumped on every selection/transaction so the toolbar's `active()` getters
	// re-run and `aria-pressed` stays in sync as the caret moves.
	const [tick, setTick] = createSignal(0, { ownedWrite: true });
	const bump = () => setTick((t) => t + 1);

	// The initial content only: the editor owns the document after that. Plain
	// text from before the editor (an old opdracht description) becomes paragraphs.
	const initialContent = untrack(() => {
		const value = props.value;
		if (!value) return "";
		try {
			const parsed = JSON.parse(value);
			if (parsed && typeof parsed === "object" && parsed.type === "doc") return parsed;
		} catch {
			// Plain text.
		}
		return {
			type: "doc",
			content: value.split(/\n{2,}/).map((p) => ({
				type: "paragraph",
				content: p.trim() ? [{ type: "text", text: p }] : [],
			})),
		};
	});

	onSettled(() => {
		if (!element) return;
		const instance = new Editor({
			element,
			extensions: [
				StarterKit.configure({
					heading: { levels: [2, 3] },
					codeBlock: false,
					link: {
						openOnClick: false,
						autolink: true,
						defaultProtocol: "https",
						protocols: ["http", "https", "mailto"],
						isAllowedUri: (url) => safeHref(url) !== null,
						HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
					},
				}),
				CourseImage,
				Youtube.configure({ nocookie: true, controls: true, width: 640, height: 360 }),
				TextAlign.configure({ types: ["heading", "paragraph"], alignments: ["left", "center", "right"] }),
				TextStyle,
				Color,
				TableKit.configure({ table: { resizable: false } }),
			],
			content: initialContent,
			editorProps: {
				attributes: {
					class: [
						"prose-incluvo rounded-2 border border-line bg-surface px-4 py-3 text-body text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
						untrack(() => props.tall) ? "min-h-[55vh]" : "min-h-40",
					].join(" "),
					role: "textbox",
					"aria-multiline": "true",
					"aria-label": untrack(() => props.label),
				},
			},
			onUpdate({ editor: ed }) {
				props.onChange(JSON.stringify(ed.getJSON()));
				bump();
			},
			onSelectionUpdate: bump,
			onTransaction: bump,
		});
		setEditor(() => instance);
		return () => instance.destroy();
	});

	// ── Dialogs for a link, an image, a video and a colour ──────────────────
	const [colorOpen, setColorOpen] = createSignal(false);
	const [linkOpen, setLinkOpen] = createSignal(false);
	const [linkUrl, setLinkUrl] = createSignal("");
	const [linkError, setLinkError] = createSignal<string | undefined>();
	const openLink = () => {
		const current = editor()?.getAttributes("link").href;
		setLinkUrl(typeof current === "string" ? current : "");
		setLinkError(undefined);
		setLinkOpen(true);
	};
	const saveLink = () => {
		const ed = editor();
		if (!ed) return;
		let url = linkUrl().trim();
		if (url && !/^[a-z]+:/i.test(url)) url = `https://${url}`;
		if (!url) {
			ed.chain().focus().extendMarkRange("link").unsetLink().run();
			setLinkOpen(false);
			return;
		}
		if (!safeHref(url)) {
			setLinkError("Een link begint met http://, https:// of mailto:.");
			return;
		}
		const chain = ed.chain().focus().extendMarkRange("link");
		// Without a selection, the address itself becomes the link text.
		if (ed.state.selection.empty && !ed.isActive("link")) {
			chain.insertContent({ type: "text", text: url, marks: [{ type: "link", attrs: { href: url } }] }).run();
		} else {
			chain.setLink({ href: url }).run();
		}
		setLinkOpen(false);
	};

	const [imageOpen, setImageOpen] = createSignal(false);
	const [imageFile, setImageFile] = createSignal<File | null>(null);
	const [imageAlt, setImageAlt] = createSignal("");
	const [imageError, setImageError] = createSignal<string | undefined>();
	const [uploading, setUploading] = createSignal(false);
	const openImage = () => {
		setImageFile(null);
		setImageAlt("");
		setImageError(undefined);
		setImageOpen(true);
	};
	const saveImage = async () => {
		const file = imageFile();
		const alt = imageAlt().trim();
		if (!file) return setImageError("Kies een afbeelding.");
		if (!alt) return setImageError("Beschrijf wat er op de afbeelding staat.");
		setUploading(true);
		try {
			const storageKey = await uploadFile(file, "inhoud");
			rememberLocalPreview(storageKey, file);
			editor()?.chain().focus().insertCourseImage({ storageKey, alt }).run();
			setImageOpen(false);
		} catch (err) {
			toast({ title: "Uploaden lukte niet", description: (err as Error).message, tone: "danger" });
		} finally {
			setUploading(false);
		}
	};

	const [videoOpen, setVideoOpen] = createSignal(false);
	const [videoUrl, setVideoUrl] = createSignal("");
	const [videoError, setVideoError] = createSignal<string | undefined>();
	const openVideo = () => {
		setVideoUrl("");
		setVideoError(undefined);
		setVideoOpen(true);
	};
	const saveVideo = () => {
		const id = youtubeId(videoUrl().trim());
		if (!id) return setVideoError("Dit is geen YouTube-link.");
		editor()?.chain().focus().setYoutubeVideo({ src: `https://www.youtube.com/watch?v=${id}` }).run();
		setVideoOpen(false);
	};

	// ── Toolbar ─────────────────────────────────────────────────────────────
	type Tool = {
		label: string;
		icon: () => JSX.Element;
		run: () => void;
		active?: () => boolean;
		disabled?: () => boolean;
		/** Starts a new group in the toolbar. */
		group?: boolean;
	};
	const tools = (): Tool[] => {
		const ed = editor();
		if (!ed) return [];
		// Read `tick()` so each getter re-evaluates on selection/transaction.
		const isActive = (name: string | Record<string, unknown>, attrs?: Record<string, unknown>) => {
			tick();
			return typeof name === "string" ? ed.isActive(name, attrs as never) : ed.isActive(name as never);
		};
		const can = (check: () => boolean) => {
			tick();
			return check();
		};
		return [
			{
				label: "Kop",
				icon: () => <Heading2 class="size-4" />,
				run: () => ed.chain().focus().toggleHeading({ level: 2 }).run(),
				active: () => isActive("heading", { level: 2 }),
			},
			{
				label: "Tussenkop",
				icon: () => <Heading3 class="size-4" />,
				run: () => ed.chain().focus().toggleHeading({ level: 3 }).run(),
				active: () => isActive("heading", { level: 3 }),
			},
			{
				label: "Vet",
				icon: () => <Bold class="size-4" />,
				run: () => ed.chain().focus().toggleBold().run(),
				active: () => isActive("bold"),
				group: true,
			},
			{
				label: "Cursief",
				icon: () => <Italic class="size-4" />,
				run: () => ed.chain().focus().toggleItalic().run(),
				active: () => isActive("italic"),
			},
			{
				label: "Onderstrepen",
				icon: () => <Underline class="size-4" />,
				run: () => ed.chain().focus().toggleUnderline().run(),
				active: () => isActive("underline"),
			},
			{
				label: "Tekstkleur",
				icon: () => <Palette class="size-4" />,
				run: () => setColorOpen(true),
				active: () => isActive("textStyle"),
			},
			{
				label: "Links uitlijnen",
				icon: () => <TextAlignStart class="size-4" />,
				run: () => ed.chain().focus().unsetTextAlign().run(),
				active: () => !isActive({ textAlign: "center" } as never) && !isActive({ textAlign: "right" } as never),
				group: true,
			},
			{
				label: "Centreren",
				icon: () => <TextAlignCenter class="size-4" />,
				run: () => ed.chain().focus().setTextAlign("center").run(),
				active: () => isActive({ textAlign: "center" } as never),
			},
			{
				label: "Rechts uitlijnen",
				icon: () => <TextAlignEnd class="size-4" />,
				run: () => ed.chain().focus().setTextAlign("right").run(),
				active: () => isActive({ textAlign: "right" } as never),
			},
			{
				label: "Opsomming",
				icon: () => <List class="size-4" />,
				run: () => ed.chain().focus().toggleBulletList().run(),
				active: () => isActive("bulletList"),
				group: true,
			},
			{
				label: "Genummerde lijst",
				icon: () => <ListOrdered class="size-4" />,
				run: () => ed.chain().focus().toggleOrderedList().run(),
				active: () => isActive("orderedList"),
			},
			{
				label: "Citaat",
				icon: () => <Quote class="size-4" />,
				run: () => ed.chain().focus().toggleBlockquote().run(),
				active: () => isActive("blockquote"),
			},
			{
				label: "Link",
				icon: () => <LinkIcon class="size-4" />,
				run: openLink,
				active: () => isActive("link"),
				group: true,
			},
			{
				label: "Afbeelding",
				icon: () => <ImageIcon class="size-4" />,
				run: openImage,
			},
			{
				label: "YouTube-video",
				icon: () => <YoutubeIcon class="size-4" />,
				run: openVideo,
			},
			{
				label: "Tabel",
				icon: () => <TableIcon class="size-4" />,
				run: () => ed.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
				active: () => isActive("table"),
			},
			{
				label: "Ongedaan maken",
				icon: () => <Undo2 class="size-4" />,
				run: () => ed.chain().focus().undo().run(),
				disabled: () => can(() => !ed.can().undo()),
				group: true,
			},
			{
				label: "Opnieuw",
				icon: () => <Redo2 class="size-4" />,
				run: () => ed.chain().focus().redo().run(),
				disabled: () => can(() => !ed.can().redo()),
			},
		];
	};

	return (
		<div class="flex flex-col gap-2">
			<Show when={editor()}>
				<div
					class="sticky top-[4.25rem] z-10 flex flex-wrap items-center gap-1 bg-bg py-1"
					role="toolbar"
					aria-label="Tekstopmaak"
				>
					<For each={tools()}>
						{(t) => (
							<>
								<Show when={t.group}>
									<span class="mx-1 h-6 w-px bg-line" aria-hidden="true" />
								</Show>
								<button
									type="button"
									aria-label={t.label}
									title={t.label}
									aria-pressed={t.active ? (t.active() ? "true" : "false") : undefined}
									disabled={t.disabled?.()}
									onClick={() => t.run()}
									class={[
										"grid size-9 place-items-center rounded-2 border border-line text-ink-2 hover:bg-line-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40",
										{ "bg-primary-100 text-primary-700": t.active?.() ?? false },
									]}
								>
									{t.icon()}
								</button>
							</>
						)}
					</For>
				</div>
				{/* In a table: rows and columns (INC-25). */}
				<Show when={(tick(), editor()?.isActive("table"))}>
					<div class="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Tabel">
						<For
							each={[
								["Rij erbij", () => editor()?.chain().focus().addRowAfter().run()],
								["Kolom erbij", () => editor()?.chain().focus().addColumnAfter().run()],
								["Rij weg", () => editor()?.chain().focus().deleteRow().run()],
								["Kolom weg", () => editor()?.chain().focus().deleteColumn().run()],
								["Tabel weg", () => editor()?.chain().focus().deleteTable().run()],
							] as const}
						>
							{([label, run]) => (
								<Button size="sm" variant="ghost" onClick={() => run()}>
									{label}
								</Button>
							)}
						</For>
					</div>
				</Show>
			</Show>
			<div ref={(el) => (element = el)} />

			<Dialog
				open={colorOpen()}
				onOpenChange={setColorOpen}
				title="Tekstkleur"
				description="Voor de geselecteerde tekst. Deze kleuren zijn goed leesbaar."
			>
				<div class="flex flex-wrap gap-2">
					<Button
						variant="ghost"
						onClick={() => {
							editor()?.chain().focus().unsetColor().run();
							setColorOpen(false);
						}}
					>
						Standaard
					</Button>
					<For each={TEXT_COLORS}>
						{(c) => (
							<Button
								variant="ghost"
								onClick={() => {
									editor()?.chain().focus().setColor(c.value).run();
									setColorOpen(false);
								}}
							>
								<span class={["font-medium", c.class]}>{c.label}</span>
							</Button>
						)}
					</For>
				</div>
			</Dialog>

			<Dialog
				open={linkOpen()}
				onOpenChange={setLinkOpen}
				title="Link"
				description="Leeg laten haalt de link weg."
				footer={
					<>
						<Button variant="ghost" onClick={() => setLinkOpen(false)}>
							Annuleren
						</Button>
						<Button onClick={saveLink}>Opslaan</Button>
					</>
				}
			>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						saveLink();
					}}
				>
					<Input
						label="Adres"
						placeholder="https://…"
						value={linkUrl()}
						error={linkError()}
						onInput={(e) => setLinkUrl(e.currentTarget.value)}
					/>
				</form>
			</Dialog>

			<Dialog
				open={imageOpen()}
				onOpenChange={setImageOpen}
				title="Afbeelding toevoegen"
				description="PNG, JPG of WebP. De beschrijving lezen schermlezers voor."
				footer={
					<>
						<Button variant="ghost" onClick={() => setImageOpen(false)}>
							Annuleren
						</Button>
						<Button disabled={uploading()} onClick={() => void saveImage()}>
							{uploading() ? "Uploaden…" : "Toevoegen"}
						</Button>
					</>
				}
			>
				<div class="flex flex-col gap-3">
					<label class="flex flex-col gap-1.5 text-small font-medium text-ink-2">
						Afbeelding
						<input
							type="file"
							accept="image/png,image/jpeg,image/webp"
							class="text-small file:mr-3 file:rounded-2 file:border-0 file:bg-primary-50 file:px-3 file:py-1.5 file:text-primary-700"
							onChange={(e) => setImageFile(e.currentTarget.files?.[0] ?? null)}
						/>
					</label>
					<Input
						label="Beschrijving (alt-tekst)"
						required
						value={imageAlt()}
						onInput={(e) => setImageAlt(e.currentTarget.value)}
					/>
					<Show when={imageError()}>
						<p class="text-small text-danger" role="alert">
							{imageError()}
						</p>
					</Show>
				</div>
			</Dialog>

			<Dialog
				open={videoOpen()}
				onOpenChange={setVideoOpen}
				title="YouTube-video toevoegen"
				footer={
					<>
						<Button variant="ghost" onClick={() => setVideoOpen(false)}>
							Annuleren
						</Button>
						<Button onClick={saveVideo}>Toevoegen</Button>
					</>
				}
			>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						saveVideo();
					}}
				>
					<Input
						label="YouTube-link"
						placeholder="https://www.youtube.com/watch?v=…"
						value={videoUrl()}
						error={videoError()}
						onInput={(e) => setVideoUrl(e.currentTarget.value)}
					/>
				</form>
			</Dialog>
		</div>
	);
}
