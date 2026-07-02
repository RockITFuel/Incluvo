import { createFileRoute, useNavigate } from "@tanstack/solid-router";
import { useQuery } from "@tanstack/solid-query";
import { ArrowRight, Check, Flame, MessageSquare, Star } from "lucide-solid";
import { createSignal, For, type JSX, Show } from "solid-js";
import { useMe } from "../../../lib/auth/use-me";
import { orpc } from "../../../lib/orpc";

/**
 * Leerling home dashboard — a 1:1 port of the approved "Welkom" prototype page.
 * A calm personal start screen: mood check-in, a today summary, the next
 * coaching appointment, successes and a social preview. The greeting is wired
 * to the signed-in user; the surrounding content is demo-representative and is
 * progressively wired to live data as the backend grows.
 */
export const Route = createFileRoute("/_protected/welkom/")({
	component: WelkomPage,
});

const MOODS = [
	{ e: "😞", label: "Niet zo" },
	{ e: "😕", label: "Matig" },
	{ e: "😐", label: "Oké" },
	{ e: "🙂", label: "Goed" },
	{ e: "😄", label: "Top" },
];

function firstName(name: string | undefined): string {
	if (!name) return "";
	const trimmed = name.trim();
	if (!trimmed || trimmed.includes("@")) return "";
	return trimmed.split(/\s+/)[0] ?? "";
}

/** ISO 8601 week number (weeks start Monday; week 1 holds the year's first Thursday). */
function isoWeek(date: Date): number {
	const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
	// Thursday in the current week decides the year.
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

function WelkomPage() {
	const me = useMe();
	const navigate = useNavigate();
	const [mood, setMood] = createSignal(2);
	const [showSuccess, setShowSuccess] = createSignal(true);

	const tasksQuery = useQuery(() => ({
		...orpc.tasks.list.queryOptions({ input: {} }),
		// A coach has no own task list; don't fetch for them.
		enabled: me.is("leerling"),
	}));

	const openToday = () => tasksQuery.data?.vandaag.length ?? 0;
	const withDeadline = () =>
		tasksQuery.data?.vandaag.filter((t) => t.dueAt != null).length ?? 0;

	const deadlineLabel = () => {
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
			<div class="page-head">
				<div>
					<h1>{greeting()}</h1>
					<div class="sub">{dateSubline(new Date())}</div>
				</div>
				<div class="ds-row">
					<span class="chip success">
						<Flame class="size-3.5" aria-hidden="true" /> 4 dagen op rij
					</span>
					<span class="chip primary">
						<Star class="size-3.5" aria-hidden="true" /> 12 successen
					</span>
				</div>
			</div>

			<div class="ds-grid" style={{ "grid-template-columns": "2fr 1fr", gap: "24px" }}>
				<div class="ds-col" style={{ gap: "24px" }}>
					<div class="card">
						<div class="card-head">
							<div>
								<h3>Hoe zit je erbij vandaag?</h3>
								<div class="card-sub">Je coach ziet dit alleen als je het deelt.</div>
							</div>
							<button type="button" class="btn ghost sm">
								Niet vandaag
							</button>
						</div>
						<div class="moods" role="group" aria-label="Stemming van vandaag">
							<For each={MOODS}>
								{(m, i) => (
									<button
										type="button"
										class={`mood${mood() === i() ? " on" : ""}`}
										onClick={() => setMood(i())}
										aria-label={m.label}
										aria-pressed={mood() === i()}
										title={m.label}
									>
										{m.e}
									</button>
								)}
							</For>
						</div>
						<div
							style={{
								"margin-top": "16px",
								padding: "12px 14px",
								background: "rgb(var(--primary-50))",
								"border-radius": "12px",
								"font-size": "13px",
								color: "rgb(var(--primary-700))",
							}}
						>
							{moodConfirmation()}
						</div>
					</div>

					<div class="card">
						<div class="card-head">
							<div>
								<h3>Vandaag</h3>
								<div class="card-sub">Een rustig overzicht — je taken staan op één plek</div>
							</div>
						</div>
						<div class="ds-row" style={{ gap: "16px", "align-items": "center" }}>
							<div
								style={{
									"font-size": "40px",
									"font-weight": "600",
									color: "rgb(var(--primary-700))",
									"line-height": "1",
								}}
							>
								{openToday()}
							</div>
							<div class="ds-grow">
								<div style={{ "font-weight": "500", "font-size": "15px" }}>
									taken voor vandaag
								</div>
								<div style={{ "font-size": "13px", color: "rgb(var(--muted))" }}>
									{deadlineLabel()}
								</div>
							</div>
							<button type="button" class="btn subtle" onClick={() => navigate({ to: "/taken" })}>
								Naar alle taken <ArrowRight class="size-3.5" aria-hidden="true" />
							</button>
						</div>
					</div>
				</div>

				<div class="ds-col" style={{ gap: "24px" }}>
					<div
						class="card"
						style={{
							background: "rgb(var(--primary))",
							"border-color": "rgb(var(--primary))",
							color: "#fff",
						}}
					>
						<div style={{ "font-size": "13px", opacity: "0.85", "font-weight": "500", "margin-bottom": "6px" }}>
							Volgende afspraak
						</div>
						<h3 style={{ color: "#fff", "font-size": "20px" }}>Coachgesprek met je coach</h3>
						<div style={{ "font-size": "14px", opacity: "0.85", "margin-top": "6px" }}>
							Vrijdag 8 mei · 10:30 — 11:00 · Lokaal 1.14
						</div>
						<div class="ds-row" style={{ "margin-top": "16px", gap: "8px" }}>
							<button
								type="button"
								class="btn"
								style={{ background: "rgb(255 255 255 / 0.18)", color: "#fff" }}
								onClick={() => navigate({ to: "/chat" })}
							>
								<MessageSquare class="size-3.5" aria-hidden="true" /> Bericht
							</button>
							<button
								type="button"
								class="btn"
								style={{ background: "#fff", color: "rgb(var(--primary-700))" }}
							>
								Bereid voor
							</button>
						</div>
					</div>

					<div class="card">
						<div class="card-head">
							<h3>Successen</h3>
							<div class="ds-row" style={{ gap: "8px" }}>
								<Show when={showSuccess()}>
									<span class="chip success">+3 deze week</span>
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
								<div style={{ "font-size": "13px", color: "rgb(var(--muted))" }}>
									Successen staan even uit.
								</div>
							}
						>
							<div class="ds-col" style={{ gap: "10px" }}>
								<SuccessRow icon={Check} title="Cursus 'Tekst structureren' afgerond" when="Maandag" />
								<SuccessRow icon={Star} title="Eerste opdracht ingeleverd" when="Dinsdag" tone="accent" />
								<SuccessRow icon={Flame} title="4 dagen op rij ingelogd" when="Vandaag" tone="warning" />
							</div>
						</Show>
					</div>

					<div class="card">
						<div class="card-head">
							<h3>Sociaal</h3>
							<span class="chip">Klas 3B</span>
						</div>
						<div class="ds-col" style={{ gap: "8px" }}>
							<SocialRow name="Lina M." msg="Heb jij § 4.2 al?" time="2m" unread={2} />
							<SocialRow name="Groep · Project Buurt" msg="Yara: Ik heb foto's gemaakt!" time="12m" unread={1} />
							<SocialRow name="Je coach" msg="Mooi gedaan vanmorgen 👏" time="1u" />
						</div>
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
				<div style={{ "font-weight": "500", "font-size": "13.5px" }}>{props.title}</div>
				<div style={{ "font-size": "12px", color: "rgb(var(--muted))" }}>{props.when}</div>
			</div>
		</div>
	);
}

function SocialRow(props: { name: string; msg: string; time: string; unread?: number }) {
	const initials = () =>
		props.name
			.split(" ")
			.map((s) => s[0])
			.slice(0, 2)
			.join("");
	return (
		<div class="ds-row" style={{ cursor: "pointer" }}>
			<div class="avatar" style={{ width: "32px", height: "32px", "font-size": "12px" }}>
				{initials()}
			</div>
			<div class="ds-grow" style={{ "min-width": "0" }}>
				<div class="ds-row ds-between">
					<div style={{ "font-weight": "500", "font-size": "13px" }}>{props.name}</div>
					<div style={{ "font-size": "11px", color: "rgb(var(--muted))" }}>{props.time}</div>
				</div>
				<div
					style={{
						"font-size": "12px",
						color: "rgb(var(--muted))",
						overflow: "hidden",
						"text-overflow": "ellipsis",
						"white-space": "nowrap",
					}}
				>
					{props.msg}
				</div>
			</div>
			<Show when={props.unread}>
				<span class="chip accent" style={{ "min-width": "20px", "justify-content": "center" }}>
					{props.unread}
				</span>
			</Show>
		</div>
	);
}
