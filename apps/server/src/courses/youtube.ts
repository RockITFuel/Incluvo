/**
 * YouTube id validation + nocookie embed for the youtube CbS (#31).
 *
 * Per `docs/decisions/tooling.md` we only ever store/serve a **server-validated
 * 11-char id** and embed via `youtube-nocookie.com` (no tracking before play).
 * We accept a raw id or any common watch/share/embed URL and normalise to the id.
 */

/** A YouTube video id is exactly 11 chars from `[A-Za-z0-9_-]`. */
const ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * Extract & validate an 11-char YouTube id from a raw id or URL. Returns the id,
 * or `null` if nothing valid was found.
 */
export function parseYoutubeId(input: string): string | null {
	const raw = input.trim();
	if (ID_RE.test(raw)) return raw;

	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return null;
	}

	const host = url.hostname.replace(/^www\./, "");
	let candidate: string | null = null;

	if (host === "youtu.be") {
		candidate = url.pathname.slice(1);
	} else if (
		host === "youtube.com" ||
		host === "m.youtube.com" ||
		host === "youtube-nocookie.com"
	) {
		if (url.pathname === "/watch") {
			candidate = url.searchParams.get("v");
		} else if (
			url.pathname.startsWith("/embed/") ||
			url.pathname.startsWith("/shorts/") ||
			url.pathname.startsWith("/v/")
		) {
			candidate = url.pathname.split("/")[2] ?? null;
		}
	}

	if (candidate && ID_RE.test(candidate)) return candidate;
	return null;
}

/** The privacy-preserving nocookie embed URL for a validated id. */
export function youtubeEmbedUrl(id: string): string {
	return `https://www.youtube-nocookie.com/embed/${id}`;
}
