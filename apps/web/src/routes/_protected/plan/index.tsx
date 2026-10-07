import { createFileRoute, Link, useNavigate } from "@tanstack/solid-router";
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { createStore } from "solid-js/store";
import {
	type AnswerValue,
	QuestionInput,
	type QuestionDTO,
	renderAnswerText,
} from "../../../components/coachplan/question-input";
import { PlanStatusBadge } from "../../../components/dashboard/plan-status";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { Switch } from "../../../components/ui/switch";
import { toast } from "../../../components/ui/toast";
import { PlanView } from "../../../components/coachplan/plan-view";
import { downloadPlanPdf } from "../../../lib/coachplan/pdf";
import { useMe } from "../../../lib/auth/use-me";
import { client, orpc } from "../../../lib/orpc";
import { ErrorState } from "../../../components/ui/error-state";
import { friendlyError } from "../../../lib/errors";
import { RequireRole } from "../../../lib/auth/role-guard";
import { createAnswerSaver } from "../../../lib/coachplan/answer-saver";
import { useServerEvent } from "../../../lib/sse/use-events";

/** INC-14 AC7: shown once the coach has started on the coach part. */
const COACH_STARTED =
	"Je coach is begonnen met het invullen van jullie plan. Je kunt je antwoorden nu alleen nog bekijken.";

/**
 * `/plan` entry point. Role-aware: a coach sees the inbox of submitted plans
 * (#15) to open for review; a leerling gets the fill wizard (#11–#14).
 */
export const Route = createFileRoute("/_protected/plan/")({
	component: PlanEntry,
});

function PlanEntry() {
	const me = useMe();
	// RequireRole waits for `account.me` before choosing a view: otherwise a
	// coach would briefly mount the leerling wizard and fire its side-effectful
	// `startMine()` RPC. The superadmin manages the forms (/plan/beheer) and is
	// sent home; plans belong to the school.
	return (
		<RequireRole min="leerling" only={["leerling", "coach", "keyuser"]}>
			<Show when={me.hasAtLeast("coach")} fallback={<LeerlingPlan />}>
				<CoachInbox />
			</Show>
		</RequireRole>
	);
}

/** Coach inbox of submitted/in-review coachplannen (#15). */
function CoachInbox() {
	const inboxQuery = useQuery(() => orpc.coachplan.inbox.queryOptions());
	return (
		<section class="mx-auto flex w-full max-w-4xl flex-col gap-6">
			<div>
				<h1 class="font-head text-h1 text-ink">Coachplannen</h1>
				<p class="mt-1 text-body text-muted">
					Ingeleverde plannen van je leerlingen. Open er één om te beoordelen.
				</p>
			</div>
			<Show when={inboxQuery.isLoading}>
				<p class="text-muted">Laden…</p>
			</Show>
			<Show when={inboxQuery.error}>
				<ErrorState
					error={inboxQuery.error}
					what="de coachplannen"
					onRetry={() => inboxQuery.refetch()}
				/>
			</Show>
			<Show when={inboxQuery.data?.length === 0}>
				<Card class="text-muted">Nog geen ingeleverde coachplannen.</Card>
			</Show>
			<ul class="flex flex-col gap-2">
				<For each={inboxQuery.data}>
					{(row) => (
						<li>
							<Link
								to="/plan/$submissionId"
								params={{ submissionId: row.submission.id }}
							>
								<Card
									padding="sm"
									class="flex items-center justify-between gap-3 hover:border-primary"
								>
									<div class="min-w-0">
										<p class="font-medium text-ink">{row.leerlingName}</p>
										<p class="text-small text-muted">{row.templateName}</p>
									</div>
									<div class="flex items-center gap-2">
										<Show when={row.discussCount > 0}>
											<Badge variant="accent">
												{row.discussCount} bespreken
											</Badge>
										</Show>
										<Show when={row.submission.version > 1}>
											<Badge variant="neutral">versie {row.submission.version}</Badge>
										</Show>
										<PlanStatusBadge status={row.submission.status} />
									</div>
								</Card>
							</Link>
						</li>
					)}
				</For>
			</ul>
		</section>
	);
}

/**
 * The leerling's plan (fix plan 2.1): fill it in, wait for the coach, or read
 * the shared plan and start a new version ("Plan bijwerken").
 */
function LeerlingPlan() {
	const queryClient = useQueryClient();
	const state = useQuery(() => orpc.coachplan.mine.queryOptions());
	const [revising, setRevising] = createSignal(false);
	const [editing, setEditing] = createSignal(false);
	const [pdfBusy, setPdfBusy] = createSignal(false);
	const latest = () => state.data?.latest ?? null;
	const current = () => state.data?.current ?? null;
	const phase = () => {
		const l = latest();
		if (!l || l.status === "draft") return "fill";
		if (l.status === "submitted" || l.status === "coach_review") return "with_coach";
		return "shared";
	};
	const refresh = () =>
		queryClient.invalidateQueries({ queryKey: orpc.coachplan.mine.key() });
	// The coach started on the plan or shared it: no more changes (INC-14).
	const onLocked = () => {
		void refresh();
		void queryClient.invalidateQueries({ queryKey: orpc.coachplan.getSubmission.key() });
	};
	useServerEvent("coachplan.locked", onLocked);
	useServerEvent("coachplan.shared", onLocked);
	const canEdit = () => latest()?.status === "submitted";

	const revise = async () => {
		setRevising(true);
		try {
			await client.coachplan.revise();
			await refresh();
		} catch (err) {
			toast({
				title: "Bijwerken lukte niet",
				description: friendlyError(err),
				tone: "danger",
			});
		} finally {
			setRevising(false);
		}
	};
	const pdf = async (id: string) => {
		setPdfBusy(true);
		try {
			await downloadPlanPdf(id);
		} catch {
			toast({ title: "PDF maken lukte niet", tone: "danger" });
		} finally {
			setPdfBusy(false);
		}
	};

	return (
		<Show
			when={state.data}
			fallback={
				<Show
					when={state.error}
					fallback={<p class="text-muted">Bezig met laden…</p>}
				>
					<ErrorState
						error={state.error}
						what="je plan"
						onRetry={() => state.refetch()}
					/>
				</Show>
			}
		>
			<Show when={phase() === "fill"}>
				<PlanWizard onSubmitted={refresh} />
			</Show>

			{/* Changing handed-in answers; stays open when the coach locks the plan
			    meanwhile, so unsaved input remains visible (AC8). */}
			<Show when={editing() && latest()}>
				{(l) => (
					<PlanWizard
						editId={l().id}
						locked={!canEdit()}
						onSubmitted={refresh}
						onDone={() => {
							setEditing(false);
							onLocked();
						}}
					/>
				)}
			</Show>

			<Show when={!editing() && phase() === "with_coach"}>
				<section class="mx-auto flex w-full max-w-3xl flex-col gap-6" data-page-title="Mijn plan">
					<Card class="border-primary bg-primary text-primary-fg">
						<h1 class="font-head text-h1">Je plan ligt bij je coach</h1>
						<p class="mt-2 text-body opacity-90">
							Je coach kijkt ernaar en vult het coachgedeelte in. Daarna deelt je
							coach het plan met je, en dan zie je het hier.
						</p>
					</Card>
					<Show
						when={canEdit()}
						fallback={
							<Card role="status" class="border-line bg-bg-2">
								<p class="text-body text-ink-2">{COACH_STARTED}</p>
							</Card>
						}
					>
						<Card role="status" class="flex flex-wrap items-center justify-between gap-3">
							<p class="flex-1 text-body text-ink-2">
								Je kunt je antwoorden nog aanpassen, tot je coach begint met
								invullen.
							</p>
							<Button onClick={() => setEditing(true)}>Antwoorden aanpassen</Button>
						</Card>
					</Show>
					<h2 class="font-head text-h2 text-ink">Wat je hebt ingeleverd</h2>
					<PlanView submissionId={latest()!.id} />
					<Show when={current()}>
						{(c) => (
							<details class="rounded-2 border border-line p-4">
								<summary class="cursor-pointer font-medium text-ink-2">
									Je huidige plan (versie {c().version}) bekijken
								</summary>
								<div class="mt-4">
									<PlanView submissionId={c().id} />
								</div>
							</details>
						)}
					</Show>
				</section>
			</Show>

			<Show when={!editing() && phase() === "shared" && current()}>
				{(c) => (
					<section class="mx-auto flex w-full max-w-3xl flex-col gap-6" data-page-title="Mijn plan">
						<div class="flex flex-wrap items-end justify-between gap-3">
							<div>
								<h1 class="font-head text-h1 text-ink">Mijn plan</h1>
								<p class="mt-1 text-body text-muted">
									Versie {c().version}. Je coach heeft dit plan aan je aangeboden;
									je kunt het alleen nog bekijken. Wil je iets veranderen, kies dan
									Plan bijwerken.
								</p>
							</div>
							<div class="flex gap-2">
								<Button variant="ghost" disabled={pdfBusy()} onClick={() => pdf(c().id)}>
									{pdfBusy() ? "Bezig…" : "Download als pdf"}
								</Button>
								<Button disabled={revising()} onClick={revise}>
									Plan bijwerken
								</Button>
							</div>
						</div>
						<PlanView submissionId={c().id} />
					</section>
				)}
			</Show>
		</Show>
	);
}

type Flags = { discussWithCoach: boolean; deliberatelySkipped: boolean };

/**
 * The fill wizard. With `editId` it edits a handed-in version (INC-14): it
 * opens on the overview, and once `locked` (the coach started or shared) or a
 * save is refused, nothing is saved any more but what was typed stays.
 */
function PlanWizard(props: {
	onSubmitted: () => void;
	editId?: string;
	locked?: boolean;
	onDone?: () => void;
}) {
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const [step, setStep] = createSignal(0);
	const [reviewing, setReviewing] = createSignal(Boolean(props.editId));
	const [refused, setRefused] = createSignal(false);
	const [unsaved, setUnsaved] = createSignal(false);
	const locked = () => Boolean(props.locked) || refused();
	const [submitted, setSubmitted] = createSignal(false);
	const [submissionId, setSubmissionId] = createSignal<string | null>(null);

	// Local answer cache, keyed by questionId.
	const [answers, setAnswers] = createStore<Record<string, AnswerValue>>({});
	const [flags, setFlags] = createStore<Record<string, Flags>>({});

	// Load (or resume) the leerling's draft on mount.
	const [bootError, setBootError] = createSignal<string | null>(null);
	const [questions, setQuestions] = createSignal<QuestionDTO[]>([]);
	const [templateName, setTemplateName] = createSignal("");

	// Only leerling-section questions go in the wizard.
	const leerlingQuestions = createMemo(() =>
		questions().filter((q) => q.section === "leerling"),
	);

	const boot = async () => {
		try {
			const res = props.editId
				? await client.coachplan.getSubmission({ id: props.editId })
				: await client.coachplan.startMine();
			setSubmissionId(res.submission.id);
			setTemplateName(res.template?.name ?? "");
			setQuestions(
				("questions" in res ? res.questions : res.template.questions) as unknown as QuestionDTO[],
			);
			for (const a of res.answers) {
				setAnswers(a.questionId, {
					value: a.value,
					valueJson: (a.valueJson as string[] | null) ?? null,
				});
				setFlags(a.questionId, {
					discussWithCoach: a.discussWithCoach,
					deliberatelySkipped: a.deliberatelySkipped,
				});
			}
		} catch (err) {
			setBootError(
				friendlyError(err, "Er is nog geen formulier aan jou gekoppeld."),
			);
		}
	};
	onMount(() => void boot());

	const total = () => leerlingQuestions().length;
	const current = () => leerlingQuestions()[step()];

	const flagFor = (id: string): Flags =>
		flags[id] ?? { discussWithCoach: false, deliberatelySkipped: false };

	// Ordered autosave (INC-1): per question one request at a time, newest
	// value last — a slow older save can never overwrite what was typed after.
	const saver = createAnswerSaver(
		async (questionId, patch) => {
			const sub = submissionId();
			if (!sub) return;
			const p = patch as Partial<AnswerValue & Flags>;
			await client.coachplan.saveAnswer({
				submissionId: sub,
				questionId,
				value: p.value,
				valueJson: p.valueJson ?? undefined,
				discussWithCoach: p.discussWithCoach,
				deliberatelySkipped: p.deliberatelySkipped,
			});
		},
		(error) => {
			// The coach started or shared meanwhile (AC8): this can't be saved.
			if ((error as { code?: string } | null)?.code === "CONFLICT") {
				setRefused(true);
				setUnsaved(true);
				return;
			}
			toast({
				title: "Opslaan lukte even niet",
				description: "We proberen het opnieuw. Je antwoord blijft staan.",
				tone: "danger",
			});
		},
	);
	const save = (
		questionId: string,
		patch: Partial<AnswerValue & Flags>,
		onSaved?: () => void,
	) => {
		if (locked()) {
			setUnsaved(true);
			return;
		}
		saver.save(questionId, patch, onSaved);
	};

	/** Wait until every answer is saved; tells the leerling when it can't. */
	const saveAll = async (): Promise<boolean> => {
		const ok = await saver.flush();
		if (!ok) {
			toast({
				title: "Nog niet alles is opgeslagen",
				description: "Controleer je internetverbinding en probeer het opnieuw.",
				tone: "danger",
			});
		}
		return ok;
	};

	// Closing the tab with unsaved typing: let the browser ask first.
	const beforeUnload = (e: BeforeUnloadEvent) => {
		if (saver.busy()) e.preventDefault();
	};
	window.addEventListener("beforeunload", beforeUnload);
	onCleanup(() => window.removeEventListener("beforeunload", beforeUnload));

	// Debounced "Opgeslagen"-bevestiging: bij typen worden de autosaves per
	// toetsaanslag samengevat tot één rustige toast in plaats van een stortvloed.
	let savedTimer: ReturnType<typeof setTimeout> | undefined;
	const flashSaved = () => {
		if (savedTimer) clearTimeout(savedTimer);
		savedTimer = setTimeout(
			() => toast({ title: "Opgeslagen", tone: "success", duration: 1500 }),
			700,
		);
	};
	onCleanup(() => {
		if (savedTimer) clearTimeout(savedTimer);
	});

	const onAnswer = (q: QuestionDTO, next: AnswerValue) => {
		setAnswers(q.id, next);
		// A real answer clears an accidental skip.
		if (flagFor(q.id).deliberatelySkipped) {
			setFlags(q.id, { ...flagFor(q.id), deliberatelySkipped: false });
			void save(q.id, { ...next, deliberatelySkipped: false }, flashSaved);
		} else {
			void save(q.id, next, flashSaved);
		}
	};

	const toggleDiscuss = (q: QuestionDTO, on: boolean) => {
		setFlags(q.id, { ...flagFor(q.id), discussWithCoach: on });
		void save(q.id, { discussWithCoach: on }, () =>
			toast({
				title: on ? "Gemarkeerd om te bespreken" : "Markering verwijderd",
				tone: on ? "success" : "neutral",
				duration: 2000,
			}),
		);
	};

	const next = () => {
		if (step() < total() - 1) setStep(step() + 1);
		else setReviewing(true);
	};
	const prev = () => setStep(Math.max(0, step() - 1));
	const skip = (q: QuestionDTO) => {
		// Set the whole entry: a question without a saved answer has none yet, and
		// a path-set on a missing entry throws before `next()` runs.
		setFlags(q.id, { ...flagFor(q.id), deliberatelySkipped: true });
		void save(q.id, { deliberatelySkipped: true }, () =>
			toast({ title: "Vraag overgeslagen", tone: "success", duration: 2000 }),
		);
		next();
	};

	const submit = async () => {
		const sub = submissionId();
		if (!sub) return;
		// Hand in only what is actually saved.
		if (!(await saveAll())) return;
		try {
			await client.coachplan.submit({ submissionId: sub });
			setSubmitted(true);
			queryClient.invalidateQueries({ queryKey: orpc.coachplan.listMine.key() });
			toast({ title: "Mooi gedaan! Verstuurd naar je coach", tone: "success" });
			props.onSubmitted();
		} catch (err) {
			toast({
				title: "Versturen lukte niet",
				description: friendlyError(err),
				tone: "danger",
			});
		}
	};

	const editFrom = (q: QuestionDTO) => {
		const idx = leerlingQuestions().findIndex((x) => x.id === q.id);
		if (idx >= 0) setStep(idx);
		setReviewing(false);
	};

	// ---- Renders ----

	return (
		<section class="mx-auto flex w-full max-w-3xl flex-col gap-6" data-page-title="Mijn plan">
			<Show when={bootError()}>
				<Card class="border-warning bg-warning-100/40">
					<h1 class="font-head text-h2 text-ink">Nog geen plan</h1>
					<p class="mt-2 text-body text-ink-2">{bootError()}</p>
					<p class="mt-1 text-small text-muted">
						Vraag je coach om een formulier aan je te koppelen.
					</p>
				</Card>
			</Show>

			<Show when={locked()}>
				<Card role="alert" class="border-warning bg-warning-100/40">
					<p class="text-body text-ink">{COACH_STARTED}</p>
					<Show when={unsaved()}>
						<p class="mt-2 text-small text-ink-2">
							Je laatste wijziging is niet opgeslagen. Je ziet hem hieronder nog,
							zodat je hem kunt kopiëren. Wat je eerder opsloeg, blijft bewaard.
						</p>
					</Show>
					<Button class="mt-3" variant="ghost" onClick={() => props.onDone?.()}>
						Terug naar mijn plan
					</Button>
				</Card>
			</Show>

			<Show when={submitted()}>
				<Card class="border-primary bg-primary text-primary-fg">
					<h1 class="font-head text-h1">Mooi gedaan! 🎉</h1>
					<p class="mt-2 text-body opacity-90">
						Je plan is verstuurd naar je coach. Jullie bespreken het in het
						volgende gesprek.
					</p>
				</Card>
			</Show>

			<Show when={!bootError() && !submitted() && total() > 0}>
				<Show when={!reviewing()} fallback={null}>
					{/* Wizard step */}
					<Show when={current()}>
						{(q) => (
							<>
								<div class="flex items-center justify-between gap-3">
									<div class="flex flex-wrap items-center gap-2">
										<Show when={q().options?.theme}>
											<Badge variant="primary">{q().options?.theme}</Badge>
										</Show>
										<Badge variant="neutral">
											Stap {step() + 1} van {total()}
										</Badge>
										{/* Bij terugkeren toont de stap zelf de eerdere keuze. */}
										<Show when={flagFor(q().id).deliberatelySkipped}>
											<Badge variant="warning">Overgeslagen</Badge>
										</Show>
										<Show when={flagFor(q().id).discussWithCoach}>
											<Badge variant="accent">Bespreken met coach</Badge>
										</Show>
									</div>
									<div class="flex items-center gap-3">
										<span class="hidden text-small text-muted sm:inline">
											{templateName()}
										</span>
										<Button
											variant="ghost"
											size="sm"
											onClick={async () => {
												if (locked()) props.onDone?.();
												else if (await saveAll()) {
													if (props.onDone) props.onDone();
													else navigate({ to: "/welkom" });
												}
											}}
										>
											Opslaan & afsluiten
										</Button>
									</div>
								</div>

								<div
									class="h-2 overflow-hidden rounded-pill bg-line-2"
									role="progressbar"
									aria-label="Voortgang vragenlijst"
									aria-valuenow={step() + 1}
									aria-valuemin={1}
									aria-valuemax={total()}
								>
									<div
										class="h-full rounded-pill bg-primary transition-[width] duration-fast"
										style={{ width: `${((step() + 1) / total()) * 100}%` }}
									/>
								</div>

								<div>
									<h1 class="text-balance font-head text-h1 text-ink">
										{q().label}
									</h1>
									<Show when={q().helpText}>
										<p class="mt-2 text-body text-muted">{q().helpText}</p>
									</Show>
								</div>

								<QuestionInput
									question={q()}
									value={answers[q().id] ?? {}}
									onChange={(next) => onAnswer(q(), next)}
								/>

								<div class="flex items-center gap-3 rounded-2 border border-dashed border-line bg-bg-2 px-4 py-3">
									<Switch
										checked={flagFor(q().id).discussWithCoach}
										onChange={(on) => toggleDiscuss(q(), on)}
										label="Dit wil ik graag bespreken met mijn coach"
										description="Je coach ziet een vlaggetje bij dit antwoord."
										class="flex-1"
									/>
								</div>

								<div class="flex flex-wrap items-center justify-between gap-2">
									<Button
										variant="ghost"
										disabled={step() === 0}
										onClick={prev}
									>
										← Terug
									</Button>
									<div class="flex flex-wrap gap-2">
										<Button variant="ghost" onClick={() => skip(q())}>
											Sla over
										</Button>
										<Button size="lg" onClick={next}>
											{step() === total() - 1
												? "Klaar — overzicht"
												: "Volgende →"}
										</Button>
									</div>
								</div>
							</>
						)}
					</Show>
				</Show>

				{/* Overview (#14) */}
				<Show when={reviewing()}>
					<Overview
						questions={leerlingQuestions()}
						answers={answers}
						flags={flags}
						onEdit={editFrom}
						onSubmit={submit}
						onBack={() => setReviewing(false)}
						editing={Boolean(props.editId)}
						locked={locked()}
						onDone={async () => {
							if (locked() || (await saveAll())) props.onDone?.();
						}}
					/>
				</Show>
			</Show>
		</section>
	);
}

function Overview(props: {
	questions: QuestionDTO[];
	answers: Record<string, AnswerValue>;
	flags: Record<string, Flags>;
	onEdit: (q: QuestionDTO) => void;
	onSubmit: () => void;
	onBack: () => void;
	/** Changing a handed-in plan: "Klaar" instead of "Verzenden". */
	editing?: boolean;
	locked?: boolean;
	onDone?: () => void;
}) {
	const themes = createMemo(() => {
		const order: string[] = [];
		for (const q of props.questions) {
			const t = q.options?.theme ?? "Vragen";
			if (!order.includes(t)) order.push(t);
		}
		return order;
	});

	return (
		<div class="flex flex-col gap-5">
			<div>
				<h1 class="font-head text-h1 text-ink">
					{props.editing ? "Je antwoorden aanpassen" : "Bekijk je antwoorden"}
				</h1>
				<p class="mt-1 text-body text-muted">
					{props.editing
						? "Wijzigingen worden meteen opgeslagen en je coach ziet ze direct. Dit kan tot je coach begint met invullen."
						: "Je kunt ze nog aanpassen voordat je verstuurt."}
				</p>
			</div>

			<For each={themes()}>
				{(theme) => (
					<Card>
						<h2 class="mb-3 font-head text-h3 text-ink">{theme}</h2>
						<div class="flex flex-col gap-3.5">
							<For
								each={props.questions.filter(
									(q) => (q.options?.theme ?? "Vragen") === theme,
								)}
							>
								{(q) => {
									const rendered = renderAnswerText(q, props.answers[q.id]);
									const f = props.flags[q.id];
									return (
										<div class="border-line-2 border-b pb-3.5 last:border-b-0">
											<div class="flex items-start justify-between gap-3">
												<p class="flex-1 font-medium text-ink-2">{q.label}</p>
												<Show when={!props.locked}>
													<Button
														size="sm"
														variant="ghost"
														onClick={() => props.onEdit(q)}
													>
														Wijzig
													</Button>
												</Show>
											</div>
											<div class="mt-2 text-body">
												<Show when={f?.deliberatelySkipped}>
													<Badge variant="warning">Overgeslagen</Badge>
												</Show>
												<Show
													when={!f?.deliberatelySkipped && rendered.kind === "chips"}
												>
													<div class="flex flex-wrap gap-1.5">
														<For each={rendered.chips}>
															{(c) => <Badge variant="primary">{c}</Badge>}
														</For>
													</div>
												</Show>
												<Show
													when={!f?.deliberatelySkipped && rendered.kind === "text"}
												>
													<p class="whitespace-pre-wrap text-ink">
														{rendered.text}
													</p>
												</Show>
												<Show
													when={!f?.deliberatelySkipped && rendered.kind === "empty"}
												>
													<span class="text-muted italic">Niet ingevuld</span>
												</Show>
											</div>
											<Show when={f?.discussWithCoach}>
												<div class="mt-2">
													<Badge variant="accent">Bespreken met coach</Badge>
												</div>
											</Show>
										</div>
									);
								}}
							</For>
						</div>
					</Card>
				)}
			</For>

			<Show when={props.editing}>
				<div class="flex justify-end">
					<Button size="lg" onClick={() => props.onDone?.()}>
						{props.locked ? "Terug naar mijn plan" : "Klaar met aanpassen"}
					</Button>
				</div>
			</Show>
			<Show when={!props.editing}>
				<Card class="flex items-center justify-between gap-4 border-primary bg-primary text-primary-fg">
					<div>
						<h3 class="font-head text-h3">Verzend naar je coach</h3>
						<p class="mt-1 text-small opacity-85">
							Je coach krijgt een bericht en jullie bespreken dit samen.
						</p>
					</div>
					<div class="flex shrink-0 gap-2">
						<Button variant="ghost" class="bg-white/15 text-white border-white/30" onClick={props.onBack}>
							Terug
						</Button>
						<Button class="bg-white text-primary-700 hover:bg-white/90" onClick={props.onSubmit}>
							Verzenden
						</Button>
					</div>
				</Card>
			</Show>
		</div>
	);
}
