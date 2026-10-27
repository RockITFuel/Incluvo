import { Dynamic, type JSX } from "@solidjs/web";
import { For, Show, untrack } from "solid-js";
import { safeHref, viewFile, youtubeEmbed, youtubeId } from "../../lib/course-files";
import { createLoad } from "../../lib/load";
import { alignClass, textColorClass } from "../../lib/text-colors";

/**
 * Read-only view of a course text: a pagina or an opdracht description
 * (#29, INC-25). Rather than mount Tiptap per text, it walks the stored
 * ProseMirror JSON and renders what the editor can make. Links only open for
 * http(s) and mailto, videos only as a YouTube embed built from the id, images
 * only from storage; unknown nodes fall back to their text, so nothing is ever
 * injected. A text from before the editor is shown as it was typed.
 */

type PMMark = { type: string; attrs?: { href?: unknown; color?: unknown } };
type PMNode = {
	type: string;
	text?: string;
	attrs?: { level?: number; storageKey?: unknown; alt?: unknown; src?: unknown; textAlign?: unknown };
	marks?: PMMark[];
	content?: PMNode[];
};

// A saved text is static data: the nodes are read once, deliberately untracked.
function Text(props: { node: PMNode }) {
	const node = untrack(() => props.node);
	let el: unknown = node.text ?? "";
	for (const mark of node.marks ?? []) {
		if (mark.type === "code") el = <code>{el as never}</code>;
		else if (mark.type === "italic") el = <em>{el as never}</em>;
		else if (mark.type === "bold") el = <strong>{el as never}</strong>;
		else if (mark.type === "underline") el = <u>{el as never}</u>;
		else if (mark.type === "strike") el = <s>{el as never}</s>;
		else if (mark.type === "textStyle") {
			// Only the colours of the editor's list (lib/text-colors.ts).
			const color = textColorClass(mark.attrs?.color);
			if (color) el = <span class={color}>{el as never}</span>;
		}
		else if (mark.type === "link") {
			const href = safeHref(mark.attrs?.href);
			if (href) {
				el = (
					<a
						href={href}
						target="_blank"
						rel="noopener noreferrer"
						class="text-primary-700 underline underline-offset-2"
					>
						{el as never}
						<span class="sr-only"> (opent in een nieuw tabblad)</span>
					</a>
				);
			}
		}
	}
	return <>{el as never}</>;
}

function Inline(props: { nodes?: PMNode[] }) {
	return (
		<For each={props.nodes ?? []}>
			{(n) => (n.type === "hardBreak" ? <br /> : <Text node={n} />)}
		</For>
	);
}

function Blocks(props: { nodes?: PMNode[] }) {
	return <For each={props.nodes ?? []}>{(n) => renderNode(n)}</For>;
}

function StoredImage(props: { storageKey: string; alt: string }) {
	const file = createLoad(
		() => props.storageKey,
		(key) => viewFile(key),
	);
	return (
		<figure class="my-3">
			<Show
				when={file.data()}
				fallback={
					<div class="grid h-40 place-items-center rounded-2 border border-line bg-bg-2 text-small text-muted">
						{file.error() ? "Afbeelding niet gevonden" : "Afbeelding laden…"}
					</div>
				}
			>
				{(f) => <img src={f().url} alt={props.alt} class="max-w-full rounded-2 border border-line" />}
			</Show>
		</figure>
	);
}

/** One saved node. A plain function, not a component: a saved text doesn't change. */
function renderNode(n: PMNode): JSX.Element {
	switch (n.type) {
		case "heading": {
			const level = Math.min(Math.max(n.attrs?.level ?? 2, 2), 4);
			const cls =
				level <= 2 ? "text-h3 font-head text-ink mt-4 mb-2" : "text-body font-medium text-ink mt-3 mb-1";
			return (
				<Dynamic component={`h${level}`} class={[cls, alignClass(n.attrs?.textAlign)]}>
					<Inline nodes={n.content} />
				</Dynamic>
			);
		}
		case "paragraph":
			return (
				<p
					class={[
						"text-body text-ink-2 leading-relaxed mb-2 [overflow-wrap:anywhere]",
						alignClass(n.attrs?.textAlign),
					]}
				>
					<Inline nodes={n.content} />
				</p>
			);
		case "table":
			// Wide tables scroll inside their own box, not the page.
			return (
				<div class="my-3 max-w-full overflow-x-auto" role="region" aria-label="Tabel" tabindex="0">
					<table class="min-w-full border-collapse text-small text-ink-2">
						<tbody>
							<Blocks nodes={n.content} />
						</tbody>
					</table>
				</div>
			);
		case "tableRow":
			return (
				<tr>
					<Blocks nodes={n.content} />
				</tr>
			);
		case "tableHeader":
			return (
				<th scope="col" class="border border-line bg-bg-2 px-3 py-2 text-left font-medium text-ink">
					<Blocks nodes={n.content} />
				</th>
			);
		case "tableCell":
			return (
				<td class="border border-line px-3 py-2 align-top">
					<Blocks nodes={n.content} />
				</td>
			);
		case "bulletList":
			return (
				<ul class="list-disc pl-6 mb-2 text-ink-2">
					<Blocks nodes={n.content} />
				</ul>
			);
		case "orderedList":
			return (
				<ol class="list-decimal pl-6 mb-2 text-ink-2">
					<Blocks nodes={n.content} />
				</ol>
			);
		case "listItem":
			return (
				<li>
					<Blocks nodes={n.content} />
				</li>
			);
		case "blockquote":
			return (
				<blockquote class="my-3 border-l-4 border-primary-100 pl-4 text-ink-2 italic">
					<Blocks nodes={n.content} />
				</blockquote>
			);
		case "horizontalRule":
			return <hr class="my-4 border-line" />;
		case "image": {
			const key = typeof n.attrs?.storageKey === "string" ? n.attrs.storageKey : null;
			const alt = typeof n.attrs?.alt === "string" ? n.attrs.alt : "";
			return key ? <StoredImage storageKey={key} alt={alt} /> : null;
		}
		case "youtube": {
			const id = youtubeId(n.attrs?.src);
			return id ? (
				<div class="my-3 aspect-video w-full max-w-2xl overflow-hidden rounded-2 border border-line">
					<iframe
						src={youtubeEmbed(id)}
						title="YouTube-video"
						class="h-full w-full"
						allow="accelerometer; encrypted-media; picture-in-picture"
						allowfullscreen
						loading="lazy"
					/>
				</div>
			) : null;
		}
		case "text":
			return <Text node={n} />;
		default:
			return (
				<p class="text-body text-ink-2 mb-2">
					<Inline nodes={n.content} />
				</p>
			);
	}
}

export function RichTextView(props: { value: string | null | undefined }) {
	const doc = (): PMNode | null => {
		if (!props.value) return null;
		try {
			const parsed = JSON.parse(props.value) as PMNode;
			return parsed && parsed.type === "doc" ? parsed : null;
		} catch {
			return null;
		}
	};
	return (
		<Show
			when={doc()}
			fallback={
				<p class="text-body text-ink-2 whitespace-pre-wrap [overflow-wrap:anywhere]">{props.value ?? ""}</p>
			}
		>
			{(d) => (
				<div>
					<Blocks nodes={d().content} />
				</div>
			)}
		</Show>
	);
}
