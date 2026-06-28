import { createFileRoute } from "@tanstack/solid-router";
import { useQuery } from "@tanstack/solid-query";
import { createMemo, createSignal, For, Show } from "solid-js";
import { createStore } from "solid-js/store";
import {
	type QuestionDTO,
	renderAnswerText,
} from "../../../components/coachplan/question-input";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { Switch } from "../../../components/ui/switch";
import { Textarea } from "../../../components/ui/text-field";
import { toast } from "../../../components/ui/toast";
import { requireRole } from "../../../lib/auth/require-role";
import { useMe } from "../../../lib/auth/use-me";
import { client, orpc } from "../../../lib/orpc";

/**
 * Coach review of a submitted coachplan (#15–#21). Shows the leerling's answers
 * with their flags (#15, read-only), an answer→coach-question mapping editor
 * (#16), the coach vragenlijst (#17), leervoorkeur standaardlabels (#19), the
 * "afgestemd met ouders" toggle (#21), and a PDF download (#20). Gated to coach+.
 */
export const Route = createFileRoute("/_protected/plan/$submissionId")({
	beforeLoad: () => requireRole("coach"),
	component: CoachReview,
});

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

	const isCoach = () => me.hasAtLeast("coach");

	const questions = () =>
		(submissionQuery.data?.questions ?? []) as unknown as QuestionDTO[];
	const leerlingQ = createMemo(() =>
		questions().filter((q) => q.section === "leerling"),
	);
	const coachQ = createMemo(() => questions().filter((q) => q.section === "coach"));

	const answerFor = (questionId: string) =>
		submissionQuery.data?.answers.find((a) => a.questionId === questionId);

	// Local coach-answer + mapping edit buffers.
	const [coachAnswers, setCoachAnswers] = createStore<Record<string, string>>({});
	const [mappingEdits, setMappingEdits] = createStore<Record<string, string>>({});
	const [prefs, setPrefs] = createSignal<string[]>([]);
	const [prefsInit, setPrefsInit] = createSignal(false);

	// Seed local state once data arrives.
	const seed = () => {
		const data = submissionQuery.data;
		if (!data || prefsInit()) return;
		for (const a of data.answers) {
			if (a.value != null) setCoachAnswers(a.questionId, a.value);
		}
		setPrefs(data.learningPreferences);
		setPrefsInit(true);
	};

	const seedMappings = () => {
		const ms = mappingsQuery.data;
		if (!ms) return;
		for (const m of ms) {
			if (m.overrideValue != null && mappingEdits[m.coachQuestionId] === undefined) {
				setMappingEdits(m.coachQuestionId, m.overrideValue);
			}
		}
	};

	const refresh = () => {
		submissionQuery.refetch();
	};

	const saveCoachAnswer = async (questionId: string, value: string) => {
		try {
			await client.coachplan.saveCoachAnswer({
				submissionId: id(),
				questionId,
				value,
			});
		} catch {
			toast({ title: "Opslaan lukte niet", tone: "danger" });
		}
	};

	const saveMapping = async (coachQuestionId: string, overrideValue: string) => {
		try {
			await client.coachplan.upsertMapping({
				submissionId: id(),
				coachQuestionId,
				overrideValue,
			});
			toast({ title: "Mapping opgeslagen", tone: "success" });
			refresh();
		} catch {
			toast({ title: "Opslaan lukte niet", tone: "danger" });
		}
	};

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

	return (
		<section class="mx-auto flex w-full max-w-4xl flex-col gap-6">
			<Show when={!isCoach()}>
				<Card class="border-danger">
					<h1 class="font-head text-h2 text-ink">Geen toegang</h1>
					<p class="mt-2 text-body text-muted">
						Alleen een coach kan een coachplan beoordelen.
					</p>
				</Card>
			</Show>

			<Show when={submissionQuery.isLoading}>
				<p class="text-muted">Laden…</p>
			</Show>
			<Show when={submissionQuery.error}>
				<Card class="border-danger">
					<p class="text-danger">Kon dit coachplan niet laden.</p>
				</Card>
			</Show>

			<Show when={isCoach() && submissionQuery.data}>
				{(() => {
					seed();
					seedMappings();
					return null;
				})()}

				{/* Header / actions */}
				<div class="flex flex-wrap items-center justify-between gap-3">
					<div>
						<h1 class="font-head text-h1 text-ink">Coachplan</h1>
						<p class="mt-1 text-body text-muted">
							Status:{" "}
							<Badge variant="primary">
								{submissionQuery.data?.submission.status}
							</Badge>
						</p>
					</div>
					<div class="flex flex-wrap gap-2">
						<Button
							variant="ghost"
							onClick={downloadPdf}
							disabled={pdfBusy()}
						>
							{pdfBusy() ? "PDF maken…" : "PDF genereren"}
						</Button>
						<Button onClick={share}>Aanbieden aan leerling</Button>
					</div>
				</div>

				{/* Leervoorkeuren (#19) */}
				<Card>
					<h2 class="font-head text-h3 text-ink">Leervoorkeuren</h2>
					<p class="mt-1 text-small text-muted">
						Standaardlabels die ook de leeromgeving aansturen. Bevestig samen met
						de leerling.
					</p>
					<div class="mt-3 flex flex-wrap gap-2">
						<For each={labelsQuery.data}>
							{(opt) => (
								<button
									type="button"
									onClick={() => togglePref(opt.value)}
									aria-pressed={prefs().includes(opt.value)}
									data-on={prefs().includes(opt.value)}
									class="rounded-pill border-[1.5px] px-3.5 py-1.5 text-small font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-[on=true]:border-primary data-[on=true]:bg-primary data-[on=true]:text-primary-fg data-[on=false]:border-line data-[on=false]:text-ink-2"
								>
									{opt.label}
								</button>
							)}
						</For>
					</div>
				</Card>

				{/* Leerling answers (#15, read-only) */}
				<Card>
					<h2 class="font-head text-h3 text-ink">Antwoorden van de leerling</h2>
					<p class="mt-1 text-small text-muted">
						Alleen-lezen. Let op de vlaggetjes.
					</p>
					<div class="mt-4 flex flex-col gap-4">
						<For each={leerlingQ()}>
							{(q) => {
								const a = answerFor(q.id);
								const rendered = renderAnswerText(q, {
									value: a?.value ?? null,
									valueJson: (a?.valueJson as string[] | null) ?? null,
								});
								return (
									<div class="border-line-2 border-b pb-4 last:border-b-0">
										<div class="flex flex-wrap items-center gap-2">
											<p class="flex-1 font-medium text-ink-2">{q.label}</p>
											<Show when={a?.discussWithCoach}>
												<Badge variant="accent">Bespreken</Badge>
											</Show>
											<Show when={a?.deliberatelySkipped}>
												<Badge variant="warning">Overgeslagen</Badge>
											</Show>
										</div>
										<div class="mt-2">
											<Show when={rendered.kind === "chips"}>
												<div class="flex flex-wrap gap-1.5">
													<For each={rendered.chips}>
														{(c) => <Badge variant="primary">{c}</Badge>}
													</For>
												</div>
											</Show>
											<Show when={rendered.kind === "text"}>
												<p class="whitespace-pre-wrap text-ink">
													{rendered.text}
												</p>
											</Show>
											<Show when={rendered.kind === "empty"}>
												<span class="text-muted italic">Niet ingevuld</span>
											</Show>
										</div>
									</div>
								);
							}}
						</For>
					</div>
				</Card>

				{/* Coach vragenlijst + mapping (#16/#17) */}
				<Card>
					<h2 class="font-head text-h3 text-ink">Coach vragenlijst</h2>
					<p class="mt-1 text-small text-muted">
						Sommige antwoorden zijn gemapt vanuit de leerling — pas ze gerust aan.
					</p>
					<div class="mt-4 flex flex-col gap-5">
						<For each={coachQ()}>
							{(q) => (
								<div class="flex flex-col gap-2 border-line-2 border-b pb-5 last:border-b-0">
									<div class="flex items-center gap-2">
										<p class="flex-1 font-medium text-ink-2">{q.label}</p>
										<Show when={mappingsQuery.data?.some((m) => m.coachQuestionId === q.id)}>
											<Badge variant="success">Gemapt</Badge>
										</Show>
									</div>
									<Textarea
										aria-label={q.label}
										rows={3}
										placeholder="Schrijf je observatie…"
										value={coachAnswers[q.id] ?? ""}
										onInput={(e) =>
											setCoachAnswers(q.id, e.currentTarget.value)
										}
									/>
									<div class="flex gap-2">
										<Button
											size="sm"
											variant="ghost"
											onClick={() =>
												saveCoachAnswer(q.id, coachAnswers[q.id] ?? "")
											}
										>
											Antwoord opslaan
										</Button>
										<Button
											size="sm"
											variant="subtle"
											onClick={() =>
												saveMapping(q.id, coachAnswers[q.id] ?? "")
											}
										>
											Mappen als coach-overzicht
										</Button>
									</div>
								</div>
							)}
						</For>
					</div>
				</Card>

				{/* Afgestemd met ouders (#21) */}
				<Card class="flex items-center justify-between gap-4">
					<div>
						<h3 class="font-head text-h3 text-ink">Afgestemd met ouders</h3>
						<p class="mt-1 text-small text-muted">
							Zet aan zodra je dit plan met de ouders hebt besproken.
						</p>
					</div>
					<Switch
						checked={submissionQuery.data?.submission.approvedWithParents ?? false}
						onChange={(on) => toggleParents(on)}
						aria-label="Afgestemd met ouders"
					/>
				</Card>
			</Show>
		</section>
	);
}
