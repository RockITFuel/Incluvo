import { createSignal, Match, Show, Switch } from "solid-js";
import { downloadFile, formatSize, openFile, viewFile } from "../../lib/course-files";
import { createLoad } from "../../lib/load";
import { Download, ExternalLink, FileText } from "../../lib/icons";
import { Button } from "../ui/button";
import { toast } from "../ui/toast";

type Kind = "pdf" | "image" | "audio" | "video" | "other";

function kindOf(contentType: string, fileName: string): Kind {
	if (contentType === "application/pdf") return "pdf";
	if (contentType.startsWith("image/")) return "image";
	// A .webm may be a recording or a film; a video element plays both.
	if (contentType.startsWith("video/") || fileName.toLowerCase().endsWith(".webm")) return "video";
	if (contentType.startsWith("audio/")) return "audio";
	return "other";
}

const TYPE_LABEL: Record<string, string> = {
	pdf: "PDF",
	doc: "Word",
	docx: "Word",
	ppt: "PowerPoint",
	pptx: "PowerPoint",
	xlsx: "Excel",
	png: "Afbeelding",
	jpg: "Afbeelding",
	jpeg: "Afbeelding",
	webp: "Afbeelding",
	mp3: "Audio",
	mp4: "Video",
	webm: "Video",
};

const fail = (what: string) => (error: unknown) =>
	toast({ title: `${what} lukte niet`, description: (error as Error).message, tone: "danger" });

/**
 * A course file shown in the page when the browser can (INC-27, INC-37): a PDF
 * in a viewer, an image, audio or video with a player. Word, PowerPoint and
 * Excel can't be shown by a browser itself, so those get a clear download with
 * name, type and size. Open and download are always there, with a fresh link
 * each time. Links expire after a few minutes: when the player or image fails
 * on one, it gets a fresh link once and carries on where it was; if that fails
 * too, a message offers to try again.
 */
export function FileView(props: {
	storageKey: string;
	/** What the file is about; without it, the file name. */
	title?: string;
}) {
	const file = createLoad(
		() => props.storageKey,
		(key) => viewFile(key),
	);
	// The link in use: the loaded one, or a fresh one after it expired.
	const [url, setUrl] = createSignal(() => file.data()?.url);
	const [failed, setFailed] = createSignal(false);
	let refreshed = false;
	// A phone or tablet often shows only the first page of an embedded PDF.
	const compact =
		typeof window !== "undefined" &&
		window.matchMedia("(max-width: 640px), (pointer: coarse)").matches;

	const name = () => props.title ?? file.data()?.fileName ?? "Bestand";
	const kind = () => {
		const f = file.data();
		return f ? kindOf(f.contentType, f.fileName) : null;
	};
	const typeLabel = () => {
		const fileName = file.data()?.fileName ?? props.storageKey;
		return TYPE_LABEL[fileName.split(".").pop()?.toLowerCase() ?? ""] ?? "Bestand";
	};

	// A link that loaded may expire again later (a long video): allow a refresh again.
	const loaded = () => {
		refreshed = false;
	};
	/** The image or player couldn't load its link: get a fresh one, once. */
	const onMediaError = async (el: HTMLMediaElement | HTMLImageElement) => {
		if (refreshed) {
			setFailed(true);
			return;
		}
		refreshed = true;
		const at = el instanceof HTMLMediaElement ? el.currentTime : 0;
		const wasPlaying = el instanceof HTMLMediaElement && !el.paused;
		try {
			const fresh = await viewFile(props.storageKey, { fresh: true });
			setUrl(fresh.url);
			if (el instanceof HTMLMediaElement) {
				el.addEventListener(
					"loadedmetadata",
					() => {
						el.currentTime = at;
						if (wasPlaying) void el.play().catch(() => {});
					},
					{ once: true },
				);
			}
		} catch {
			setFailed(true);
		}
	};
	const retry = () => {
		refreshed = false;
		setFailed(false);
		if (file.error()) file.reload();
		else void viewFile(props.storageKey, { fresh: true }).then((f) => setUrl(f.url), () => setFailed(true));
	};

	return (
		<div class="flex flex-col gap-3">
			<div class="flex flex-wrap items-center gap-2">
				<FileText class="size-4 text-muted" />
				<span class="min-w-0 flex-1 text-small text-ink [overflow-wrap:anywhere]">
					{file.data()?.fileName ?? name()}
					<span class="text-muted">
						{" "}
						· {typeLabel()}
						<Show when={formatSize(file.data()?.size)}>{(size) => <> · {size()}</>}</Show>
					</span>
				</span>
				<Button
					size="sm"
					variant="ghost"
					onClick={() => void openFile(props.storageKey).catch(fail("Openen"))}
				>
					<ExternalLink class="size-4" /> Openen
					<span class="sr-only"> in een nieuw tabblad</span>
				</Button>
				<Button
					size="sm"
					variant="ghost"
					onClick={() => void downloadFile(props.storageKey).catch(fail("Downloaden"))}
				>
					<Download class="size-4" /> Downloaden
				</Button>
			</div>

			<Show when={file.error() || failed()}>
				<div class="flex flex-wrap items-center gap-2" role="alert">
					<p class="text-small text-danger">
						{kind() === "audio" || kind() === "video"
							? "Afspelen lukte niet."
							: "Dit bestand kon niet worden getoond."}{" "}
						Openen of downloaden kan nog wel.
					</p>
					<Button size="sm" variant="ghost" onClick={retry}>
						Opnieuw proberen
					</Button>
				</div>
			</Show>

			<Show when={!failed() && url()}>
				{(src) => (
					<Switch>
						<Match when={kind() === "pdf" && !compact}>
							<iframe
								src={src()}
								title={`${name()} (pdf)`}
								class="h-[75vh] w-full rounded-2 border border-line bg-bg-2"
							/>
						</Match>
						<Match when={kind() === "image"}>
							<img
								src={src()}
								alt={name()}
								class="max-w-full rounded-2 border border-line"
								onLoad={loaded}
								onError={(e) => void onMediaError(e.currentTarget)}
							/>
						</Match>
						<Match when={kind() === "video"}>
							<video
								src={src()}
								controls
								preload="metadata"
								aria-label={`Video: ${name()}`}
								class="w-full max-w-3xl rounded-2 bg-ink"
								onLoadedData={loaded}
								onError={(e) => void onMediaError(e.currentTarget)}
							>
								<track kind="captions" />
							</video>
						</Match>
						<Match when={kind() === "audio"}>
							<audio
								src={src()}
								controls
								preload="metadata"
								aria-label={`Audio: ${name()}`}
								class="w-full max-w-xl"
								onLoadedData={loaded}
								onError={(e) => void onMediaError(e.currentTarget)}
							/>
						</Match>
						<Match when={kind() === "other"}>
							<p class="text-small text-muted">
								Een {typeLabel()}-bestand kan niet in de browser worden getoond. Download het om
								het te openen.
							</p>
						</Match>
					</Switch>
				)}
			</Show>
		</div>
	);
}
