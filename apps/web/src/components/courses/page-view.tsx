import { For, Show } from "solid-js";

/**
 * Read-only renderer for a pagina CbS (#29). Rather than mount a second Tiptap
 * instance per page in the leerling view, we walk the stored ProseMirror JSON
 * and render a small, safe subset (headings, paragraphs, marks, lists). Unknown
 * nodes fall back to their text content, so nothing is ever dangerously injected.
 */

type PMMark = { type: string };
type PMNode = {
	type: string;
	text?: string;
	attrs?: { level?: number };
	marks?: PMMark[];
	content?: PMNode[];
};

function Text(props: { node: PMNode }) {
	const marks = props.node.marks?.map((m) => m.type) ?? [];
	let el: unknown = props.node.text ?? "";
	if (marks.includes("code")) el = <code>{el as never}</code>;
	if (marks.includes("italic")) el = <em>{el as never}</em>;
	if (marks.includes("bold")) el = <strong>{el as never}</strong>;
	return <>{el as never}</>;
}

function Inline(props: { nodes?: PMNode[] }) {
	return (
		<For each={props.nodes ?? []}>{(n) => <Text node={n} />}</For>
	);
}

function Block(props: { node: PMNode }) {
	const n = props.node;
	switch (n.type) {
		case "heading": {
			const level = n.attrs?.level ?? 2;
			const cls = level <= 2 ? "text-h3 font-head text-ink mt-4 mb-2" : "text-body font-medium text-ink mt-3 mb-1";
			return (
				<p class={cls}>
					<Inline nodes={n.content} />
				</p>
			);
		}
		case "paragraph":
			return (
				<p class="text-body text-ink-2 leading-relaxed mb-2">
					<Inline nodes={n.content} />
				</p>
			);
		case "bulletList":
			return (
				<ul class="list-disc pl-6 mb-2 text-ink-2">
					<For each={n.content ?? []}>{(li) => <Block node={li} />}</For>
				</ul>
			);
		case "orderedList":
			return (
				<ol class="list-decimal pl-6 mb-2 text-ink-2">
					<For each={n.content ?? []}>{(li) => <Block node={li} />}</For>
				</ol>
			);
		case "listItem":
			return (
				<li>
					<For each={n.content ?? []}>{(c) => <Block node={c} />}</For>
				</li>
			);
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

export function PageView(props: { body: string | null }) {
	const doc = (): PMNode | null => {
		if (!props.body) return null;
		try {
			return JSON.parse(props.body) as PMNode;
		} catch {
			return null;
		}
	};
	return (
		<Show
			when={doc()}
			fallback={
				<p class="text-body text-ink-2 whitespace-pre-wrap">
					{props.body ?? ""}
				</p>
			}
		>
			{(d) => (
				<div>
					<For each={d().content ?? []}>{(node) => <Block node={node} />}</For>
				</div>
			)}
		</Show>
	);
}
