import { createFileRoute, Link } from "@tanstack/solid-router";
import { useQuery } from "@tanstack/solid-query";
import {
	ArrowLeft,
	Check,
	Clock,
	FileText,
	Flag,
	ListChecks,
	MessageSquare,
	NotebookPen,
	Sparkles,
	type LucideProps,
} from "lucide-solid";
import { createMemo, For, type JSX, Show } from "solid-js";
import {
	PlanStatusBadge,
	relativeTime,
} from "../../../components/dashboard/plan-status";
import { toast } from "../../../components/ui/toast";
import { requireRole } from "../../../lib/auth/require-role";
import { RequireRole } from "../../../lib/auth/role-guard";
import { moodMeta } from "../../../lib/mood";
import { downloadPlanPdf } from "../../../lib/coachplan/pdf";
import { client, orpc } from "../../../lib/orpc";

/**
 * Full leerling profile (#44) — a 1:1 port of the approved "StudentProfile"
 * prototype: a gradient hero with an overlapping avatar, a 2fr/1fr body with a
 * coachplan card, an activiteit-timeline, leervoorkeuren, a mood-strip and a
 * parent card.
 *
 * The coachplan metadata, leervoorkeuren, taken, cursussen, inzendingen and
 * begeleiding are all wired to the live `dashboard.profile` payload. The
 * mood-strip and the ouders-card have no backend yet, so they render the
 * prototype's structure with clearly-static demo content (never fabricated per
 * leerling). Gated to coach+; the server re-asserts the coach↔leerling
 * assignment within the tenant.
 */
export const Route = createFileRoute("/_protected/dashboard/$leerlingId")({
	beforeLoad: () => requireRole("coach"),
	component: () => (
		<RequireRole min="coach">
			<ProfilePage />
		</RequireRole>
	),
});

const STATUS_LABEL: Record<string, string> = {
	draft: "Concept",
	submitted: "Ingeleverd",
	coach_review: "In behandeling",
	shared_with_leerling: "Gedeeld",
	completed: "Afgerond",
};

const initials = (name: string): string =>
	name
		.trim()
		.split(/\s+/)
		.map((w) => w[0] ?? "")
		.slice(0, 2)
		.join("")
		.toUpperCase();

/** Day letters for the mood-strip: Ma..Zo (M D W D V Z Z). */
const WEEK_LETTERS = ["M", "D", "W", "D", "V", "Z", "Z"];

/** The 7 dates (Ma..Zo) of the current week as "YYYY-MM-DD" (server-local). */
function weekDates(): string[] {
	const now = new Date();
	const mondayOffset = (now.getDay() + 6) % 7; // 0 = Monday
	const monday = new Date(now);
	monday.setDate(now.getDate() - mondayOffset);
	const out: string[] = [];
	for (let i = 0; i < 7; i++) {
		const d = new Date(monday);
		d.setDate(monday.getDate() + i);
		const y = d.getFullYear();
		const mo = String(d.getMonth() + 1).padStart(2, "0");
		const da = String(d.getDate()).padStart(2, "0");
		out.push(`${y}-${mo}-${da}`);
	}
	return out;
}

function ProfilePage() {
	const params = Route.useParams();
	const profile = useQuery(() =>
		orpc.dashboard.profile.queryOptions({
			input: { leerlingId: params().leerlingId },
		}),
	);
	// The real "afgestemd met ouders" flag lives on the coachplan submission.
	const submissionId = () => profile.data?.plan.submissionId ?? null;
	const submissionQuery = useQuery(() => ({
		...orpc.coachplan.getSubmission.queryOptions({
			input: { id: submissionId() ?? "" },
		}),
		enabled: submissionId() != null,
	}));
	// Shared moods of the last 7 days (server only returns opt-in rows).
	const week = useQuery(() => ({
		...orpc.mood.weekFor.queryOptions({
			input: { leerlingId: params().leerlingId },
		}),
		enabled: profile.data != null,
	}));
	const moodByDate = createMemo(() => {
		const m = new Map<string, number>();
		for (const r of week.data ?? []) m.set(r.date, r.mood);
		return m;
	});
	const setApprovedWithParents = async (approved: boolean) => {
		const id = submissionId();
		if (!id) return;
		try {
			await client.coachplan.setApprovedWithParents({
				submissionId: id,
				approved,
			});
			submissionQuery.refetch();
		} catch {
			toast({ title: "Opslaan lukte niet", tone: "danger" });
		}
	};

	return (
		<>
			<div class="ds-row" style={{ "margin-bottom": "16px" }}>
				<Link to="/dashboard" class="btn ghost sm">
					<ArrowLeft class="size-3.5" aria-hidden="true" /> Dashboard
				</Link>
			</div>

			<Show when={profile.isLoading}>
				<div class="card" style={{ color: "rgb(var(--muted))" }}>
					Laden…
				</div>
			</Show>

			<Show when={profile.isError}>
				<div
					class="card"
					style={{
						"border-color": "rgb(var(--warning))",
						color: "rgb(var(--ink-2))",
					}}
				>
					Geen toegang tot dit profiel of leerling niet gevonden.
				</div>
			</Show>

			<Show when={profile.data}>
				{(data) => (
					<>
						{/* Hero */}
						<div
							class="card"
							style={{
								padding: "0",
								overflow: "hidden",
								"margin-bottom": "24px",
							}}
						>
							<div
								style={{
									height: "120px",
									background:
										"linear-gradient(135deg, rgb(var(--primary)), #1A8094)",
								}}
							/>
							<div
								style={{
									padding: "0 24px 24px",
									"margin-top": "-40px",
									display: "flex",
									"align-items": "flex-end",
									gap: "18px",
									"flex-wrap": "wrap",
								}}
							>
								<div
									class="avatar"
									style={{
										width: "88px",
										height: "88px",
										"font-size": "1.75rem",
										border: "4px solid rgb(var(--surface))",
									}}
									aria-hidden="true"
								>
									{initials(data().leerling.name)}
								</div>
								<div
									class="ds-grow"
									style={{ "padding-bottom": "8px", "min-width": "0" }}
								>
									<h1
										class="ds-row"
										style={{ "font-size": "1.625rem", gap: "8px" }}
									>
										{data().leerling.name}
										<Show when={data().aandacht}>
											<span class="chip danger" style={{ "font-size": "0.6875rem" }}>
												<Flag class="size-3" aria-hidden="true" /> Aandacht
											</span>
										</Show>
									</h1>
									<div
										style={{
											"font-size": "0.875rem",
											color: "rgb(var(--muted))",
										}}
									>
										{data().leerling.email}
									</div>
									<Show
										when={data().aandacht && data().aandachtRedenen.length}
									>
										<div
											style={{
												"font-size": "0.8125rem",
												color: "rgb(var(--ink-2))",
												"margin-top": "4px",
											}}
										>
											{data().aandachtRedenen.join(" · ")}
										</div>
									</Show>
								</div>
								<div class="ds-row" style={{ "padding-bottom": "8px" }}>
									<Link
										to="/chat"
										search={{ otherUserId: data().leerling.id }}
										class="btn ghost sm"
									>
										<MessageSquare class="size-3.5" aria-hidden="true" /> Bericht
									</Link>
									<Show when={data().plan.submissionId}>
										<Link
											to="/plan/$submissionId"
											params={{
												submissionId: data().plan.submissionId ?? "",
											}}
											class="btn primary sm"
										>
											<NotebookPen class="size-3.5" aria-hidden="true" /> Open
											coachplan
										</Link>
									</Show>
								</div>
							</div>
						</div>

						{/* Body */}
						<div class="ds-grid-main">
							{/* Left */}
							<div class="ds-col" style={{ gap: "24px" }}>
								{/* Coachplan */}
								<div class="card">
									<div class="card-head">
										<h3>Coachplan</h3>
										<PlanStatusBadge status={data().plan.status} />
									</div>
									<div class="ds-col" style={{ gap: "14px" }}>
										<Field
											label="Laatst bijgewerkt"
											val={relativeTime(data().plan.updatedAt)}
										/>
										<Show when={data().plan.submittedAt}>
											<Field
												label="Ingeleverd"
												val={relativeTime(data().plan.submittedAt)}
											/>
										</Show>
										<Field
											label="Te bespreken met coach"
											val={`${data().plan.discussCount} vraag/vragen`}
											flag={data().plan.discussCount > 0}
										/>
										<Show when={data().leervoorkeuren.length > 0}>
											<Field
												label="Leervoorkeuren"
												chips={data().leervoorkeuren}
											/>
										</Show>
									</div>
									<div
										class="ds-row"
										style={{ "margin-top": "16px", gap: "8px", "flex-wrap": "wrap" }}
									>
										<Show when={submissionId()}>
											{(id) => (
												<>
													<button
														type="button"
														class="btn ghost sm"
														onClick={async () => {
															try {
																await downloadPlanPdf(id());
															} catch {
																toast({ title: "PDF maken lukte niet", tone: "danger" });
															}
														}}
													>
														<FileText class="size-3.5" aria-hidden="true" /> PDF
													</button>
													<Link
														to="/plan/$submissionId"
														params={{ submissionId: id() }}
														class="btn ghost sm"
													>
														<Sparkles class="size-3.5" aria-hidden="true" /> AI-advies
													</Link>
												</>
											)}
										</Show>
										<div class="ds-grow" />
										<Show when={submissionId()}>
											<label
												class="ds-row"
												style={{ gap: "8px", "font-size": "0.8125rem" }}
											>
												<span class="toggle">
													<input
														type="checkbox"
														checked={
															submissionQuery.data?.submission
																.approvedWithParents ?? false
														}
														onChange={(e) =>
															setApprovedWithParents(e.currentTarget.checked)
														}
														aria-label="Afgestemd met ouders"
													/>
													<span class="slider" />
												</span>
												Afgestemd met ouders
											</label>
										</Show>
									</div>
								</div>

								{/* Activiteit — derived from live signals */}
								<div class="card">
									<div class="card-head">
										<h3>Activiteit</h3>
										<span class="chip">Laatste 7 dagen</span>
									</div>
									<Show
										when={
											data().plan.submittedAt ||
											data().recentSubmissions.length > 0 ||
											data().tasks.done > 0
										}
										fallback={
											<p
												style={{
													"font-size": "0.8125rem",
													color: "rgb(var(--muted))",
												}}
											>
												Nog geen recente activiteit.
											</p>
										}
									>
										<Show when={data().tasks.done > 0}>
											<ActivityRow
												icon={Check}
												text={`${data().tasks.done} ${data().tasks.done === 1 ? "taak" : "taken"} afgerond`}
												when={relativeTime(data().lastActivityAt)}
												tone="success"
											/>
										</Show>
										<Show when={data().plan.submittedAt}>
											<ActivityRow
												icon={NotebookPen}
												text="Coachplan ingeleverd"
												when={relativeTime(data().plan.submittedAt)}
												tone="primary"
											/>
										</Show>
										<For each={data().recentSubmissions.slice(0, 3)}>
											{(s) => (
												<ActivityRow
													icon={ListChecks}
													text={`Coachplan · ${STATUS_LABEL[s.status] ?? s.status}`}
													when={relativeTime(s.submittedAt ?? s.updatedAt)}
													tone={s.discussCount > 0 ? "warning" : undefined}
												/>
											)}
										</For>
										<Show when={data().tasks.overdue > 0}>
											<ActivityRow
												icon={Clock}
												text={`${data().tasks.overdue} ${data().tasks.overdue === 1 ? "taak" : "taken"} over tijd`}
												when="Nu"
												tone="warning"
											/>
										</Show>
									</Show>
								</div>

								{/* Recente inzendingen */}
								<div class="card">
									<div class="card-head">
										<h3>Recente inzendingen</h3>
									</div>
									<Show
										when={data().recentSubmissions.length > 0}
										fallback={
											<p
												style={{
													"font-size": "0.8125rem",
													color: "rgb(var(--muted))",
												}}
											>
												Nog geen coachplannen ingeleverd.
											</p>
										}
									>
										<div class="ds-col" style={{ gap: "8px" }}>
											<For each={data().recentSubmissions}>
												{(s) => (
													<div
														class="ds-row ds-between"
														style={{
															padding: "10px 12px",
															background: "rgb(var(--bg-2))",
															"border-radius": "8px",
															gap: "12px",
														}}
													>
														<div style={{ "min-width": "0" }}>
															<div
																style={{
																	"font-size": "0.8125rem",
																	"font-weight": "500",
																}}
															>
																{STATUS_LABEL[s.status] ?? s.status}
															</div>
															<div
																style={{
																	"font-size": "0.6875rem",
																	color: "rgb(var(--muted))",
																}}
															>
																{relativeTime(s.submittedAt ?? s.updatedAt)}
															</div>
														</div>
														<div class="ds-row" style={{ gap: "8px" }}>
															<Show when={s.discussCount > 0}>
																<span class="chip accent">
																	{s.discussCount} bespreken
																</span>
															</Show>
															<Link
																to="/plan/$submissionId"
																params={{ submissionId: s.id }}
																class="btn ghost sm"
															>
																Open
															</Link>
														</div>
													</div>
												)}
											</For>
										</div>
									</Show>
								</div>

								{/* Actieve cursussen */}
								<div class="card">
									<div class="card-head">
										<h3>Actieve cursussen</h3>
									</div>
									<Show
										when={data().courses.length > 0}
										fallback={
											<p
												style={{
													"font-size": "0.8125rem",
													color: "rgb(var(--muted))",
												}}
											>
												Geen actieve cursussen.
											</p>
										}
									>
										<div class="ds-col" style={{ gap: "6px" }}>
											<For each={data().courses}>
												{(c) => (
													<div
														class="ds-row ds-between"
														style={{
															padding: "8px 12px",
															background: "rgb(var(--bg-2))",
															"border-radius": "8px",
															gap: "12px",
														}}
													>
														<div
															style={{
																"font-size": "0.8125rem",
																"font-weight": "500",
																flex: "1",
																"min-width": "0",
																overflow: "hidden",
																"text-overflow": "ellipsis",
																"white-space": "nowrap",
															}}
														>
															{c.title}
														</div>
														<div
															style={{ width: "80px" }}
															role="progressbar"
															aria-valuenow={c.progress}
															aria-valuemin={0}
															aria-valuemax={100}
															aria-label={`Voortgang ${c.title}`}
														>
															<div class="progress">
																<span style={{ width: `${c.progress}%` }} />
															</div>
														</div>
														<div
															style={{
																"font-size": "0.75rem",
																color: "rgb(var(--muted))",
																width: "32px",
																"text-align": "right",
															}}
														>
															{c.progress}%
														</div>
													</div>
												)}
											</For>
										</div>
									</Show>
								</div>
							</div>

							{/* Right */}
							<div class="ds-col" style={{ gap: "24px" }}>
								{/* Leervoorkeuren */}
								<div class="card">
									<div class="card-head">
										<h3>Leervoorkeuren</h3>
									</div>
									<Show
										when={data().leervoorkeuren.length > 0}
										fallback={
											<p
												style={{
													"font-size": "0.8125rem",
													color: "rgb(var(--muted))",
												}}
											>
												Nog niet vastgelegd.
											</p>
										}
									>
										<div
											class="ds-row"
											style={{ "flex-wrap": "wrap", gap: "6px" }}
										>
											<For each={data().leervoorkeuren}>
												{(v) => <span class="chip primary">{v}</span>}
											</For>
										</div>
									</Show>
								</div>

								{/* Mood deze week — alleen gedeelde moods; anders eerlijke lege staat. */}
								<div class="card">
									<div class="card-head">
										<h3>Mood deze week</h3>
									</div>
									<Show
										when={(week.data?.length ?? 0) > 0}
										fallback={
											<p
												style={{
													"font-size": "0.8125rem",
													color: "rgb(var(--muted))",
												}}
											>
												Nog geen mood gedeeld door{" "}
												{data().leerling.name.split(" ")[0]}.
											</p>
										}
									>
										<div
											style={{
												display: "grid",
												"grid-template-columns": "repeat(7, 1fr)",
												gap: "8px",
												"text-align": "center",
											}}
										>
											<For each={weekDates()}>
												{(iso, i) => (
													<div>
														<div
															style={{
																"font-size": "0.6875rem",
																color: "rgb(var(--muted))",
																"margin-bottom": "6px",
															}}
														>
															{WEEK_LETTERS[i()]}
														</div>
														<Show
															when={moodByDate().has(iso)}
															fallback={
																<div
																	style={{
																		"font-size": "1.125rem",
																		color: "rgb(var(--muted))",
																	}}
																>
																	–
																</div>
															}
														>
															<div
																style={{ "font-size": "1.375rem", "line-height": "1" }}
																title={
																	moodMeta(moodByDate().get(iso) as number).label
																}
																aria-label={
																	moodMeta(moodByDate().get(iso) as number).label
																}
															>
																{moodMeta(moodByDate().get(iso) as number).e}
															</div>
														</Show>
													</div>
												)}
											</For>
										</div>
									</Show>
								</div>

								{/* Taken */}
								<div class="card">
									<div class="card-head">
										<h3>Taken</h3>
									</div>
									<div class="ds-row" style={{ gap: "24px" }}>
										<Stat label="Open" value={data().tasks.open} />
										<Stat label="Klaar" value={data().tasks.done} />
										<Stat
											label="Over tijd"
											value={data().tasks.overdue}
											tone={data().tasks.overdue > 0 ? "danger" : undefined}
										/>
									</div>
									<Show when={data().tasksToday.length > 0}>
										<div style={{ "margin-top": "16px" }}>
											<div
												style={{
													"font-size": "0.6875rem",
													color: "rgb(var(--muted))",
													"text-transform": "uppercase",
													"letter-spacing": "0.04em",
													"margin-bottom": "8px",
												}}
											>
												Vandaag
											</div>
											<div class="ds-col" style={{ gap: "6px" }}>
												<For each={data().tasksToday}>
													{(t) => (
														<div
															class="ds-row ds-between"
															style={{
																padding: "10px 12px",
																background: "rgb(var(--bg-2))",
																"border-radius": "8px",
																gap: "8px",
																"font-size": "0.8125rem",
															}}
														>
															<span
																style={{
																	"min-width": "0",
																	overflow: "hidden",
																	"text-overflow": "ellipsis",
																	"white-space": "nowrap",
																}}
															>
																{t.title}
															</span>
															<Show when={t.overdue}>
																<span class="chip danger">over tijd</span>
															</Show>
														</div>
													)}
												</For>
											</div>
										</div>
									</Show>
								</div>

								{/* Begeleiding */}
								<div class="card">
									<div class="card-head">
										<h3>Begeleiding</h3>
									</div>
									<Show
										when={data().assignments.length > 0}
										fallback={
											<p
												style={{
													"font-size": "0.8125rem",
													color: "rgb(var(--muted))",
												}}
											>
												Geen coach gekoppeld.
											</p>
										}
									>
										<div class="ds-col" style={{ gap: "10px" }}>
											<For each={data().assignments}>
												{(a) => (
													<div class="ds-row" style={{ gap: "10px" }}>
														<div
															class="avatar coach"
															style={{
																width: "34px",
																height: "34px",
																"font-size": "0.75rem",
															}}
															aria-hidden="true"
														>
															{initials(a.coachName)}
														</div>
														<div style={{ "min-width": "0" }}>
															<div
																style={{
																	"font-weight": "500",
																	"font-size": "0.8125rem",
																}}
															>
																{a.coachName}
															</div>
															<div
																style={{
																	"font-size": "0.75rem",
																	color: "rgb(var(--muted))",
																}}
															>
																Coach · sinds {relativeTime(a.createdAt)}
															</div>
														</div>
													</div>
												)}
											</For>
										</div>
									</Show>
								</div>

								{/* Ouders — geen ouder-koppeling in het systeem; eerlijke lege staat. */}
								<div class="card">
									<div class="card-head">
										<h3>Ouders</h3>
									</div>
									<p
										style={{
											"font-size": "0.8125rem",
											color: "rgb(var(--muted))",
										}}
									>
										Nog geen ouder of verzorger gekoppeld.
									</p>
								</div>
							</div>
						</div>
					</>
				)}
			</Show>
		</>
	);
}

function Field(props: {
	label: string;
	val?: string;
	chips?: string[];
	flag?: boolean;
}) {
	return (
		<div>
			<div
				class="ds-row"
				style={{
					"font-size": "0.75rem",
					color: "rgb(var(--muted))",
					"margin-bottom": "4px",
					"font-weight": "500",
					gap: "8px",
				}}
			>
				{props.label}
				<Show when={props.flag}>
					<span class="chip accent" style={{ "font-size": "0.625rem" }}>
						<Flag class="size-3" aria-hidden="true" /> Bespreken
					</span>
				</Show>
			</div>
			<Show
				when={props.chips}
				fallback={<div style={{ "font-size": "0.875rem" }}>{props.val}</div>}
			>
				<div class="ds-row" style={{ "flex-wrap": "wrap", gap: "6px" }}>
					<For each={props.chips}>
						{(v) => <span class="chip primary">{v}</span>}
					</For>
				</div>
			</Show>
		</div>
	);
}

function ActivityRow(props: {
	icon: (p: LucideProps) => JSX.Element;
	text: string;
	when: string;
	tone?: "success" | "primary" | "warning";
}) {
	const bg = () =>
		props.tone === "success"
			? "rgb(var(--success-100))"
			: props.tone === "primary"
				? "rgb(var(--primary-100))"
				: props.tone === "warning"
					? "rgb(var(--warning-100))"
					: "rgb(var(--bg-2))";
	const fg = () =>
		props.tone === "success"
			? "rgb(var(--success))"
			: props.tone === "primary"
				? "rgb(var(--primary-700))"
				: props.tone === "warning"
					? "rgb(var(--warning))"
					: "rgb(var(--ink-2))";
	return (
		<div
			class="ds-row"
			style={{
				padding: "10px 0",
				"border-bottom": "1px solid rgb(var(--line-2))",
				gap: "12px",
			}}
		>
			<div
				style={{
					width: "32px",
					height: "32px",
					"border-radius": "9px",
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
				<div style={{ "font-size": "0.8438rem" }}>{props.text}</div>
				<div style={{ "font-size": "0.6875rem", color: "rgb(var(--muted))" }}>
					{props.when}
				</div>
			</div>
		</div>
	);
}

function Stat(props: { label: string; value: number; tone?: "danger" }) {
	return (
		<div>
			<div
				style={{
					"font-family": "var(--font-head)",
					"font-size": "1.5rem",
					"font-weight": "600",
					color:
						props.tone === "danger"
							? "rgb(var(--danger))"
							: "rgb(var(--ink))",
				}}
			>
				{props.value}
			</div>
			<div style={{ "font-size": "0.6875rem", color: "rgb(var(--muted))" }}>
				{props.label}
			</div>
		</div>
	);
}
