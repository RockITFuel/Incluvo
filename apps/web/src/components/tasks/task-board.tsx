import { Link } from "@tanstack/solid-router";
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
	/** Open and due before today; listed under Vandaag. */
	overdue?: boolean;
	/** Made by the coach rather than by the leerling. */
	byCoach?: boolean;
};

/** Where a task comes from: an opdracht, the coach, or the leerling ("Eigen"). */
function sourceLabel(task: TaskRow): string {
	if (task.source === "assignment") return "Opdracht";
	return task.byCoach ? "Van coach" : "Eigen";
}

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

/**
 * 23:59:59.999 on the Sunday `weeksAhead` weeks from now (0 = this week) —
 * used to split `toekomst` into week buckets.
 */
function endOfWeek(weeksAhead: number): Date {
	const now = new Date();
	const day = now.getDay(); // 0 = zondag … 6 = zaterdag
	const daysToSunday = day === 0 ? 0 : 7 - day;
	const end = new Date(now);
	end.setDate(now.getDate() + daysToSunday + 7 * weeksAhead);
	end.setHours(23, 59, 59, 999);
	return end;
}

/**
 * A task's description: wraps within the card, also a long word without
 * spaces, and keeps the line breaks it was typed with.
 */
function Description(props: { text: string | null; size: string }) {
	return (
		<Show when={props.text}>
			<div
				style={{
					"font-size": props.size,
					color: "rgb(var(--ink-2))",
					"margin-top": "4px",
					"white-space": "pre-wrap",
					"overflow-wrap": "anywhere",
				}}
			>
				{props.text}
			</div>
		</Show>
	);
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
	const [newDue, setNewDue] = createSignal("");

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
				setNewDue("");
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
		const dueAt = newDue() ? new Date(`${newDue()}T00:00:00`) : undefined;
		add.mutate({ title, leerlingId: props.leerlingId, dueAt });
	};

	const cancelAdd = () => {
		setAdding(false);
		setNewTitle("");
		setNewDue("");
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

	const weekEnd = endOfWeek(0);
	const nextWeekEnd = endOfWeek(1);
	const dueIn = (from: Date | null, to: Date | null) =>
		props.data.toekomst.filter((t) => {
			if (!t.dueAt) return false;
			const due = new Date(t.dueAt);
			return (!from || due > from) && (!to || due <= to);
		});
	const deWeek = () => dueIn(null, weekEnd);
	const volgendeWeek = () => dueIn(weekEnd, nextWeekEnd);
	const later = () => dueIn(nextWeekEnd, null);
	// Tasks without a date have no week: they go under "Ooit".
	const ooit = () => props.data.toekomst.filter((t) => !t.dueAt);

	return (
		<>
			<div class="card" style={{ "margin-bottom": "24px" }}>
				<div
					class="ds-row ds-between"
					style={{ "margin-bottom": "10px", "align-items": "flex-start" }}
				>
					<div>
						<div style={{ "font-size": "0.8125rem", color: "rgb(var(--muted))" }}>
							Voortgang vandaag
						</div>
						<div
							style={{
								"font-family": "var(--font-head)",
								"font-size": "1.5rem",
								"font-weight": "600",
							}}
						>
							{doneToday()}{" "}
							<span
								style={{
									color: "rgb(var(--muted))",
									"font-weight": "400",
									"font-size": "1.125rem",
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
					<div class="ds-row" style={{ gap: "8px", "flex-wrap": "wrap" }}>
						<input
							class="input"
							aria-label="Nieuwe taak"
							placeholder="Wat wil je doen?"
							ref={(el) => queueMicrotask(() => el.focus())}
							value={newTitle()}
							onInput={(e) => setNewTitle(e.currentTarget.value)}
							onKeyDown={(e) => e.key === "Enter" && submitAdd()}
						/>
						<input
							type="date"
							class="input"
							aria-label="Deadline (optioneel)"
							style={{ width: "160px", "flex-grow": "0" }}
							value={newDue()}
							onInput={(e) => setNewDue(e.currentTarget.value)}
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
					<Show when={later().length > 0}>
						<FutureGroup
							label="Later"
							tasks={later()}
							canManage={props.canManage}
							onMove={(id) => setPinned.mutate({ id, pinned: true })}
						/>
					</Show>
					<Show when={ooit().length > 0}>
						<FutureGroup
							label="Ooit"
							tasks={ooit()}
							canManage={props.canManage}
							onMove={(id) => setPinned.mutate({ id, pinned: true })}
						/>
					</Show>
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
				"font-size": "0.875rem",
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
	// An overdue task shows its date: "Vandaag" would be wrong.
	const dateLabel = () =>
		formatTime(props.task.dueAt) && !props.task.overdue
			? `Vandaag ${formatTime(props.task.dueAt)}`
			: formatDue(props.task.dueAt);
	// A task literally due today (vs. merely self-pinned for today) reads as urgent.
	const urgent = () => !props.task.done && props.task.dueAt !== null;
	// An opdracht task is done by handing the opdracht in, not by ticking it.
	const fromOpdracht = () => props.task.source === "assignment";

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
				aria-label={
					fromOpdracht()
						? props.task.done
							? "Opdracht ingeleverd"
							: "Klaar zodra je de opdracht inlevert"
						: props.task.done
							? "Vinkje weghalen"
							: "Afvinken"
				}
				title={fromOpdracht() ? "Klaar zodra de opdracht is ingeleverd" : undefined}
				aria-pressed={props.task.done}
				disabled={!props.canManage || fromOpdracht()}
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
				<div style={{ "font-weight": "500", "font-size": "0.9375rem", "overflow-wrap": "anywhere" }}>
					{props.task.title}
				</div>
				<Description text={props.task.description} size="0.8125rem" />
				<Show when={dateLabel()}>
					<div style={{ "font-size": "0.8125rem", color: "rgb(var(--muted))", "margin-top": "2px" }}>
						{dateLabel()}
					</div>
				</Show>
			</div>
			{/* Overdue reads calm, not alarming: it's still today's to-do. */}
			<div class="ds-row" style={{ gap: "6px", "flex-shrink": "0", "align-self": "flex-start" }}>
				<Show
					when={props.task.overdue}
					fallback={
						<Show when={urgent()}>
							<span class="chip danger">Deadline</span>
						</Show>
					}
				>
					<span class="chip warning">Te laat</span>
				</Show>
				<Show
					when={fromOpdracht() && !props.task.done}
					fallback={<span class="chip">{sourceLabel(props.task)}</span>}
				>
					<Link to="/cursussen" class="chip primary">
						Naar de opdracht
					</Link>
				</Show>
			</div>
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
						"font-size": "0.875rem",
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
							<Clock class="size-4" aria-hidden="true" style={{ "flex-shrink": "0", "align-self": "flex-start", "margin-top": "2px" }} />
							<div class="ds-grow" style={{ "min-width": "0" }}>
								<div style={{ "font-weight": "500", "font-size": "0.875rem", "overflow-wrap": "anywhere" }}>
									{t.title}
								</div>
								<Description text={t.description} size="0.75rem" />
								<Show when={formatDue(t.dueAt)}>
									<div style={{ "font-size": "0.75rem", color: "rgb(var(--muted))", "margin-top": "2px" }}>
										{formatDue(t.dueAt)}
									</div>
								</Show>
							</div>
							<div class="ds-row" style={{ gap: "6px", "flex-shrink": "0", "align-self": "flex-start" }}>
								<span class="chip">{sourceLabel(t)}</span>
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
						</div>
					)}
				</For>
				<Show when={props.tasks.length === 0}>
					<div style={{ padding: "12px 14px", "font-size": "0.8125rem", color: "rgb(var(--muted))" }}>
						Geen taken.
					</div>
				</Show>
			</div>
		</div>
	);
}
