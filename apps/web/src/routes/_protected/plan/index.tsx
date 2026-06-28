import { createFileRoute, Link } from "@tanstack/solid-router";
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import { createStore } from "solid-js/store";
import {
	type AnswerValue,
	QuestionInput,
	type QuestionDTO,
	renderAnswerText,
} from "../../../components/coachplan/question-input";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { Switch } from "../../../components/ui/switch";
import { toast } from "../../../components/ui/toast";
import { useMe } from "../../../lib/auth/use-me";
import { client, orpc } from "../../../lib/orpc";

/**
 * `/plan` entry point. Role-aware: a coach sees the inbox of submitted plans
 * (#15) to open for review; a leerling gets the fill wizard (#11–#14).
 */
export const Route = createFileRoute("/_protected/plan/")({
	component: PlanEntry,
});

function PlanEntry() {
	const me = useMe();
	return (
		<Show when={me.hasAtLeast("coach")} fallback={<PlanWizard />}>
			<CoachInbox />
		</Show>
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
										<Badge variant="primary">{row.submission.status}</Badge>
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

type Flags = { discussWithCoach: boolean; deliberatelySkipped: boolean };

function PlanWizard() {
	const queryClient = useQueryClient();
	const [step, setStep] = createSignal(0);
	const [reviewing, setReviewing] = createSignal(false);
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
			const res = await client.coachplan.startMine();
			setSubmissionId(res.submission.id);
			setTemplateName(res.template.name);
			setQuestions(res.template.questions as unknown as QuestionDTO[]);
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
				(err as { message?: string }).message ??
					"Er is nog geen formulier aan jou gekoppeld.",
			);
		}
	};
	onMount(() => void boot());

	const total = () => leerlingQuestions().length;
	const current = () => leerlingQuestions()[step()];

	const flagFor = (id: string): Flags =>
		flags[id] ?? { discussWithCoach: false, deliberatelySkipped: false };

	const save = async (
		questionId: string,
		patch: Partial<AnswerValue & Flags>,
	) => {
		const sub = submissionId();
		if (!sub) return;
		try {
			await client.coachplan.saveAnswer({
				submissionId: sub,
				questionId,
				value: patch.value,
				valueJson: patch.valueJson ?? undefined,
				discussWithCoach: patch.discussWithCoach,
				deliberatelySkipped: patch.deliberatelySkipped,
			});
		} catch {
			toast({ title: "Opslaan lukte even niet", tone: "danger" });
		}
	};

	const onAnswer = (q: QuestionDTO, next: AnswerValue) => {
		setAnswers(q.id, next);
		// A real answer clears an accidental skip.
		if (flagFor(q.id).deliberatelySkipped) {
			setFlags(q.id, "deliberatelySkipped", false);
			void save(q.id, { ...next, deliberatelySkipped: false });
		} else {
			void save(q.id, next);
		}
	};

	const toggleDiscuss = (q: QuestionDTO, on: boolean) => {
		setFlags(q.id, "discussWithCoach", on);
		void save(q.id, { discussWithCoach: on });
	};

	const next = () => {
		if (step() < total() - 1) setStep(step() + 1);
		else setReviewing(true);
	};
	const prev = () => setStep(Math.max(0, step() - 1));
	const skip = (q: QuestionDTO) => {
		setFlags(q.id, "deliberatelySkipped", true);
		void save(q.id, { deliberatelySkipped: true });
		next();
	};

	const submit = async () => {
		const sub = submissionId();
		if (!sub) return;
		try {
			await client.coachplan.submit({ submissionId: sub });
			setSubmitted(true);
			queryClient.invalidateQueries({ queryKey: orpc.coachplan.listMine.key() });
			toast({ title: "Verstuurd naar je coach", tone: "success" });
		} catch (err) {
			toast({
				title: "Versturen lukte niet",
				description: (err as { message?: string }).message,
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
		<section class="mx-auto flex w-full max-w-3xl flex-col gap-6">
			<Show when={bootError()}>
				<Card class="border-warning bg-warning-100/40">
					<h1 class="font-head text-h2 text-ink">Nog geen plan</h1>
					<p class="mt-2 text-body text-ink-2">{bootError()}</p>
					<p class="mt-1 text-small text-muted">
						Vraag je coach om een formulier aan je te koppelen.
					</p>
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
									</div>
									<span class="text-small text-muted">{templateName()}</span>
								</div>

								<div
									class="h-2 overflow-hidden rounded-pill bg-line-2"
									role="progressbar"
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

								<div class="flex items-center justify-between gap-2">
									<Button
										variant="ghost"
										disabled={step() === 0}
										onClick={prev}
									>
										← Terug
									</Button>
									<div class="flex gap-2">
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
				<h1 class="font-head text-h1 text-ink">Bekijk je antwoorden</h1>
				<p class="mt-1 text-body text-muted">
					Je kunt ze nog aanpassen voordat je verstuurt.
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
												<Button
													size="sm"
													variant="ghost"
													onClick={() => props.onEdit(q)}
												>
													Wijzig
												</Button>
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
		</div>
	);
}
