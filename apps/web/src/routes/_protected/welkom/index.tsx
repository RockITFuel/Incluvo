import { createFileRoute, useNavigate } from "@tanstack/solid-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/solid-query";
import {
	ArrowRight,
	Check,
	Clock,
	Flame,
	MessageSquare,
	NotebookPen,
	Star,
} from "lucide-solid";
import {
	createEffect,
	createMemo,
	createSignal,
	For,
	type JSX,
	onMount,
	Show,
} from "solid-js";
import { useMe } from "../../../lib/auth/use-me";
import { MOODS } from "../../../lib/mood";
import { orpc } from "../../../lib/orpc";
import { useServerEvent } from "../../../lib/sse/use-events";
import { doneStreak } from "../../../lib/streak";

/**
 * Leerling home dashboard — the approved "Welkom" prototype layout, with every
 * number and list driven by REAL data: taken (vandaag/deadlines/streak),
 * successen (afgeronde taken + ingeleverd coachplan), sociaal (echte
 * gesprekken) en de eerstvolgende echte deadline. Where the backend has no
 * concept yet (afspraken, mood op de server) the cards show honest empty
 * states — nothing is fabricated. The mood check-in persists locally per day.
 */
export const Route = createFileRoute("/_protected/welkom/")({
	component: WelkomPage,
});

function firstName(name: string | undefined): string {
	if (!name) return "";
	const trimmed = name.trim();
	if (!trimmed || trimmed.includes("@")) return "";
	return trimmed.split(/\s+/)[0] ?? "";
}

/** ISO 8601 week number (weeks start Monday; week 1 holds the year's first Thursday). */
function isoWeek(date: Date): number {
	const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
	const day = d.getUTCDay() || 7;
	d.setUTCDate(d.getUTCDate() + 4 - day);
	const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
	return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

/** e.g. "Woensdag 2 juli · Week 27" — capitalised weekday + live ISO week. */
function dateSubline(date: Date): string {
	const label = date.toLocaleDateString("nl-NL", {
		weekday: "long",
		day: "numeric",
		month: "long",
	});
	const capitalised = label.charAt(0).toUpperCase() + label.slice(1);
	return `${capitalised} · Week ${isoWeek(date)}`;
}

/** "Vandaag" / "Gisteren" / weekday (≤7 dagen) / "3 juli" — for real timestamps. */
function dayLabel(input: Date | string): string {
	const d = new Date(input);
	const now = new Date();
	const startOfDay = (x: Date) =>
		new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
	const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
	if (diffDays <= 0) return "Vandaag";
	if (diffDays === 1) return "Gisteren";
	if (diffDays < 7) {
		const w = d.toLocaleDateString("nl-NL", { weekday: "long" });
		return w.charAt(0).toUpperCase() + w.slice(1);
	}
	return d.toLocaleDateString("nl-NL", { day: "numeric", month: "long" });
}

/** Relative time for chat previews: "nu" / "12m" / "3u" / "gisteren" / "2 jul". */
function relativeShort(value: string | Date | null): string {
	if (!value) return "";
	const date = value instanceof Date ? value : new Date(value);
	const diffMin = Math.floor((Date.now() - date.getTime()) / 60_000);
	if (diffMin < 1) return "nu";
	if (diffMin < 60) return `${diffMin}m`;
	const diffH = Math.floor(diffMin / 60);
	if (diffH < 24) return `${diffH}u`;
	const diffD = Math.floor(diffH / 24);
	if (diffD === 1) return "gisteren";
	if (diffD < 7) return `${diffD}d`;
	return date.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

/** "Vrijdag 10 juli · 14:00" (time only when the deadline carries one). */
function deadlineLabelFor(due: Date | string): string {
	const d = new Date(due);
	const day = d.toLocaleDateString("nl-NL", {
		weekday: "long",
		day: "numeric",
		month: "long",
	});
	const capitalised = day.charAt(0).toUpperCase() + day.slice(1);
	const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
	return hasTime
		? `${capitalised} · ${d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}`
		: capitalised;
}

const todayKey = () => new Date().toISOString().slice(0, 10);

function WelkomPage() {
	const me = useMe();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [showSuccess, setShowSuccess] = createSignal(true);

	// ── Mood: dagelijkse check-in. De server is de bron van waarheid voor de
	// gekozen mood én de deel-voorkeur; localStorage blijft een offline fallback.
	// Delen met de coach is opt-in per check-in en staat standaard uit.
	const [mood, setMood] = createSignal<number | null>(null);
	const [share, setShare] = createSignal(false);
	const [moodSkipped, setMoodSkipped] = createSignal(false);

	const moodQuery = useQuery(() => ({
		...orpc.mood.today.queryOptions(),
		enabled: me.is("leerling"),
	}));
	const checkinMutation = useMutation(() =>
		orpc.mood.checkin.mutationOptions({
			onSuccess: () => moodQuery.refetch(),
		}),
	);

	onMount(() => {
		const stored = localStorage.getItem(`incluvo-mood:${todayKey()}`);
		if (stored !== null && !Number.isNaN(Number(stored))) setMood(Number(stored));
		setMoodSkipped(localStorage.getItem(`incluvo-mood-skip:${todayKey()}`) === "1");
	});

	// Server wins over localStorage: seed the selected mood + deel-voorkeur from
	// today's server row once it loads.
	createEffect(() => {
		const row = moodQuery.data;
		if (row) {
			setMood(row.mood);
			setShare(row.shareWithCoach);
		}
	});

	const pickMood = (i: number) => {
		setMood(i);
		setMoodSkipped(false);
		// Keep the local copy as an offline fallback, and persist to the server.
		localStorage.setItem(`incluvo-mood:${todayKey()}`, String(i));
		localStorage.removeItem(`incluvo-mood-skip:${todayKey()}`);
		checkinMutation.mutate({ mood: i, shareWithCoach: share() });
	};
	const toggleShare = (on: boolean) => {
		setShare(on);
		// Only re-persist when a mood is already chosen; otherwise just remember
		// the preference in the signal for the next pick.
		const current = mood();
		if (current !== null) {
			checkinMutation.mutate({ mood: current, shareWithCoach: on });
		}
	};
	const skipMood = () => {
		setMoodSkipped(true);
		setMood(null);
		localStorage.setItem(`incluvo-mood-skip:${todayKey()}`, "1");
		localStorage.removeItem(`incluvo-mood:${todayKey()}`);
	};

	// ── Real data ─────────────────────────────────────────────────────────────
	const tasksQuery = useQuery(() => ({
		...orpc.tasks.list.queryOptions({ input: {} }),
		enabled: me.is("leerling"),
	}));
	// Keep the takenlijst (en de "+ Vandaag"-pin) live, mirroring /taken.
	useServerEvent("task.changed", () =>
		queryClient.invalidateQueries({ queryKey: orpc.tasks.list.key() }),
	);
	const planQuery = useQuery(() => ({
		...orpc.coachplan.listMine.queryOptions(),
		enabled: me.is("leerling"),
	}));
	const chatQuery = useQuery(() => ({
		...orpc.chat.list.queryOptions(),
		enabled: me.is("leerling"),
	}));

	const klaar = () => tasksQuery.data?.klaar ?? [];
	const openToday = () => tasksQuery.data?.vandaag.length ?? 0;
	const withDeadline = () =>
		tasksQuery.data?.vandaag.filter((t) => t.dueAt != null).length ?? 0;

	const streak = createMemo(() => doneStreak(klaar().map((t) => t.doneAt)));

	// Successen: afgeronde taken + ingeleverd coachplan, nieuwste eerst.
	type Succes = {
		icon: (p: { class?: string; "aria-hidden"?: boolean | "true" | "false" }) => JSX.Element;
		title: string;
		when: Date;
		tone?: "accent" | "warning";
	};
	const alleSuccessen = createMemo<Succes[]>(() => {
		const items: Succes[] = [];
		for (const t of klaar()) {
			if (t.doneAt)
				items.push({
					icon: Check,
					title: `Taak '${t.title}' afgerond`,
					when: new Date(t.doneAt),
				});
		}
		const submitted = (planQuery.data ?? []).find((s) => s.submittedAt);
		if (submitted?.submittedAt)
			items.push({
				icon: NotebookPen,
				title: "Coachplan ingeleverd",
				when: new Date(submitted.submittedAt),
				tone: "accent",
			});
		return items.sort((a, b) => b.when.getTime() - a.when.getTime());
	});
	const successenCount = () => alleSuccessen().length;
	const successenWeek = () =>
		alleSuccessen().filter(
			(s) => Date.now() - s.when.getTime() < 7 * 86_400_000,
		).length;

	// Eerstvolgende echte deadline (vandaag of later). Een taak die met "+ Vandaag"
	// is vastgepind telt óók mee — ook zonder (of met een oudere) dueAt — en krijgt
	// begin-vandaag als sorteermoment, zodat hij vóór elke latere taak komt.
	const nextDeadline = createMemo(() => {
		const startOfToday = new Date();
		startOfToday.setHours(0, 0, 0, 0);
		const effectiveMoment = (t: { dueAt: Date | null; pinnedForToday: boolean }) =>
			t.pinnedForToday
				? startOfToday.getTime()
				: new Date(t.dueAt as Date).getTime();
		const candidates = [
			...(tasksQuery.data?.vandaag ?? []),
			...(tasksQuery.data?.toekomst ?? []),
		].filter(
			(t) => t.pinnedForToday || (t.dueAt && new Date(t.dueAt) >= startOfToday),
		);
		candidates.sort((a, b) => effectiveMoment(a) - effectiveMoment(b));
		return candidates[0] ?? null;
	});

	// Kaartlabel: een vastgepinde taak zonder toekomstige dueAt (geen datum, of
	// een datum vóór morgen) is gewoon "Vandaag"; echte toekomstige deadlines
	// houden hun geformatteerde datum.
	const nextDeadlineLabel = (t: { dueAt: Date | null; pinnedForToday: boolean }) => {
		const startOfTomorrow = new Date();
		startOfTomorrow.setHours(0, 0, 0, 0);
		startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
		if (
			t.pinnedForToday &&
			(!t.dueAt || new Date(t.dueAt) < startOfTomorrow)
		) {
			return "Vandaag";
		}
		return deadlineLabelFor(t.dueAt as Date);
	};

	// Sociaal: echte gesprekken, nieuwste bovenaan.
	const gesprekken = createMemo(() =>
		[...(chatQuery.data ?? [])]
			.sort(
				(a, b) =>
					new Date(b.lastMessageAt ?? 0).getTime() -
					new Date(a.lastMessageAt ?? 0).getTime(),
			)
			.slice(0, 3),
	);

	const taskCountLabel = () => {
		const n = withDeadline();
		if (openToday() === 0) return "Niets gepland — lekker rustig";
		if (n === 0) return "Geen deadlines";
		if (n === 1) return "1 met een deadline";
		return `${n} met een deadline`;
	};

	const moodConfirmation = () => {
		const n = openToday();
		if (n === 0)
			return "Fijn dat je dit deelt. Je hebt vandaag geen taken — een mooi moment om vooruit te kijken.";
		if (n === 1)
			return "Fijn dat je dit deelt. Je hebt 1 taak voor vandaag — zullen we beginnen?";
		return `Fijn dat je dit deelt. Je hebt ${n} taken voor vandaag — zullen we beginnen met de eerste?`;
	};

	const greeting = () => {
		const n = firstName(me.user()?.name);
		return n ? `Hoi ${n} 👋` : "Hoi 👋";
	};

	return (
		<>
			<div class="page-head" data-page-title="Welkom">
				<div>
					<h1>{greeting()}</h1>
					<div class="sub">{dateSubline(new Date())}</div>
				</div>
				<div class="ds-row">
					<Show when={streak() > 0}>
						<span class="chip success" title="Dagen op rij met een afgeronde taak">
							<Flame class="size-3.5" aria-hidden="true" /> {streak()}{" "}
							{streak() === 1 ? "dag" : "dagen"} op rij
						</span>
					</Show>
					<Show when={successenCount() > 0}>
						<span class="chip primary">
							<Star class="size-3.5" aria-hidden="true" /> {successenCount()}{" "}
							{successenCount() === 1 ? "succes" : "successen"}
						</span>
					</Show>
				</div>
			</div>

			<div class="ds-grid-main">
				<div class="ds-col" style={{ gap: "24px" }}>
					<div class="card">
						<div class="card-head">
							<div>
								<h2>Hoe zit je erbij vandaag?</h2>
								<div class="card-sub">Je coach ziet dit alleen als je het deelt.</div>
							</div>
							<Show when={!moodSkipped()}>
								<button type="button" class="btn ghost sm" onClick={skipMood}>
									Niet vandaag
								</button>
							</Show>
						</div>
						<Show
							when={!moodSkipped()}
							fallback={
								<div class="ds-row ds-between" style={{ "font-size": "0.8125rem", color: "rgb(var(--muted))" }}>
									<span>Prima — morgen vragen we het gewoon weer.</span>
									<button
										type="button"
										class="btn ghost sm"
										onClick={() => {
											setMoodSkipped(false);
											localStorage.removeItem(`incluvo-mood-skip:${todayKey()}`);
										}}
									>
										Toch delen
									</button>
								</div>
							}
						>
							<div class="moods" role="group" aria-label="Stemming van vandaag">
								<For each={MOODS}>
									{(m, i) => (
										<button
											type="button"
											class={`mood${mood() === i() ? " on" : ""}`}
											onClick={() => pickMood(i())}
											aria-label={m.label}
											aria-pressed={mood() === i()}
											title={m.label}
										>
											{m.e}
										</button>
									)}
								</For>
							</div>
							<label
								class="ds-row"
								style={{
									gap: "10px",
									"margin-top": "16px",
									"font-size": "0.8125rem",
									"align-items": "center",
								}}
							>
								<span class="toggle">
									<input
										type="checkbox"
										checked={share()}
										onChange={(e) => toggleShare(e.currentTarget.checked)}
										aria-label="Delen met mijn coach"
									/>
									<span class="slider" />
								</span>{" "}
								<span class="ds-grow">
									<span style={{ "font-weight": "500" }}>Delen met mijn coach</span>
									<span style={{ display: "block", color: "rgb(var(--muted))" }}>
										Alleen jouw mood — jij bepaalt dit per dag.
									</span>
								</span>
							</label>
							<Show when={mood() !== null}>
								<div
									style={{
										"margin-top": "16px",
										padding: "12px 14px",
										background: "rgb(var(--primary-50))",
										"border-radius": "12px",
										"font-size": "0.8125rem",
										color: "rgb(var(--primary-700))",
									}}
								>
									{moodConfirmation()}
								</div>
							</Show>
						</Show>
					</div>

					<div class="card">
						<div class="card-head">
							<div>
								<h2>Vandaag</h2>
								<div class="card-sub">Een rustig overzicht — je taken staan op één plek</div>
							</div>
						</div>
						<div class="ds-row" style={{ gap: "16px", "align-items": "center" }}>
							<div
								style={{
									"font-size": "2.5rem",
									"font-weight": "600",
									color: "rgb(var(--primary-700))",
									"line-height": "1",
								}}
							>
								{openToday()}
							</div>
							<div class="ds-grow">
								<div style={{ "font-weight": "500", "font-size": "0.9375rem" }}>
									taken voor vandaag
								</div>
								<div style={{ "font-size": "0.8125rem", color: "rgb(var(--muted))" }}>
									{taskCountLabel()}
								</div>
							</div>
							<button type="button" class="btn subtle" onClick={() => navigate({ to: "/taken" })}>
								Naar alle taken <ArrowRight class="size-3.5" aria-hidden="true" />
							</button>
						</div>
					</div>
				</div>

				<div class="ds-col" style={{ gap: "24px" }}>
					{/* Eerstvolgende echte deadline (geen afspraken-backend — dus geen verzonnen afspraak). */}
					<div
						class="card"
						style={{
							background: "rgb(var(--primary))",
							"border-color": "rgb(var(--primary))",
							color: "#fff",
						}}
					>
						<div style={{ "font-size": "0.8125rem", opacity: "0.85", "font-weight": "500", "margin-bottom": "6px" }}>
							Volgende deadline
						</div>
						<Show
							when={nextDeadline()}
							fallback={
								<>
									<h2 style={{ color: "#fff", "font-size": "1.25rem" }}>
										Niets met een deadline
									</h2>
									<div style={{ "font-size": "0.875rem", opacity: "0.85", "margin-top": "6px" }}>
										Er staat nu niets gepland. Je coach is één berichtje verwijderd.
									</div>
								</>
							}
						>
							{(t) => (
								<>
									<h2 style={{ color: "#fff", "font-size": "1.25rem" }}>{t().title}</h2>
									<div style={{ "font-size": "0.875rem", opacity: "0.85", "margin-top": "6px" }}>
										<Clock
											class="size-3.5"
											aria-hidden="true"
											style={{ display: "inline", "vertical-align": "-2px", "margin-right": "6px" }}
										/>
										{nextDeadlineLabel(t())}
									</div>
								</>
							)}
						</Show>
						<div class="ds-row" style={{ "margin-top": "16px", gap: "8px" }}>
							<button
								type="button"
								class="btn"
								style={{ background: "rgb(255 255 255 / 0.18)", color: "#fff" }}
								onClick={() => navigate({ to: "/chat" })}
							>
								<MessageSquare class="size-3.5" aria-hidden="true" /> Bericht
							</button>
							<Show when={nextDeadline()}>
								<button
									type="button"
									class="btn"
									style={{ background: "#fff", color: "rgb(var(--primary-700))" }}
									onClick={() => navigate({ to: "/taken" })}
								>
									Naar taak
								</button>
							</Show>
						</div>
					</div>

					<div class="card">
						<div class="card-head">
							<h2>Successen</h2>
							<div class="ds-row" style={{ gap: "8px" }}>
								<Show when={showSuccess() && successenWeek() > 0}>
									<span class="chip success">+{successenWeek()} deze week</span>
								</Show>
								<button
									type="button"
									class="btn ghost sm"
									aria-pressed={!showSuccess()}
									onClick={() => setShowSuccess(!showSuccess())}
								>
									{showSuccess() ? "Verbergen" : "Tonen"}
								</button>
							</div>
						</div>
						<Show
							when={showSuccess()}
							fallback={
								<div style={{ "font-size": "0.8125rem", color: "rgb(var(--muted))" }}>
									Successen staan even uit.
								</div>
							}
						>
							<Show
								when={alleSuccessen().length > 0}
								fallback={
									<div style={{ "font-size": "0.8125rem", color: "rgb(var(--muted))" }}>
										Nog geen successen — vink je eerste taak af en hij verschijnt hier. 💪
									</div>
								}
							>
								<div class="ds-col" style={{ gap: "10px" }}>
									<For each={alleSuccessen().slice(0, 3)}>
										{(s) => (
											<SuccessRow
												icon={s.icon}
												title={s.title}
												when={dayLabel(s.when)}
												tone={s.tone}
											/>
										)}
									</For>
								</div>
							</Show>
						</Show>
					</div>

					<div class="card">
						<div class="card-head">
							<h2>Sociaal</h2>
							<Show when={me.organization()?.name}>
								<span class="chip">{me.organization()?.name}</span>
							</Show>
						</div>
						<Show
							when={gesprekken().length > 0}
							fallback={
								<div class="ds-col" style={{ gap: "10px" }}>
									<div style={{ "font-size": "0.8125rem", color: "rgb(var(--muted))" }}>
										Nog geen gesprekken.
									</div>
									<button
										type="button"
										class="btn subtle sm"
										style={{ "align-self": "flex-start" }}
										onClick={() => navigate({ to: "/chat" })}
									>
										<MessageSquare class="size-3.5" aria-hidden="true" /> Start een gesprek
									</button>
								</div>
							}
						>
							<div class="ds-col" style={{ gap: "8px" }}>
								<For each={gesprekken()}>
									{(c) => (
										<SocialRow
											name={c.displayName}
											msg={c.lastMessageBody ?? "Nog geen berichten"}
											time={relativeShort(c.lastMessageAt)}
											onOpen={() =>
												navigate({ to: "/chat", search: { conversationId: c.id } })
											}
										/>
									)}
								</For>
							</div>
						</Show>
					</div>
				</div>
			</div>
		</>
	);
}

function SuccessRow(props: {
	icon: (p: { class?: string; "aria-hidden"?: boolean | "true" | "false" }) => JSX.Element;
	title: string;
	when: string;
	tone?: "accent" | "warning";
}) {
	const bg = () =>
		props.tone === "accent"
			? "rgb(var(--accent-100))"
			: props.tone === "warning"
				? "rgb(var(--warning-100))"
				: "rgb(var(--success-100))";
	const fg = () =>
		props.tone === "accent"
			? "rgb(var(--accent-700))"
			: props.tone === "warning"
				? "rgb(var(--warning))"
				: "rgb(var(--success))";
	return (
		<div class="ds-row">
			<div
				style={{
					width: "32px",
					height: "32px",
					"border-radius": "10px",
					background: bg(),
					color: fg(),
					display: "grid",
					"place-items": "center",
					"flex-shrink": "0",
				}}
			>
				<props.icon class="size-4" aria-hidden="true" />
			</div>
			<div class="ds-grow" style={{ "min-width": "0" }}>
				<div style={{ "font-weight": "500", "font-size": "0.8438rem" }}>{props.title}</div>
				<div style={{ "font-size": "0.75rem", color: "rgb(var(--muted))" }}>{props.when}</div>
			</div>
		</div>
	);
}

function SocialRow(props: {
	name: string;
	msg: string;
	time: string;
	onOpen: () => void;
}) {
	const initials = () =>
		props.name
			.split(" ")
			.map((s) => s[0])
			.slice(0, 2)
			.join("");
	return (
		<button
			type="button"
			class="ds-row"
			style={{
				cursor: "pointer",
				border: "0",
				background: "transparent",
				padding: "0",
				"text-align": "left",
				width: "100%",
			}}
			onClick={props.onOpen}
		>
			<div class="avatar" style={{ width: "32px", height: "32px", "font-size": "0.75rem" }}>
				{initials()}
			</div>
			<div class="ds-grow" style={{ "min-width": "0" }}>
				<div class="ds-row ds-between">
					<div style={{ "font-weight": "500", "font-size": "0.8125rem" }}>{props.name}</div>
					<div style={{ "font-size": "0.6875rem", color: "rgb(var(--muted))" }}>{props.time}</div>
				</div>
				<div
					style={{
						"font-size": "0.75rem",
						color: "rgb(var(--muted))",
						overflow: "hidden",
						"text-overflow": "ellipsis",
						"white-space": "nowrap",
					}}
				>
					{props.msg}
				</div>
			</div>
		</button>
	);
}
