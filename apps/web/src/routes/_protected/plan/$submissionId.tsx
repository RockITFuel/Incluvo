import { createFileRoute } from "@tanstack/solid-router";
import { useQuery } from "@tanstack/solid-query";
import {
	ArrowLeft,
	ArrowRight,
	Check,
	FileText,
	Save,
	Send,
	Sparkles,
} from "lucide-solid";
import { createMemo, createSignal, For, Match, Show, Switch } from "solid-js";
import { createStore } from "solid-js/store";
import { AssistantPanel } from "../../../components/ai/assistant-panel";
import { TranscriptionPanel } from "../../../components/ai/transcription-panel";
import {
	QuestionInput,
	type QuestionDTO,
	renderAnswerText,
} from "../../../components/coachplan/question-input";
import { toast } from "../../../components/ui/toast";
import { requireRole } from "../../../lib/auth/require-role";
import { RequireRole } from "../../../lib/auth/role-guard";
import { useMe } from "../../../lib/auth/use-me";
import { client, orpc } from "../../../lib/orpc";

/**
 * Coach review of a submitted coachplan (#15–#21), presented as a step-by-step
 * wizard over the coach-gedeelte (POPP) with a live AI sidebar — a 1:1 port of
 * the approved "Coachplan invullen" prototype.
 *
 * The left column walks the coach through the real coach-section questions from
 * the submission's template one at a time; questions that were auto-filled from
 * the leerling (#18 `answerCoachMapping`) show the mapped leerling answer in a
 * "Antwoord leerling" panel. A synthetic leervoorkeuren step surfaces the #19
 * standaardlabels picker (which also shows the leerling's own leervoorkeur
 * answer as its mapped source). The right column hosts the real transcriptietool
 * (#18), the streaming AI-advies (#22) and a plan-voortgang meter. Gated to
 * coach+.
 */
export const Route = createFileRoute("/_protected/plan/$submissionId")({
	beforeLoad: () => requireRole("coach"),
	component: () => (
		<RequireRole min="coach">
			<CoachReview />
		</RequireRole>
	),
});

/** A wizard step: either a real coach question, or the leervoorkeuren picker. */
type Step =
	| { kind: "question"; q: QuestionDTO }
	| { kind: "leervoorkeuren"; leerlingQ?: QuestionDTO };

/** Two-letter initials for the header avatar. */
function initials(name: string): string {
	return (
		name
			.split(/\s+/)
			.map((s) => s[0])
			.filter(Boolean)
			.slice(0, 2)
			.join("")
			.toUpperCase() || "?"
	);
}

/** Friendly relative day for "Bron: leerlingvragenlijst van …". */
function relativeDay(input: Date | string | null | undefined): string {
	if (!input) return "onbekend";
	const date = typeof input === "string" ? new Date(input) : input;
	if (Number.isNaN(date.getTime())) return "onbekend";
	const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
	if (days <= 0) return "vandaag";
	if (days === 1) return "gisteren";
	if (days < 7) return `${days} dagen geleden`;
	return date.toLocaleDateString("nl-NL", { day: "numeric", month: "long" });
}

function CoachReview() {
	const params = Route.useParams();
	const me = useMe();
	const id = () => params().submissionId;

	const submissionQuery = useQuery(() =>
		orpc.coachplan.getSubmission.queryOptions({ input: { id: id() } }),
	);
	const mappingsQuery = useQuery(() =>
		orpc.coachplan.listMappings.queryOptions({ input: { id: id() } }),
	);
	const labelsQuery = useQuery(() => orpc.coachplan.defaultLabels.queryOptions());
	// The coach's inbox carries the leerling's display name + template name for
	// this submission (getSubmission doesn't return the name).
	const inboxQuery = useQuery(() => orpc.coachplan.inbox.queryOptions());

	const isCoach = () => me.hasAtLeast("coach");

	const questions = () =>
		(submissionQuery.data?.questions ?? []) as unknown as QuestionDTO[];
	const coachQ = createMemo(() => questions().filter((q) => q.section === "coach"));

	const answerFor = (questionId: string) =>
		submissionQuery.data?.answers.find((a) => a.questionId === questionId);
	const mappingFor = (coachQuestionId: string) =>
		mappingsQuery.data?.find((m) => m.coachQuestionId === coachQuestionId);

	const inboxRow = () => inboxQuery.data?.find((r) => r.submission.id === id());
	const leerlingName = () => inboxRow()?.leerlingName ?? "Leerling";
	const templateName = () =>
		submissionQuery.data?.template?.name ?? inboxRow()?.templateName ?? "Coachplan";

	// Local coach-answer buffer (seeded once from live answers + mapping overrides).
	const [coachAnswers, setCoachAnswers] = createStore<Record<string, string>>({});
	const [prefs, setPrefs] = createSignal<string[]>([]);
	const [seeded, setSeeded] = createSignal(false);

	const seed = () => {
		const data = submissionQuery.data;
		if (!data || seeded()) return;
		for (const a of data.answers) {
			if (a.value != null) setCoachAnswers(a.questionId, a.value);
		}
		setPrefs(data.learningPreferences);
		setSeeded(true);
	};
	// Fold any coach mapping-override into the textarea when no coach answer yet.
	const seedMappings = () => {
		const ms = mappingsQuery.data;
		if (!ms) return;
		for (const m of ms) {
			if (m.overrideValue != null && coachAnswers[m.coachQuestionId] === undefined) {
				setCoachAnswers(m.coachQuestionId, m.overrideValue);
			}
		}
	};

	const refresh = () => submissionQuery.refetch();

	// ── Wizard steps: real coach questions + one leervoorkeuren step (#19) ──────
	const steps = createMemo<Step[]>(() => {
		const cq: Step[] = coachQ().map((q) => ({ kind: "question", q }));
		const leerlingQ = questions().find(
			(q) => q.section === "leerling" && q.type === "leervoorkeur",
		);
		const prefStep: Step = { kind: "leervoorkeuren", leerlingQ };
		const [first, ...rest] = cq;
		if (!first) return [prefStep];
		// Place leervoorkeuren just after the first coach question (as in the design).
		return [first, prefStep, ...rest];
	});
	const total = () => steps().length;
	const [step, setStep] = createSignal(0);
	const cur = () => steps()[Math.min(step(), Math.max(0, total() - 1))];

	const themeLabel = () => {
		const s = cur();
		if (!s) return "";
		if (s.kind === "leervoorkeuren") return "Leervoorkeuren";
		return (s.q.options?.theme as string | undefined) ?? "Coachplan";
	};
	const isMapped = () => {
		const s = cur();
		if (!s) return false;
		if (s.kind === "leervoorkeuren")
			return Boolean(s.leerlingQ && answerFor(s.leerlingQ.id));
		return Boolean(mappingFor(s.q.id));
	};

	// Mapped leerling answer for the current coach question (via #18 mapping).
	const leerlingSource = createMemo(() => {
		const s = cur();
		if (!s || s.kind !== "question") return null;
		const m = mappingFor(s.q.id);
		if (!m?.sourceAnswerId) return null;
		const a = submissionQuery.data?.answers.find((x) => x.id === m.sourceAnswerId);
		const sq = a ? questions().find((q) => q.id === a.questionId) : undefined;
		if (!a || !sq) return null;
		return renderAnswerText(sq, {
			value: a.value ?? null,
			valueJson: (a.valueJson as string[] | null) ?? null,
		});
	});
	// The leerling's own leervoorkeur answer, shown on the leervoorkeuren step.
	const prefSource = createMemo(() => {
		const s = cur();
		if (!s || s.kind !== "leervoorkeuren" || !s.leerlingQ) return null;
		const a = answerFor(s.leerlingQ.id);
		if (!a) return null;
		return renderAnswerText(s.leerlingQ, {
			value: a.value ?? null,
			valueJson: (a.valueJson as string[] | null) ?? null,
		});
	});

	// Real plan-voortgang: coach questions answered + leervoorkeuren confirmed.
	const filledCount = () =>
		steps().reduce((n, s) => {
			if (s.kind === "leervoorkeuren") return n + (prefs().length ? 1 : 0);
			const v = coachAnswers[s.q.id];
			return n + (v && v.trim() ? 1 : 0);
		}, 0);

	// ── Mutations (all real oRPC) ──────────────────────────────────────────────
	const togglePref = async (value: string) => {
		const next = prefs().includes(value)
			? prefs().filter((p) => p !== value)
			: [...prefs(), value];
		setPrefs(next);
		try {
			await client.coachplan.setLearningPreferences({
				submissionId: id(),
				labels: next,
			});
		} catch {
			toast({ title: "Opslaan lukte niet", tone: "danger" });
		}
	};

	const saveCurrent = async () => {
		const s = cur();
		if (!s) return;
		try {
			if (s.kind === "leervoorkeuren") {
				await client.coachplan.setLearningPreferences({
					submissionId: id(),
					labels: prefs(),
				});
			} else {
				const val = coachAnswers[s.q.id] ?? "";
				await client.coachplan.saveCoachAnswer({
					submissionId: id(),
					questionId: s.q.id,
					value: val,
				});
				// A mapped (auto-filled) answer keeps its coach override in sync (#16).
				if (mappingFor(s.q.id)) {
					await client.coachplan.upsertMapping({
						submissionId: id(),
						coachQuestionId: s.q.id,
						overrideValue: val,
					});
				}
			}
			toast({ title: "Tussentijds opgeslagen", tone: "success" });
			refresh();
		} catch {
			toast({ title: "Opslaan lukte niet", tone: "danger" });
		}
	};

	// Autosave a non-text coach question (registry input) via saveCoachAnswer.
	const saveChoice = (questionId: string, next: { value?: string | null; valueJson?: string[] | null }) => {
		if (next.value !== undefined) setCoachAnswers(questionId, next.value ?? "");
		client.coachplan
			.saveCoachAnswer({
				submissionId: id(),
				questionId,
				value: next.value ?? null,
				valueJson: next.valueJson ?? undefined,
			})
			.catch(() => toast({ title: "Opslaan lukte niet", tone: "danger" }));
	};

	const toggleParents = async (on: boolean) => {
		try {
			await client.coachplan.setApprovedWithParents({
				submissionId: id(),
				approved: on,
			});
			refresh();
		} catch {
			toast({ title: "Opslaan lukte niet", tone: "danger" });
		}
	};

	const share = async () => {
		try {
			await client.coachplan.shareWithLeerling({ submissionId: id() });
			toast({ title: "Aangeboden aan leerling", tone: "success" });
			refresh();
		} catch {
			toast({ title: "Lukte niet", tone: "danger" });
		}
	};

	const [pdfBusy, setPdfBusy] = createSignal(false);
	const downloadPdf = async () => {
		setPdfBusy(true);
		try {
			const res = await client.coachplan.generatePdf({ id: id() });
			const bin = atob(res.base64);
			const bytes = new Uint8Array(bin.length);
			for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
			const blob = new Blob([bytes], { type: res.contentType });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = res.filename;
			a.click();
			URL.revokeObjectURL(url);
			toast({ title: "PDF gedownload", tone: "success" });
		} catch {
			toast({ title: "PDF genereren lukte niet", tone: "danger" });
		} finally {
			setPdfBusy(false);
		}
	};

	const coachContext = () => {
		const prefLabels = prefs().map(
			(v) => labelsQuery.data?.find((l) => l.value === v)?.label ?? v,
		);
		const s = cur();
		const focus =
			s && s.kind === "question" ? ` Huidige vraag: ${s.q.label}.` : "";
		return `Coachplan voor ${leerlingName()}. Leervoorkeuren: ${
			prefLabels.join(", ") || "nog geen"
		}.${focus}`;
	};

	return (
		<>
			<Show when={!isCoach()}>
				<div class="card" style={{ "border-color": "rgb(var(--danger))" }}>
					<h1 class="font-head text-h2 text-ink">Geen toegang</h1>
					<p class="mt-2 text-muted">Alleen een coach kan een coachplan beoordelen.</p>
				</div>
			</Show>

			<Show when={isCoach() && submissionQuery.isLoading}>
				<p class="text-muted">Laden…</p>
			</Show>
			<Show when={isCoach() && submissionQuery.error}>
				<div class="card" style={{ "border-color": "rgb(var(--danger))" }}>
					<p style={{ color: "rgb(var(--danger))" }}>Kon dit coachplan niet laden.</p>
				</div>
			</Show>

			<Show when={isCoach() && submissionQuery.data}>
				{(() => {
					seed();
					seedMappings();
					return null;
				})()}

				{/* Header row */}
				<div class="ds-row" style={{ "margin-bottom": "14px" }}>
					<div class="ds-row" style={{ gap: "10px" }}>
						<div
							class="avatar"
							style={{ width: "32px", height: "32px", "font-size": "11px" }}
						>
							{initials(leerlingName())}
						</div>
						<div>
							<div style={{ "font-weight": "600", "font-size": "14px" }}>
								Coachplan · {leerlingName()}
							</div>
							<div style={{ "font-size": "12px", color: "rgb(var(--muted))" }}>
								{templateName()} · Bron: leerlingvragenlijst van{" "}
								{relativeDay(submissionQuery.data?.submission.submittedAt)}
							</div>
						</div>
					</div>
					<div class="ds-grow" />
					<button
						type="button"
						class="btn ghost sm"
						onClick={downloadPdf}
						disabled={pdfBusy()}
					>
						<FileText class="size-3.5" aria-hidden="true" />{" "}
						{pdfBusy() ? "PDF maken…" : "PDF genereren"}
					</button>
					<button type="button" class="btn primary sm" onClick={share}>
						Aanbieden aan leerling <Send class="size-3.5" aria-hidden="true" />
					</button>
				</div>

				<div
					class="ds-grid"
					style={{ "grid-template-columns": "2fr 1fr", gap: "24px" }}
				>
					{/* LEFT — wizard */}
					<div class="ds-col" style={{ gap: "16px" }}>
						<div class="ds-row ds-between">
							<div class="ds-row" style={{ gap: "8px" }}>
								<span class="chip primary">{themeLabel()}</span>
								<span class="chip">
									Vraag {step() + 1} van {total()}
								</span>
								<Show when={isMapped()}>
									<span class="chip success">
										<Sparkles class="size-3" aria-hidden="true" /> Gemapt vanuit
										leerling
									</span>
								</Show>
							</div>
							<div class="ds-row" style={{ gap: "6px" }}>
								<button
									type="button"
									class="btn ghost sm"
									aria-label="Vorige vraag"
									disabled={step() === 0}
									onClick={() => setStep(Math.max(0, step() - 1))}
								>
									<ArrowLeft class="size-3.5" aria-hidden="true" />
								</button>
								<button
									type="button"
									class="btn ghost sm"
									aria-label="Volgende vraag"
									disabled={step() >= total() - 1}
									onClick={() => setStep(Math.min(total() - 1, step() + 1))}
								>
									<ArrowRight class="size-3.5" aria-hidden="true" />
								</button>
							</div>
						</div>

						<div class="card">
							<Switch>
								{/* Real coach question */}
								<Match when={cur()?.kind === "question"}>
									{(() => {
										const s = cur() as Extract<Step, { kind: "question" }>;
										return (
											<>
												<h2
													style={{
														"font-size": "22px",
														"margin-bottom": "8px",
														"text-wrap": "balance",
													}}
												>
													{s.q.label}
												</h2>
												<Show when={s.q.helpText}>
													<p
														class="card-sub"
														style={{ "margin-bottom": "12px" }}
													>
														{s.q.helpText}
													</p>
												</Show>

												<Show when={leerlingSource()}>
													{(rendered) => (
														<div
															style={{
																padding: "10px 14px",
																background: "rgb(var(--primary-50))",
																border: "1px solid rgb(var(--primary-100))",
																"border-radius": "10px",
																"margin-bottom": "14px",
																"font-size": "13px",
															}}
														>
															<div
																style={{
																	"font-size": "11px",
																	"font-weight": "600",
																	color: "rgb(var(--primary-700))",
																	"text-transform": "uppercase",
																	"letter-spacing": "0.06em",
																	"margin-bottom": "4px",
																}}
															>
																Antwoord leerling
															</div>
															<Switch>
																<Match when={rendered().kind === "chips"}>
																	<div
																		class="ds-row"
																		style={{ "flex-wrap": "wrap", gap: "6px" }}
																	>
																		<For each={rendered().chips}>
																			{(c) => <span class="chip primary">{c}</span>}
																		</For>
																	</div>
																</Match>
																<Match when={rendered().kind === "text"}>
																	<div style={{ "white-space": "pre-wrap" }}>
																		{rendered().text}
																	</div>
																</Match>
																<Match when={rendered().kind === "empty"}>
																	<span
																		style={{
																			color: "rgb(var(--muted))",
																			"font-style": "italic",
																		}}
																	>
																		Niet ingevuld
																	</span>
																</Match>
															</Switch>
														</div>
													)}
												</Show>

												<Switch>
													<Match
														when={
															s.q.type === "long_text" || s.q.type === "short_text"
														}
													>
														<textarea
															class="textarea"
															style={{ "min-height": "140px", "font-size": "14px" }}
															aria-label={s.q.label}
															placeholder="Schrijf hier je observatie. Antwoorden worden tussentijds opgeslagen."
															value={coachAnswers[s.q.id] ?? ""}
															onInput={(e) =>
																setCoachAnswers(s.q.id, e.currentTarget.value)
															}
														/>
													</Match>
													<Match when={true}>
														<QuestionInput
															question={s.q}
															value={{
																value: coachAnswers[s.q.id] ?? null,
																valueJson:
																	(answerFor(s.q.id)?.valueJson as
																		| string[]
																		| null) ?? null,
															}}
															onChange={(next) => saveChoice(s.q.id, next)}
														/>
													</Match>
												</Switch>
											</>
										);
									})()}
								</Match>

								{/* Synthetic leervoorkeuren step (#19) */}
								<Match when={cur()?.kind === "leervoorkeuren"}>
									<h2
										style={{
											"font-size": "22px",
											"margin-bottom": "8px",
											"text-wrap": "balance",
										}}
									>
										Welke leervoorkeuren bevestig je samen met de leerling?
									</h2>
									<p class="card-sub" style={{ "margin-bottom": "12px" }}>
										Deze standaardlabels sturen ook de leeromgeving van de leerling
										aan.
									</p>

									<Show when={prefSource()}>
										{(rendered) => (
											<div
												style={{
													padding: "10px 14px",
													background: "rgb(var(--primary-50))",
													border: "1px solid rgb(var(--primary-100))",
													"border-radius": "10px",
													"margin-bottom": "14px",
													"font-size": "13px",
												}}
											>
												<div
													style={{
														"font-size": "11px",
														"font-weight": "600",
														color: "rgb(var(--primary-700))",
														"text-transform": "uppercase",
														"letter-spacing": "0.06em",
														"margin-bottom": "4px",
													}}
												>
													Antwoord leerling
												</div>
												<Switch>
													<Match when={rendered().kind === "chips"}>
														<div
															class="ds-row"
															style={{ "flex-wrap": "wrap", gap: "6px" }}
														>
															<For each={rendered().chips}>
																{(c) => <span class="chip primary">{c}</span>}
															</For>
														</div>
													</Match>
													<Match when={rendered().kind === "text"}>
														<div style={{ "white-space": "pre-wrap" }}>
															{rendered().text}
														</div>
													</Match>
												</Switch>
											</div>
										)}
									</Show>

									<div
										class="ds-row"
										role="group"
										aria-label="Leervoorkeuren"
										style={{ "flex-wrap": "wrap", gap: "8px" }}
									>
										<For each={labelsQuery.data}>
											{(opt) => {
												// Store the human label (not the value): the stored string is
											// what the banner, profielchips and bouwer-labels render and
											// what block-labels must match (#35/#36).
											const on = () => prefs().includes(opt.label);
												return (
													<button
														type="button"
														class={`chip ${on() ? "primary" : "outline"}`}
														style={{
															padding: "8px 14px",
															"font-size": "13px",
															cursor: "pointer",
														}}
														aria-pressed={on()}
														onClick={() => togglePref(opt.label)}
													>
														<Show when={on()}>
															<Check class="size-3" aria-hidden="true" />
														</Show>{" "}
														{opt.label}
													</button>
												);
											}}
										</For>
									</div>
								</Match>
							</Switch>
						</div>

						<div class="ds-row ds-between">
							<button type="button" class="btn ghost" onClick={saveCurrent}>
								<Save class="size-3.5" aria-hidden="true" /> Tussentijds opslaan
							</button>
							<label class="ds-row" style={{ gap: "8px", "font-size": "13px" }}>
								<span class="toggle">
									<input
										type="checkbox"
										checked={
											submissionQuery.data?.submission.approvedWithParents ?? false
										}
										onChange={(e) => toggleParents(e.currentTarget.checked)}
										aria-label="Afgestemd met ouders"
									/>
									<span class="slider" />
								</span>{" "}
								Afgestemd met ouders
							</label>
						</div>
					</div>

					{/* RIGHT — AI sidebar + voortgang */}
					<div class="ds-col" style={{ gap: "16px" }}>
						<TranscriptionPanel submissionId={id()} />
						<AssistantPanel
							submissionId={id()}
							coachplanContext={coachContext()}
							title="AI-advies"
						/>
						<div class="card">
							<div class="card-head">
								<h3 style={{ "font-size": "15px" }}>Voortgang plan</h3>
							</div>
							<div class="progress" style={{ "margin-bottom": "8px" }}>
								<span
									style={{
										width: `${total() ? (filledCount() / total()) * 100 : 0}%`,
									}}
								/>
							</div>
							<div style={{ "font-size": "12px", color: "rgb(var(--muted))" }}>
								{filledCount()} van {total()} vragen ingevuld
							</div>
						</div>
					</div>
				</div>
			</Show>
		</>
	);
}
