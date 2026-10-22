import { mergeAttributes, Node } from "@tiptap/core";
import { viewFile } from "../../lib/course-files";

declare module "@tiptap/core" {
	interface Commands<ReturnType> {
		courseImage: {
			/** Insert an uploaded image with its alt text. */
			insertCourseImage: (attrs: { storageKey: string; alt: string }) => ReturnType;
		};
	}
}

/**
 * An image inside a course text (INC-25). The document keeps the storage key
 * and alt text, never a URL: links to stored files expire, so the editor (and
 * the leerling's view) ask for a fresh one. Pasted images from elsewhere have
 * no storage key and are dropped, so a text never points at outside images.
 */
export const CourseImage = Node.create({
	name: "image",
	group: "block",
	atom: true,
	draggable: true,

	addAttributes() {
		return {
			storageKey: {
				default: null,
				parseHTML: (el) => el.getAttribute("data-storage-key"),
				renderHTML: (attrs) => ({ "data-storage-key": attrs.storageKey }),
			},
			alt: {
				default: "",
				parseHTML: (el) => el.getAttribute("alt") ?? "",
				renderHTML: (attrs) => ({ alt: attrs.alt }),
			},
		};
	},

	parseHTML() {
		return [{ tag: "img[data-storage-key]" }];
	},

	renderHTML({ HTMLAttributes }) {
		return ["img", mergeAttributes(HTMLAttributes)];
	},

	addNodeView() {
		return ({ node }) => {
			const img = document.createElement("img");
			img.alt = node.attrs.alt ?? "";
			img.className = "my-3 max-w-full rounded-2 border border-line";
			if (node.attrs.storageKey) {
				void viewFile(node.attrs.storageKey)
					.then((f) => {
						img.src = f.url;
					})
					.catch(() => {
						img.alt = `${node.attrs.alt ?? ""} (afbeelding niet gevonden)`;
					});
			}
			return { dom: img };
		};
	},

	addCommands() {
		return {
			insertCourseImage:
				(attrs) =>
				({ commands }) =>
					commands.insertContent({ type: this.name, attrs }),
		};
	},
});
