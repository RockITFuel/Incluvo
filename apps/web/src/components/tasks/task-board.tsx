import { useMutation, useQueryClient } from "@tanstack/solid-query";
import { createSignal, For, Show } from "solid-js";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Input } from "../ui/text-field";
import { toast } from "../ui/toast";
import { orpc } from "../../lib/orpc";

/** A single task as returned by `tasks.list`. */
export type TaskRow = {
	id: string;
	leerlingId: string;
	source: "assignment" | "manual";
	title: string;
	description: string | null;
	dueAt: Date | null;
	pinnedForToday: boolean;
	done: boolean;
	doneAt: Date | null;
	createdAt: Date;
};

const SOURCE_LABEL: Record<TaskRow["source"], string> = {
	assignment: "Opdracht",
	manual: "Eigen",
};

function formatDue(due: Date | null): string | null {
	if (!due) return null;
	return new Date(due).toLocaleDateString("nl-NL", {
		weekday: "long",
		day: "numeric",
		month: "long",
	});
}

/**
 * Realtime, optimistic task board shared by the leerling and coach views.
 * `canManage` enables the add/check/pin controls (a coach managing a list, or a
 * leerling on their own list). When `leerlingId` is omitted the API targets the
 * authenticated leerling.
 */
export function TaskBoard(props: {
	data: {
		leerlingId: string;
		listHidden: boolean;
		vandaag: TaskRow[];
		toekomst: TaskRow[];
		klaar: TaskRow[];
	};
	/** The leerling id to target for writes; omit for "self". */
	leerlingId?: string;
	canManage: boolean;
	/** Show the coach-only "naar vandaag" / due controls. */
	isCoach?: boolean;
}) {
	const queryClient = useQueryClient();
	const [newTitle, setNewTitle] = createSignal("");

	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: orpc.tasks.list.key() });

	const add = useMutation(() =>
		orpc.tasks.add.mutationOptions({
			onSuccess: () => {
				setNewTitle("");
				invalidate();
				toast({ title: "Taak toegevoegd", tone: "success" });
			},
			onError: () =>
				toast({ title: "Kon taak niet toevoegen", tone: "danger" }),
		}),
	);

	const setDone = useMutation(() =>
		orpc.tasks.setDone.mutationOptions({
			onSuccess: () => invalidate(),
			onError: () => toast({ title: "Kon taak niet bijwerken", tone: "danger" }),
		}),
	);

	const setPinned = useMutation(() =>
		orpc.tasks.setPinned.mutationOptions({
			onSuccess: () => invalidate(),
			onError: () => toast({ title: "Kon taak niet verplaatsen", tone: "danger" }),
		}),
	);

	const submitAdd = (e: Event) => {
		e.preventDefault();
		const title = newTitle().trim();
		if (!title) return;
		add.mutate({ title, leerlingId: props.leerlingId });
	};

	const vandaagOpen = () => props.data.vandaag.filter((t) => !t.done).length;

	return (
		<div class="flex flex-col gap-6">
			<Show when={props.canManage}>
				<form class="flex gap-2" onSubmit={submitAdd}>
					<Input
						class="flex-1"
						aria-label="Nieuwe taak"
						placeholder="Wat wil je doen?"
						value={newTitle()}
						onInput={(e) => setNewTitle(e.currentTarget.value)}
					/>
					<Button type="submit" disabled={add.isPending}>
						Toevoegen
					</Button>
				</form>
			</Show>

			{/* Vandaag (#37/#38) */}
			<section class="flex flex-col gap-3">
				<div class="flex items-center justify-between">
					<h2 class="font-head text-h3 text-ink">Vandaag</h2>
					<Badge variant="primary">{vandaagOpen()} te doen</Badge>
				</div>
				<Show
					when={props.data.vandaag.length > 0}
					fallback={
						<p class="text-small text-muted">Niets voor vandaag. Goed bezig!</p>
					}
				>
					<ul class="flex flex-col gap-2">
						<For each={props.data.vandaag}>
							{(t) => (
								<TaskItem
									task={t}
									canManage={props.canManage}
									onToggleDone={(done) =>
										setDone.mutate({ id: t.id, done })
									}
								/>
							)}
						</For>
					</ul>
				</Show>
			</section>

			{/* Toekomst (#37) */}
			<section class="flex flex-col gap-3">
				<h2 class="font-head text-h3 text-ink">Toekomst</h2>
				<Show
					when={props.data.toekomst.length > 0}
					fallback={
						<p class="text-small text-muted">Geen taken in de planning.</p>
					}
				>
					<ul class="flex flex-col gap-2">
						<For each={props.data.toekomst}>
							{(t) => (
								<TaskItem
									task={t}
									canManage={props.canManage}
									onToggleDone={(done) =>
										setDone.mutate({ id: t.id, done })
									}
									onPinToday={
										props.canManage
											? () => setPinned.mutate({ id: t.id, pinned: true })
											: undefined
									}
								/>
							)}
						</For>
					</ul>
				</Show>
			</section>

			{/* Klaar (#40) */}
			<Show when={props.data.klaar.length > 0}>
				<section class="flex flex-col gap-3">
					<h2 class="font-head text-h3 text-muted">Klaar</h2>
					<ul class="flex flex-col gap-2">
						<For each={props.data.klaar}>
							{(t) => (
								<TaskItem
									task={t}
									canManage={props.canManage}
									onToggleDone={(done) =>
										setDone.mutate({ id: t.id, done })
									}
								/>
							)}
						</For>
					</ul>
				</section>
			</Show>
		</div>
	);
}

function TaskItem(props: {
	task: TaskRow;
	canManage: boolean;
	onToggleDone: (done: boolean) => void;
	onPinToday?: () => void;
}) {
	const due = () => formatDue(props.task.dueAt);
	return (
		<li>
			<Card
				padding="sm"
				class="flex items-center gap-3"
				classList={{ "bg-bg-2": props.task.done }}
			>
				<button
					type="button"
					aria-label={props.task.done ? "Vinkje weghalen" : "Afvinken"}
					aria-pressed={props.task.done}
					disabled={!props.canManage}
					onClick={() => props.onToggleDone(!props.task.done)}
					class="grid size-6 shrink-0 place-items-center rounded-2 border-2 text-white outline-none transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed"
					classList={{
						"border-success bg-success": props.task.done,
						"border-line bg-transparent hover:border-primary": !props.task.done,
					}}
				>
					<Show when={props.task.done}>
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="3"
							class="size-4"
							aria-hidden="true"
						>
							<path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round" />
						</svg>
					</Show>
				</button>

				<div class="min-w-0 flex-1">
					<p
						class="font-medium text-ink"
						classList={{ "line-through text-muted": props.task.done }}
					>
						{props.task.title}
					</p>
					<Show when={props.task.description || due()}>
						<p class="text-small text-muted">
							{[props.task.description, due()].filter(Boolean).join(" · ")}
						</p>
					</Show>
				</div>

				<Show when={props.onPinToday}>
					<Button
						variant="subtle"
						size="sm"
						onClick={() => props.onPinToday?.()}
					>
						+ Vandaag
					</Button>
				</Show>
				<Badge variant="outline">{SOURCE_LABEL[props.task.source]}</Badge>
			</Card>
		</li>
	);
}
