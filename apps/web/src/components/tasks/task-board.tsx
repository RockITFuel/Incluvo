import { useMutation, useQueryClient } from "@tanstack/solid-query";
import { Calendar, Check, Clock, Flame, Plus, X } from "lucide-solid";
import { createSignal, For, type JSX, Show } from "solid-js";
import { toast } from "../ui/toast";
import { orpc } from "../../lib/orpc";
import { doneStreak } from "../../lib/streak";

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

/** Only meaningful when `dueAt` carries an actual time (not a date-only 00:00 value). */
function formatTime(due: Date | null): string | null {
	if (!due) return null;
	const d = new Date(due);
	if (d.getHours() === 0 && d.getMinutes() === 0) return null;
	return d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
}

function isSameDay(a: Date, b: Date): boolean {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

/** 23:59:59.999 on the coming Sunday — used to split `toekomst` into week buckets. */
function endOfThisWeek(): Date {
	const now = new Date();
	const day = now.getDay(); // 0 = zondag … 6 = zaterdag
	const daysToSunday = day === 0 ? 0 : 7 - day;
	const end = new Date(now);
	end.setDate(now.getDate() + daysToSunday);
	end.setHours(23, 59, 59, 999);
	return end;
}

function subLine(description: string | null, dateLabel: string | null, source: TaskRow["source"]): string {
	const parts = [description, dateLabel].filter((v): v is string => Boolean(v));
	return parts.length > 0 ? parts.join(" · ") : SOURCE_LABEL[source];
}

type TabKey = "vandaag" | "toekomst" | "klaar";

/**
 * Realtime, optimistic task board shared by the leerling and coach views — a
 * 1:1 port of the approved "Taken" prototype (progress card, tab switcher,
 * inline add panel, big Vandaag rows, week-grouped Toekomst, Klaar).
 * `canManage` enables the add/check/pin controls (a coach managing a list, or
 * a leerling on their own list). When `leerlingId` is omitted the API targets
 * the authenticated leerling.
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
	/** Controlled "add task" panel visibility (e.g. driven by a page-head button). */
	adding?: boolean;
	onAddingChange?: (adding: boolean) => void;
}) {
	const queryClient = useQueryClient();
	const [tab, setTab] = createSignal<TabKey>("vandaag");
	const [internalAdding, setInternalAdding] = createSignal(false);
	const [newTitle, setNewTitle] = createSignal("");

	// Falls back to an internal signal when the parent doesn't control `adding`
	// (e.g. the coach's per-leerling page, which has no page-head trigger for it).
	const adding = () => props.adding ?? internalAdding();
	const setAdding = (value: boolean) => {
		if (props.onAddingChange) props.onAddingChange(value);
		else setInternalAdding(value);
	};

	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: orpc.tasks.list.key() });

	const add = useMutation(() =>
		orpc.tasks.add.mutationOptions({
			onSuccess: () => {
				setNewTitle("");
				setAdding(false);
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

	const submitAdd = () => {
		const title = newTitle().trim();
		if (!title) return;
		add.mutate({ title, leerlingId: props.leerlingId });
	};

	const cancelAdd = () => {
		setAdding(false);
		setNewTitle("");
	};

	// `vandaag` never contains done tasks — the server routes those into
	// `klaar` unconditionally. So "done today" is derived from `klaar` entries
	// whose `doneAt` falls on today, and "total today" adds those back to the
	// still-open `vandaag` count.
	const doneToday = () =>
		props.data.klaar.filter(
			(t) => t.doneAt && isSameDay(new Date(t.doneAt), new Date()),
		).length;
	const openToday = () => props.data.vandaag.length;
	const totalToday = () => openToday() + doneToday();
	const pct = () =>
		totalToday() ? Math.round((doneToday() / totalToday()) * 100) : 0;
	// Real streak: consecutive days with ≥1 afgeronde taak (never a demo number).
	const streak = () => doneStreak(props.data.klaar.map((t) => t.doneAt));

	const weekEnd = endOfThisWeek();
	const deWeek = () =>
		props.data.toekomst.filter((t) => t.dueAt && new Date(t.dueAt) <= weekEnd);
	const volgendeWeek = () =>
		props.data.toekomst.filter((t) => !t.dueAt || new Date(t.dueAt) > weekEnd);

	return (
		<>
			<div class="card" style={{ "margin-bottom": "24px" }}>
				<div
					class="ds-row ds-between"
					style={{ "margin-bottom": "10px", "align-items": "flex-start" }}
				>
					<div>
						<div style={{ "font-size": "13px", color: "rgb(var(--muted))" }}>
							Voortgang vandaag
						</div>
						<div
							style={{
								"font-family": "var(--font-head)",
								"font-size": "24px",
								"font-weight": "600",
							}}
						>
							{doneToday()}{" "}
							<span
								style={{
									color: "rgb(var(--muted))",
									"font-weight": "400",
									"font-size": "18px",
								}}
							>
								/ {totalToday()} klaar
							</span>
						</div>
					</div>
					<div class="ds-row">
						<Show when={streak() > 0}>
							<span
								class="chip success"
								title="Dagen op rij met een afgeronde taak"
							>
								<Flame class="size-3.5" aria-hidden="true" /> {streak()}{" "}
								{streak() === 1 ? "dag" : "dagen"} op rij
							</span>
						</Show>
						<span class="chip">{pct()}%</span>
					</div>
				</div>
				<div class="progress success">
					<span style={{ width: `${pct()}%` }} />
				</div>
			</div>

			<div
				class="ds-row"
				style={{
					"border-bottom": "1px solid rgb(var(--line))",
					"margin-bottom": "20px",
					gap: "0",
				}}
			>
				<TabButton
					on={tab() === "vandaag"}
					onClick={() => setTab("vandaag")}
					count={props.data.vandaag.length}
				>
					Vandaag
				</TabButton>
				<TabButton
					on={tab() === "toekomst"}
					onClick={() => setTab("toekomst")}
					count={props.data.toekomst.length}
				>
					Toekomst
				</TabButton>
				<TabButton
					on={tab() === "klaar"}
					onClick={() => setTab("klaar")}
					count={props.data.klaar.length}
				>
					Klaar
				</TabButton>
			</div>

			{/* Fallback trigger for pages that don't control `adding` themselves
			    (e.g. the coach's per-leerling page has no page-head button for it). */}
			<Show when={props.canManage && props.adding === undefined}>
				<div class="ds-row" style={{ "margin-bottom": "16px" }}>
					<button type="button" class="btn ghost sm" onClick={() => setAdding(true)}>
						<Plus class="size-3.5" aria-hidden="true" /> Taak toevoegen
					</button>
				</div>
			</Show>

			<Show when={props.canManage && adding()}>
				<div
					class="card"
					style={{
						"margin-bottom": "16px",
						"border-color": "rgb(var(--primary))",
						background: "rgb(var(--primary-50))",
					}}
				>
					<div class="ds-row" style={{ gap: "8px" }}>
						<input
							class="input"
							aria-label="Nieuwe taak"
							placeholder="Wat wil je doen?"
							ref={(el) => queueMicrotask(() => el.focus())}
							value={newTitle()}
							onInput={(e) => setNewTitle(e.currentTarget.value)}
							onKeyDown={(e) => e.key === "Enter" && submitAdd()}
						/>
						<button
							type="button"
							class="btn primary"
							disabled={add.isPending}
							onClick={submitAdd}
						>
							Toevoegen
						</button>
						<button type="button" class="btn ghost" aria-label="Annuleren" onClick={cancelAdd}>
							<X class="size-3.5" aria-hidden="true" />
						</button>
					</div>
				</div>
			</Show>

			<Show when={tab() === "vandaag"}>
				<div class="ds-col" style={{ gap: "8px" }}>
					<For each={props.data.vandaag}>
						{(t) => (
							<BigTask
								task={t}
								canManage={props.canManage}
								onToggle={() => setDone.mutate({ id: t.id, done: true })}
							/>
						)}
					</For>
					<Show when={props.data.vandaag.length === 0}>
						<div style={{ padding: "32px", "text-align": "center", color: "rgb(var(--muted))" }}>
							Niets voor vandaag. Goed bezig!
						</div>
					</Show>
				</div>
			</Show>

			<Show when={tab() === "toekomst"}>
				<div class="ds-col" style={{ gap: "24px" }}>
					<FutureGroup
						label="Deze week"
						tasks={deWeek()}
						canManage={props.canManage}
						onMove={(id) => setPinned.mutate({ id, pinned: true })}
					/>
					<FutureGroup
						label="Volgende week"
						tasks={volgendeWeek()}
						canManage={props.canManage}
						onMove={(id) => setPinned.mutate({ id, pinned: true })}
					/>
					<Show when={props.data.toekomst.length === 0}>
						<div style={{ padding: "32px", "text-align": "center", color: "rgb(var(--muted))" }}>
							Geen taken in de planning.
						</div>
					</Show>
				</div>
			</Show>

			<Show when={tab() === "klaar"}>
				<div class="ds-col" style={{ gap: "8px" }}>
					<For each={props.data.klaar}>
						{(t) => (
							<BigTask
								task={t}
								canManage={props.canManage}
								onToggle={() => setDone.mutate({ id: t.id, done: false })}
							/>
						)}
					</For>
					<Show when={props.data.klaar.length === 0}>
						<div style={{ padding: "32px", "text-align": "center", color: "rgb(var(--muted))" }}>
							Nog niets afgevinkt vandaag.
						</div>
					</Show>
				</div>
			</Show>
		</>
	);
}

function TabButton(props: {
	on: boolean;
	onClick: () => void;
	count: number;
	children: JSX.Element;
}) {
	return (
		<button
			type="button"
			onClick={props.onClick}
			style={{
				padding: "10px 16px",
				border: "0",
				background: "transparent",
				"border-bottom": props.on ? "2px solid rgb(var(--primary))" : "2px solid transparent",
				color: props.on ? "rgb(var(--ink))" : "rgb(var(--muted))",
				"font-weight": props.on ? "600" : "500",
				"font-size": "14px",
				"margin-bottom": "-1px",
			}}
		>
			{props.children}{" "}
			<span style={{ color: "rgb(var(--muted))", "font-weight": "400", "margin-left": "4px" }}>
				{props.count}
			</span>
		</button>
	);
}

function BigTask(props: { task: TaskRow; canManage: boolean; onToggle: () => void }) {
	const sub = () =>
		subLine(
			props.task.description,
			formatTime(props.task.dueAt)
				? `Vandaag ${formatTime(props.task.dueAt)}`
				: formatDue(props.task.dueAt),
			props.task.source,
		);
	// A task literally due today (vs. merely self-pinned for today) reads as urgent.
	const urgent = () => !props.task.done && props.task.dueAt !== null;

	return (
		<div
			class="ds-row"
			style={{
				padding: "14px 16px",
				border: "1px solid rgb(var(--line))",
				"border-radius": "12px",
				background: props.task.done ? "rgb(var(--bg-2))" : "rgb(var(--surface))",
				gap: "14px",
			}}
		>
			<button
				type="button"
				aria-label={props.task.done ? "Vinkje weghalen" : "Afvinken"}
				aria-pressed={props.task.done}
				disabled={!props.canManage}
				onClick={props.onToggle}
				style={{
					width: "24px",
					height: "24px",
					"border-radius": "7px",
					border: `1.5px solid ${props.task.done ? "rgb(var(--success))" : "rgb(var(--line))"}`,
					background: props.task.done ? "rgb(var(--success))" : "transparent",
					color: "#fff",
					display: "grid",
					"place-items": "center",
					"flex-shrink": "0",
				}}
			>
				<Show when={props.task.done}>
					<Check class="size-3.5" stroke-width="2.5" aria-hidden="true" />
				</Show>
			</button>
			<div
				class="ds-grow"
				style={{
					"min-width": "0",
					"text-decoration": props.task.done ? "line-through" : "none",
					color: props.task.done ? "rgb(var(--muted))" : "rgb(var(--ink))",
				}}
			>
				<div style={{ "font-weight": "500", "font-size": "15px" }}>{props.task.title}</div>
				<div style={{ "font-size": "13px", color: "rgb(var(--muted))", "margin-top": "2px" }}>
					{sub()}
				</div>
			</div>
			<Show when={urgent()}>
				<span class="chip danger">Deadline</span>
			</Show>
			<span class="chip">{SOURCE_LABEL[props.task.source]}</span>
		</div>
	);
}

function FutureGroup(props: {
	label: string;
	tasks: TaskRow[];
	canManage: boolean;
	onMove: (id: string) => void;
}) {
	return (
		<div>
			<div style={{ display: "flex", "align-items": "center", gap: "8px", "margin-bottom": "10px" }}>
				<Calendar class="size-3.5" aria-hidden="true" />
				<div
					style={{
						"font-family": "var(--font-head)",
						"font-size": "14px",
						"font-weight": "600",
						color: "rgb(var(--muted))",
						"text-transform": "uppercase",
						"letter-spacing": "0.06em",
					}}
				>
					{props.label}
				</div>
			</div>
			<div class="ds-col" style={{ gap: "8px" }}>
				<For each={props.tasks}>
					{(t) => (
						<div
							class="ds-row"
							style={{
								padding: "12px 14px",
								border: "1px solid rgb(var(--line))",
								"border-radius": "10px",
								background: "rgb(var(--surface))",
								gap: "12px",
							}}
						>
							<Clock class="size-4" aria-hidden="true" />
							<div class="ds-grow" style={{ "min-width": "0" }}>
								<div style={{ "font-weight": "500", "font-size": "14px" }}>{t.title}</div>
								<div style={{ "font-size": "12px", color: "rgb(var(--muted))" }}>
									{subLine(t.description, formatDue(t.dueAt), t.source)}
								</div>
							</div>
							<Show when={t.dueAt !== null}>
								<span class="chip danger">Belangrijk</span>
							</Show>
							<span class="chip">{SOURCE_LABEL[t.source]}</span>
							<Show when={props.canManage}>
								<button
									type="button"
									class="btn sm subtle"
									title="Naar vandaag"
									onClick={() => props.onMove(t.id)}
								>
									+ Vandaag
								</button>
							</Show>
						</div>
					)}
				</For>
				<Show when={props.tasks.length === 0}>
					<div style={{ padding: "12px 14px", "font-size": "13px", color: "rgb(var(--muted))" }}>
						Geen taken.
					</div>
				</Show>
			</div>
		</div>
	);
}
