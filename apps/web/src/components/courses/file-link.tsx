import { useQuery } from "@tanstack/solid-query";
import { Download, FileText } from "lucide-solid";
import { Show } from "solid-js";
import { orpc } from "../../lib/orpc";
import { buttonVariants } from "../ui/button";

/**
 * Render a download/open link for a stored file (bestand CbS #30, submission
 * files #27, grading media #28). Resolves the opaque storageKey to a viewable
 * URL via `courses.getFile` (a real S3 URL in prod, a base64 data URL in dev).
 */
export function FileLink(props: { storageKey: string; label?: string }) {
	const fileQuery = useQuery(() => ({
		...orpc.courses.getFile.queryOptions({
			input: { storageKey: props.storageKey },
		}),
		staleTime: 5 * 60_000,
	}));

	const filename = () => props.storageKey.split("/").pop() ?? "bestand";

	return (
		<Show
			when={fileQuery.data?.url}
			fallback={
				<span class="inline-flex items-center gap-2 text-small text-muted">
					<FileText class="size-4" /> {props.label ?? filename()}
				</span>
			}
		>
			{(url) => (
				<a
					href={url()}
					target="_blank"
					rel="noopener"
					download={filename()}
					class={buttonVariants({ variant: "ghost", size: "sm" })}
				>
					<Download class="size-4" />
					{props.label ?? filename()}
				</a>
			)}
		</Show>
	);
}
