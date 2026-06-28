import { Link } from "@tanstack/solid-router";
import {
	CheckCircle2,
	Circle,
	FileText,
	MessageSquare,
	PlayCircle,
	Sparkles,
} from "lucide-solid";
import { For, Show } from "solid-js";
import { cn } from "../../lib/cn";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { AssignmentBlock } from "./assignment-block";
import { FileLink } from "./file-link";
import { PageView } from "./page-view";

export type BlockDTO = {
	id: string;
	type: "opdracht" | "pagina" | "bestand" | "youtube" | "forum" | "lti";
	title: string;
	body: string | null;
	youtubeId: string | null;
	youtubeEmbedUrl: string | null;
	fileStorageKey: string | null;
	countsForProgress: boolean;
	labels: string[];
	completed: boolean;
	recommended: boolean;
	assignment: {
		id: string;
		name: string;
		description: string | null;
		isGroup: boolean;
		responseType: "text" | "files" | "text_and_files";
		maxAttempts: number | null;
		dueAt: Date | null;
	} | null;
	forumConversationId: string | null;
};

const typeIcon = {
	pagina: FileText,
	youtube: PlayCircle,
	bestand: FileText,
	opdracht: CheckCircle2,
	forum: MessageSquare,
	lti: Sparkles,
};

/**
 * Leerling-facing render of one content block (#26), dispatched by type:
 * pagina (#29), youtube nocookie embed (#31), bestand download (#30), opdracht
 * with submit (#27/#28), forum link (#32). Shows a "Aanbevolen" badge for
 * content matching the leerling's leervoorkeuren (#35) and a done-toggle (#24).
 */
export function BlockView(props: {
	block: BlockDTO;
	courseId: string;
	canComplete: boolean;
	onToggleDone: (completed: boolean) => void;
}) {
	const Icon = typeIcon[props.block.type];
	return (
		<div
			class={cn(
				"rounded-3 border border-line bg-surface p-4",
				props.block.completed && "border-success/40",
			)}
		>
			<div class="mb-3 flex items-start justify-between gap-3">
				<div class="flex items-center gap-2">
					<Icon class="size-5 text-primary" />
					<h3 class="font-medium text-ink">{props.block.title}</h3>
				</div>
				<div class="flex items-center gap-2">
					<Show when={props.block.recommended && props.block.labels.length > 0}>
						<Badge variant="primary">
							<Sparkles class="size-3" /> Aanbevolen
						</Badge>
					</Show>
					<Show when={props.block.countsForProgress && props.canComplete}>
						<Button
							variant="ghost"
							size="sm"
							aria-pressed={props.block.completed}
							onClick={() => props.onToggleDone(!props.block.completed)}
						>
							<Show
								when={props.block.completed}
								fallback={
									<>
										<Circle class="size-4" /> Markeer als gedaan
									</>
								}
							>
								<CheckCircle2 class="size-4 text-success" /> Gedaan
							</Show>
						</Button>
					</Show>
				</div>
			</div>

			<Show when={props.block.type === "pagina"}>
				<PageView body={props.block.body} />
			</Show>

			<Show when={props.block.type === "youtube" && props.block.youtubeEmbedUrl}>
				<div class="aspect-video w-full overflow-hidden rounded-2 border border-line">
					<iframe
						class="h-full w-full"
						src={props.block.youtubeEmbedUrl ?? ""}
						title={props.block.title}
						allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
						allowfullscreen
					/>
				</div>
			</Show>

			<Show when={props.block.type === "bestand" && props.block.fileStorageKey}>
				{(_) => <FileLink storageKey={props.block.fileStorageKey as string} />}
			</Show>

			<Show when={props.block.type === "opdracht" && props.block.assignment} keyed>
				{(a) => <AssignmentBlock assignment={a} courseId={props.courseId} />}
			</Show>

			<Show when={props.block.type === "forum"}>
				<Show
					when={props.block.forumConversationId}
					fallback={
						<p class="text-small text-muted">
							Forum wordt aangemaakt zodra de cursus aan een leerling is
							gekoppeld.
						</p>
					}
				>
					<Link to="/chat">
						<Button variant="subtle" size="sm">
							<MessageSquare class="size-4" /> Open het forum
						</Button>
					</Link>
				</Show>
			</Show>

			<Show when={props.block.labels.length > 0}>
				<div class="mt-3 flex flex-wrap gap-1.5">
					<For each={props.block.labels}>
						{(l) => <Badge variant="outline">{l}</Badge>}
					</For>
				</div>
			</Show>
		</div>
	);
}
