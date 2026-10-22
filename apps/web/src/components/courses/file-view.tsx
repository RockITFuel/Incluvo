import { Match, Show, Switch } from "solid-js";
import { downloadFile, openFile, viewFile } from "../../lib/course-files";
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
 * A course file shown in the page when the browser can (INC-27): a PDF in a
 * viewer, an image, audio or video with a player. Word, PowerPoint and Excel
 * can't be shown by a browser itself, so those get a clear download. Open and
 * download are always there, with a fresh link each time (links expire).
 */
export function FileView(props: { storageKey: string; title: string }) {
	const file = createLoad(
		() => props.storageKey,
		(key) => viewFile(key),
	);
	// A phone or tablet often shows only the first page of an embedded PDF.
	const compact =
		typeof window !== "undefined" &&
		window.matchMedia("(max-width: 640px), (pointer: coarse)").matches;

	const kind = () => {
		const f = file.data();
		return f ? kindOf(f.contentType, f.fileName) : null;
	};
	const typeLabel = () => {
		const name = file.data()?.fileName ?? props.storageKey;
		return TYPE_LABEL[name.split(".").pop()?.toLowerCase() ?? ""] ?? "Bestand";
	};

	return (
		<div class="flex flex-col gap-3">
			<div class="flex flex-wrap items-center gap-2">
				<FileText class="size-4 text-muted" />
				<span class="min-w-0 flex-1 text-small text-ink [overflow-wrap:anywhere]">
					{file.data()?.fileName ?? props.title}
					<span class="text-muted"> · {typeLabel()}</span>
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

			<Show when={file.error()}>
				<p class="text-small text-danger">Dit bestand kon niet worden opgehaald.</p>
			</Show>

			<Show when={file.data()}>
				{(f) => (
					<Switch>
						<Match when={kind() === "pdf" && !compact}>
							<iframe
								src={f().url}
								title={`${props.title} (pdf)`}
								class="h-[75vh] w-full rounded-2 border border-line bg-bg-2"
							/>
						</Match>
						<Match when={kind() === "image"}>
							<img src={f().url} alt={props.title} class="max-w-full rounded-2 border border-line" />
						</Match>
						<Match when={kind() === "video"}>
							<video src={f().url} controls preload="metadata" class="w-full max-w-3xl rounded-2 bg-ink">
								<track kind="captions" />
							</video>
						</Match>
						<Match when={kind() === "audio"}>
							<audio src={f().url} controls preload="metadata" class="w-full max-w-xl" />
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
