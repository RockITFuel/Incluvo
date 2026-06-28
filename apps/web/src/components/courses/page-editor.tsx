import StarterKit from "@tiptap/starter-kit";
import { Bold, Heading2, Italic, List, ListOrdered } from "lucide-solid";
import { createEditor } from "solid-tiptap";
import { createSignal, For, onCleanup, Show } from "solid-js";
import { cn } from "../../lib/cn";

/**
 * WYSIWYG page editor for the pagina CbS (#29). Built on solid-tiptap + Tiptap
 * v3 StarterKit; persists **ProseMirror JSON** (serialised to a string) via
 * `onChange`. A small accessible toolbar covers headings, bold/italic and lists.
 */
export function PageEditor(props: {
	/** Initial ProseMirror JSON as a string (or empty for a blank doc). */
	value?: string;
	onChange: (json: string) => void;
}) {
	let ref!: HTMLDivElement;
	const [ready, setReady] = createSignal(false);
	// Bumped on every selection/transaction so the toolbar's `active()` getters
	// re-run and `aria-pressed` stays in sync as the caret moves (Tiptap mutates
	// state imperatively, outside Solid's reactivity).
	const [tick, setTick] = createSignal(0);

	const initialContent = (() => {
		if (!props.value) return "";
		try {
			return JSON.parse(props.value);
		} catch {
			return props.value;
		}
	})();

	const editor = createEditor(() => ({
		element: ref,
		extensions: [StarterKit],
		content: initialContent,
		editorProps: {
			attributes: {
				class:
					"prose-incluvo min-h-40 rounded-2 border border-line bg-surface px-4 py-3 text-body text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
			},
		},
		onCreate() {
			setReady(true);
		},
		onUpdate({ editor: ed }) {
			props.onChange(JSON.stringify(ed.getJSON()));
			setTick((t) => t + 1);
		},
		onSelectionUpdate() {
			setTick((t) => t + 1);
		},
		onTransaction() {
			setTick((t) => t + 1);
		},
	}));

	onCleanup(() => editor()?.destroy());

	type Tool = {
		label: string;
		icon: () => unknown;
		run: () => void;
		active: () => boolean;
	};
	const tools = (): Tool[] => {
		const ed = editor();
		if (!ed) return [];
		// Read `tick()` so each getter re-evaluates on selection/transaction.
		const isActive = (name: string, attrs?: Record<string, unknown>) => {
			tick();
			return ed.isActive(name, attrs as never);
		};
		return [
			{
				label: "Kop",
				icon: () => <Heading2 class="size-4" />,
				run: () => ed.chain().focus().toggleHeading({ level: 2 }).run(),
				active: () => isActive("heading", { level: 2 }),
			},
			{
				label: "Vet",
				icon: () => <Bold class="size-4" />,
				run: () => ed.chain().focus().toggleBold().run(),
				active: () => isActive("bold"),
			},
			{
				label: "Cursief",
				icon: () => <Italic class="size-4" />,
				run: () => ed.chain().focus().toggleItalic().run(),
				active: () => isActive("italic"),
			},
			{
				label: "Opsomming",
				icon: () => <List class="size-4" />,
				run: () => ed.chain().focus().toggleBulletList().run(),
				active: () => isActive("bulletList"),
			},
			{
				label: "Genummerd",
				icon: () => <ListOrdered class="size-4" />,
				run: () => ed.chain().focus().toggleOrderedList().run(),
				active: () => isActive("orderedList"),
			},
		];
	};

	return (
		<div class="flex flex-col gap-2">
			<Show when={ready()}>
				<div
					class="flex flex-wrap gap-1"
					role="toolbar"
					aria-label="Tekstopmaak"
				>
					<For each={tools()}>
						{(t) => (
							<button
								type="button"
								aria-label={t.label}
								aria-pressed={t.active()}
								onClick={t.run}
								class={cn(
									"grid size-9 place-items-center rounded-2 border border-line text-ink-2 hover:bg-line-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
									t.active() && "bg-primary-100 text-primary-700",
								)}
							>
								{t.icon() as never}
							</button>
						)}
					</For>
				</div>
			</Show>
			<div ref={ref} />
		</div>
	);
}
