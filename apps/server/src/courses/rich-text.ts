/**
 * Course texts (a pagina, an opdracht description) are stored as ProseMirror
 * JSON from the Tiptap editor (INC-25); older ones are plain text. Places that
 * only show text — the takenlijst — need the words without the structure.
 */

type PMNode = { type?: string; text?: string; content?: PMNode[] };

const BLOCK_TYPES = new Set([
	"paragraph",
	"heading",
	"blockquote",
	"listItem",
	"codeBlock",
	"horizontalRule",
]);

function walk(node: PMNode, out: string[]): void {
	if (node.type === "text") {
		out.push(node.text ?? "");
		return;
	}
	if (node.type === "hardBreak") {
		out.push("\n");
		return;
	}
	if (node.type === "listItem") out.push("- ");
	for (const child of node.content ?? []) walk(child, out);
	if (node.type && BLOCK_TYPES.has(node.type)) out.push("\n");
}

/** The plain text of a stored course text; plain text passes through. */
export function richTextToPlain(value: string | null | undefined): string | null {
	if (!value) return value ?? null;
	let doc: PMNode;
	try {
		doc = JSON.parse(value) as PMNode;
	} catch {
		return value;
	}
	if (!doc || typeof doc !== "object" || doc.type !== "doc") return value;
	const out: string[] = [];
	walk(doc, out);
	const text = out
		.join("")
		.replace(/[ \t]+\n/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
	return text || null;
}
