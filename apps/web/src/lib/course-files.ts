import { client } from "./orpc";

/**
 * Stored course files as something the browser can show (INC-25, INC-27).
 * `courses.getFile` hands out a short-lived link (5 minutes in production, a
 * data URL in local dev), so links are asked for when they are needed and
 * reused for a little while.
 */

export type StoredFile = {
	url: string;
	contentType: string;
	fileName: string;
	/** Bytes; null when unknown (INC-37). */
	size: number | null;
};

const FRESH_MS = 4 * 60_000;
const cache = new Map<string, { at: number; file: Promise<StoredFile> }>();

/**
 * Files just uploaded in the editor (an image in a text, a file block), shown
 * from memory until the block is saved: before that, the server doesn't hand
 * them out, since no block refers to them yet.
 */
const localPreviews = new Map<string, StoredFile>();

export function rememberLocalPreview(storageKey: string, file: File | Blob): string {
	const url = URL.createObjectURL(file);
	localPreviews.set(storageKey, {
		url,
		contentType: file.type || "application/octet-stream",
		fileName: file instanceof File ? file.name : storageKey,
		size: file.size,
	});
	return url;
}

/**
 * A data URL can't be opened in a frame or a new tab in every browser; a blob
 * URL of the same bytes can.
 */
async function toBrowserUrl(url: string): Promise<string> {
	if (!url.startsWith("data:")) return url;
	const blob = await (await fetch(url)).blob();
	return URL.createObjectURL(blob);
}

/** The file to show inline. */
export function viewFile(
	storageKey: string,
	/** Skip the cache: the link in use has expired (INC-37 AC6). */
	options: { fresh?: boolean } = {},
): Promise<StoredFile> {
	const local = localPreviews.get(storageKey);
	if (local) return Promise.resolve(local);
	const hit = cache.get(storageKey);
	if (hit && !options.fresh && Date.now() - hit.at < FRESH_MS) return hit.file;
	const file = client.courses
		.getFile({ storageKey })
		.then(async (f) => ({ ...f, url: await toBrowserUrl(f.url) }));
	cache.set(storageKey, { at: Date.now(), file });
	file.catch(() => cache.delete(storageKey));
	return file;
}

/** A fresh link that makes the browser save the file. */
export async function downloadFile(storageKey: string): Promise<void> {
	const local = localPreviews.get(storageKey);
	const f = local ?? (await client.courses.getFile({ storageKey, download: true }));
	const url = local ? local.url : await toBrowserUrl(f.url);
	const a = document.createElement("a");
	a.href = url;
	a.download = f.fileName;
	a.rel = "noopener";
	document.body.append(a);
	a.click();
	a.remove();
}

/** Open the file in a new tab with a fresh link. */
export async function openFile(storageKey: string): Promise<void> {
	// Open the tab inside the click, so it isn't blocked as a pop-up.
	const tab = window.open("", "_blank");
	try {
		const local = localPreviews.get(storageKey);
		const url = local ? local.url : await toBrowserUrl((await client.courses.getFile({ storageKey })).url);
		if (tab) {
			tab.opener = null;
			tab.location.href = url;
		} else window.location.href = url;
	} catch (error) {
		tab?.close();
		throw error;
	}
}

/** Only these links are followed from a course text (INC-25 AC4). */
export function safeHref(href: unknown): string | null {
	if (typeof href !== "string") return null;
	const trimmed = href.trim();
	return /^(https?:\/\/|mailto:)/i.test(trimmed) ? trimmed : null;
}

/** The 11-character video id of a YouTube link, or null. */
export function youtubeId(src: unknown): string | null {
	if (typeof src !== "string") return null;
	const m =
		src.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/) ??
		src.match(/^([A-Za-z0-9_-]{11})$/);
	return m ? m[1]! : null;
}

export const youtubeEmbed = (id: string) => `https://www.youtube-nocookie.com/embed/${id}`;

/** "1,2 MB", for next to a download (INC-37). */
export function formatSize(bytes: number | null | undefined): string | null {
	if (bytes === null || bytes === undefined) return null;
	if (bytes < 1024) return `${bytes} B`;
	const kb = bytes / 1024;
	if (kb < 1024) return `${Math.round(kb)} kB`;
	return `${(kb / 1024).toLocaleString("nl-NL", { maximumFractionDigits: 1 })} MB`;
}
