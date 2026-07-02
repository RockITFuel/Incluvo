import { Link } from "@tanstack/solid-router";
import {
	Check,
	ChevronRight,
	ClipboardList,
	File as FileIcon,
	FileText,
	MessageSquare,
	Sparkles,
	Youtube,
} from "lucide-solid";
import { createSignal, For, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
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
	youtube: Youtube,
	bestand: FileIcon,
	opdracht: ClipboardList,
	forum: MessageSquare,
	lti: Sparkles,
} as const;

const typeLabel: Record<BlockDTO["type"], string> = {
	pagina: "Pagina",
	youtube: "Video",
	bestand: "Bestand",
	opdracht: "Opdracht",
	forum: "Forum",
	lti: "Externe tool",
};

function isToday(d: Date): boolean {
	const now = new Date();
	return (
		d.getFullYear() === now.getFullYear() &&
		d.getMonth() === now.getMonth() &&
		d.getDate() === now.getDate()
	);
}

/**
 * Leerling-facing render of one content block (#26) as a CbS-style row — a 1:1
 * port of the prototype's `CbsRow`. The row shows a type tile, an uppercase type
 * label + optional tag chips, the title and a meta line; the right edge carries
 * the state (done → "Klaar", active → "Verder", else a chevron). Clicking the
 * row expands the real content dispatched by type: pagina (#29), youtube nocookie
 * embed (#31), bestand download (#30), opdracht submit (#27/#28), forum (#32).
 * The done-toggle (#24) is preserved via `onToggleDone`.
 */
export function BlockView(props: {
	block: BlockDTO;
	courseId: string;
	canComplete: boolean;
	/** First not-yet-done progress block in the course — gets the "Verder" accent. */
	active?: boolean;
	onToggleDone: (completed: boolean) => void;
}) {
	const [open, setOpen] = createSignal(false);
	const Icon = () => typeIcon[props.block.type];

	const meta = () => {
		const b = props.block;
		switch (b.type) {
			case "pagina":
				return "Lezen";
			case "youtube":
				return "Video";
			case "bestand":
				return "Bestand";
			case "opdracht":
				return b.assignment?.dueAt
					? `Inleveren voor ${new Date(b.assignment.dueAt).toLocaleString("nl-NL")}`
					: "Opdracht";
			case "forum":
				return "Discussie";
			default:
				return "Externe tool";
		}
	};

	const urgent = () => {
		const d = props.block.assignment?.dueAt;
		return props.block.type === "opdracht" && d ? isToday(new Date(d)) : false;
	};

	const canToggle = () => props.block.countsForProgress && props.canComplete;

	return (
		<div class="ds-col" style={{ gap: "0" }}>
			<div
				class="ds-row"
				style={{
					padding: "14px 16px",
					background: open() ? "rgb(var(--primary-50))" : "rgb(var(--surface))",
					border: `1px solid ${open() ? "rgb(var(--primary))" : "rgb(var(--line))"}`,
					"border-radius": open() ? "12px 12px 0 0" : "12px",
					gap: "14px",
				}}
			>
				<button
					type="button"
					onClick={() => setOpen((v) => !v)}
					aria-expanded={open()}
					style={{
						display: "flex",
						"align-items": "center",
						gap: "14px",
						flex: "1",
						"min-width": "0",
						border: "0",
						background: "transparent",
						padding: "0",
						cursor: "pointer",
						"text-align": "left",
					}}
				>
					<div
						style={{
							width: "36px",
							height: "36px",
							"border-radius": "10px",
							background: "rgb(var(--bg))",
							display: "grid",
							"place-items": "center",
							"flex-shrink": "0",
							color: "rgb(var(--ink-2))",
						}}
					>
						<Dynamic component={Icon()} style={{ width: "18px", height: "18px" }} />
					</div>
					<div class="ds-grow" style={{ "min-width": "0" }}>
						<div class="ds-row" style={{ gap: "8px", "margin-bottom": "2px" }}>
							<span
								style={{
									"font-size": "11px",
									color: "rgb(var(--muted))",
									"font-weight": "600",
									"text-transform": "uppercase",
									"letter-spacing": "0.06em",
								}}
							>
								{typeLabel[props.block.type]}
							</span>
							<Show when={props.block.recommended && props.block.labels.length > 0}>
								<span class="chip primary" style={{ "font-size": "11px" }}>
									<Sparkles style={{ width: "11px", height: "11px" }} /> Aanbevolen
								</span>
							</Show>
						</div>
						<div style={{ "font-weight": "500", "font-size": "14.5px" }}>
							{props.block.title}
						</div>
						<div
							style={{ "font-size": "12px", color: "rgb(var(--muted))", "margin-top": "2px" }}
						>
							{meta()}
						</div>
					</div>
				</button>

				<Show when={urgent()}>
					<span class="chip danger">Vandaag</span>
				</Show>

				<Show
					when={props.block.completed}
					fallback={
						<Show
							when={props.active}
							fallback={
								<ChevronRight
									style={{
										width: "18px",
										height: "18px",
										color: "rgb(var(--muted))",
										transform: open() ? "rotate(90deg)" : "none",
										transition: "transform 0.15s",
									}}
								/>
							}
						>
							<button
								type="button"
								class="btn primary sm"
								onClick={() => setOpen(true)}
							>
								Verder
							</button>
						</Show>
					}
				>
					<Show
						when={canToggle()}
						fallback={
							<span class="chip success">
								<Check style={{ width: "12px", height: "12px" }} /> Klaar
							</span>
						}
					>
						<button
							type="button"
							class="chip success"
							aria-pressed={true}
							title="Markeren als niet gedaan"
							onClick={() => props.onToggleDone(false)}
							style={{ border: "0", cursor: "pointer" }}
						>
							<Check style={{ width: "12px", height: "12px" }} /> Klaar
						</button>
					</Show>
				</Show>
			</div>

			<Show when={open()}>
				<div
					style={{
						padding: "16px",
						background: "rgb(var(--surface))",
						border: "1px solid rgb(var(--primary))",
						"border-top": "0",
						"border-radius": "0 0 12px 12px",
						display: "flex",
						"flex-direction": "column",
						gap: "12px",
					}}
				>
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
								<button type="button" class="btn subtle sm">
									<MessageSquare style={{ width: "16px", height: "16px" }} /> Open het
									forum
								</button>
							</Link>
						</Show>
					</Show>

					<Show when={props.block.labels.length > 0}>
						<div class="ds-row" style={{ "flex-wrap": "wrap", gap: "6px" }}>
							<For each={props.block.labels}>
								{(l) => <span class="chip outline">{l}</span>}
							</For>
						</div>
					</Show>

					<Show when={canToggle() && !props.block.completed}>
						<div>
							<button
								type="button"
								class="btn primary sm"
								onClick={() => props.onToggleDone(true)}
							>
								<Check style={{ width: "14px", height: "14px" }} /> Markeer als gedaan
							</button>
						</div>
					</Show>
				</div>
			</Show>
		</div>
	);
}
