import { useMutation, useQuery } from "@tanstack/solid-query";
import { Check, Mic, Square, Trash2, Upload } from "lucide-solid";
import { createSignal, For, Show } from "solid-js";
import { useRecorder } from "../../lib/ai/use-recorder";
import { client, orpc } from "../../lib/orpc";
import { Button } from "../ui/button";
import { Select } from "../ui/select";
import { toast } from "../ui/toast";
import { MockBanner } from "./mock-banner";

/**
 * Transcriptie-demo (#18). The coach picks a coachplan (from their review
 * inbox), records or uploads the gesprek (or, in the mock/offline demo, pastes a
 * text stand-in), and the AI returns a transcript plus voorgestelde
 * conceptantwoorden per coach-vraag — which the coach can edit before accepting.
 *
 * Standalone for now: the orchestrator wires "Overnemen" into the coach-review
 * mapping (#16/#17). The source audio can be deleted after transcription
 * (privacy §4.3).
 */

interface Proposal {
	questionId: string;
	label: string;
	helpText: string | null;
	value: string;
}

/** Encode an ArrayBuffer to base64 in chunks (safe for large audio files). */
function toBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(binary);
}

export function TranscriptionPanel() {
	const providerQuery = useQuery(() => orpc.ai.provider.queryOptions());
	const inboxQuery = useQuery(() => orpc.coachplan.inbox.queryOptions());

	const [submissionId, setSubmissionId] = createSignal<string | undefined>();
	const [textStandIn, setTextStandIn] = createSignal("");
	const [transcript, setTranscript] = createSignal<string | null>(null);
	const [transcriptionId, setTranscriptionId] = createSignal<string | null>(null);
	const [proposals, setProposals] = createSignal<Proposal[]>([]);
	const [audioCleared, setAudioCleared] = createSignal(false);
	const [uploadBase64, setUploadBase64] = createSignal<string | null>(null);
	const [uploadName, setUploadName] = createSignal<string | null>(null);

	const recorder = useRecorder();

	const hasAudio = () => Boolean(recorder.audioBase64() || uploadBase64());

	const submissionOptions = () =>
		(inboxQuery.data ?? []).map((row) => ({
			value: row.submission.id,
			label: `${row.leerlingName} · ${row.templateName}`,
		}));

	const transcribe = useMutation(() =>
		orpc.ai.transcribe.mutationOptions({
			onSuccess: (res) => {
				setTranscript(res.transcript);
				setTranscriptionId(res.transcriptionId);
				setProposals(res.proposals);
				setAudioCleared(false);
				toast({ title: "Transcriptie klaar", tone: "success" });
			},
			onError: (err) =>
				toast({
					title: err instanceof Error ? err.message : "Transcriptie mislukt",
					tone: "danger",
				}),
		}),
	);

	const run = () => {
		const id = submissionId();
		if (!id) {
			toast({ title: "Kies eerst een coachplan", tone: "warning" });
			return;
		}
		transcribe.mutate({
			submissionId: id,
			audioBase64: recorder.audioBase64() ?? uploadBase64() ?? undefined,
			audioFilename: uploadName() ?? "coachgesprek.webm",
			textStandIn: textStandIn().trim() || undefined,
		});
	};

	const deleteAudio = async () => {
		const id = transcriptionId();
		if (!id) return;
		try {
			await client.ai.deleteAudio({ transcriptionId: id });
			setAudioCleared(true);
			recorder.reset();
			setUploadBase64(null);
			setUploadName(null);
			toast({ title: "Audio verwijderd, transcript bewaard", tone: "success" });
		} catch {
			toast({ title: "Kon audio niet verwijderen", tone: "danger" });
		}
	};

	const onUpload = async (e: Event & { currentTarget: HTMLInputElement }) => {
		const file = e.currentTarget.files?.[0];
		if (!file) return;
		recorder.reset();
		setUploadBase64(toBase64(await file.arrayBuffer()));
		setUploadName(file.name);
	};

	const updateProposal = (questionId: string, value: string) => {
		setProposals((prev) =>
			prev.map((p) => (p.questionId === questionId ? { ...p, value } : p)),
		);
	};

	// Per-proposal "Overnemen" state (#18 → #17): which question is currently
	// saving, and which have already been accepted into the coach-vragenlijst.
	const [savingId, setSavingId] = createSignal<string | null>(null);
	const [acceptedIds, setAcceptedIds] = createSignal<Set<string>>(new Set());

	/**
	 * Persist one proposed answer onto its coach question via the existing
	 * coachplan procedure (#17 `saveCoachAnswer`). The proposal's `questionId`
	 * is the coach-section formQuestion it was generated for.
	 */
	const acceptProposal = async (p: Proposal) => {
		const id = submissionId();
		if (!id) {
			toast({ title: "Kies eerst een coachplan", tone: "warning" });
			return;
		}
		setSavingId(p.questionId);
		try {
			await client.coachplan.saveCoachAnswer({
				submissionId: id,
				questionId: p.questionId,
				value: p.value,
			});
			setAcceptedIds((prev) => new Set(prev).add(p.questionId));
			toast({ title: `"${p.label}" overgenomen`, tone: "success" });
		} catch (err) {
			toast({
				title: err instanceof Error ? err.message : "Overnemen mislukt",
				tone: "danger",
			});
		} finally {
			setSavingId(null);
		}
	};

	return (
		<div class="flex flex-col gap-5">
			<MockBanner mock={providerQuery.data?.mock} model={providerQuery.data?.model} />

			{/* Step 1 — choose plan + capture */}
			<section class="rounded-3 border border-line bg-surface p-5">
				<h2 class="mb-1 font-head text-h3 text-ink">1. Gesprek opnemen</h2>
				<p class="mb-4 text-small text-muted">
					Kies het coachplan en neem het gesprek op, upload een audiobestand, of
					plak een transcript. Zo kun je je volledige aandacht bij het gesprek
					houden.
				</p>

				<div class="flex flex-col gap-4">
					<Select
						label="Coachplan"
						placeholder="Kies een leerling / coachplan…"
						options={submissionOptions()}
						value={submissionId()}
						onChange={(v) => setSubmissionId(v)}
					/>

					<div class="flex flex-wrap items-center gap-2">
						<Show
							when={recorder.supported()}
							fallback={
								<span class="text-micro text-muted">
									Opnemen niet beschikbaar — upload of plak een transcript.
								</span>
							}
						>
							<Show
								when={!recorder.recording()}
								fallback={
									<Button variant="danger" onClick={() => recorder.stop()}>
										<Square class="size-4" aria-hidden="true" /> Stop opname
									</Button>
								}
							>
								<Button variant="ghost" onClick={() => recorder.start()}>
									<Mic class="size-4" aria-hidden="true" /> Neem op
								</Button>
							</Show>
						</Show>

						<input
							type="file"
							accept="audio/*"
							class="sr-only"
							id="audio-upload"
							onChange={onUpload}
						/>
						<Button
							variant="ghost"
							onClick={() => document.getElementById("audio-upload")?.click()}
						>
							<Upload class="size-4" aria-hidden="true" /> Upload audio
						</Button>

						<Show when={recorder.audioUrl()}>
							<audio controls src={recorder.audioUrl() ?? undefined} class="h-9">
								<track kind="captions" />
							</audio>
						</Show>
						<Show when={uploadName()}>
							<span class="text-micro text-muted">{uploadName()}</span>
						</Show>
					</div>

					<Show when={recorder.error()}>
						<p role="alert" class="text-danger text-small">
							{recorder.error()}
						</p>
					</Show>

					<div>
						<label
							class="mb-1 block text-small font-medium text-ink-2"
							for="transcript-standin"
						>
							Of plak een transcript (handig voor de demo)
						</label>
						<textarea
							id="transcript-standin"
							rows={3}
							class="w-full resize-y rounded-2 border border-line bg-surface px-ctl-x py-ctl-y text-body text-ink placeholder:text-muted-2 focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
							placeholder="Plak hier de tekst van het gesprek…"
							value={textStandIn()}
							onInput={(e) => setTextStandIn(e.currentTarget.value)}
						/>
					</div>

					<div>
						<Button onClick={run} disabled={transcribe.isPending}>
							{transcribe.isPending
								? "Bezig met transcriberen…"
								: "Transcribeer & stel antwoorden voor"}
						</Button>
					</div>
				</div>
			</section>

			{/* Step 2 — transcript */}
			<Show when={transcript()}>
				<section class="rounded-3 border border-line bg-surface p-5">
					<div class="mb-3 flex items-center justify-between gap-3">
						<h2 class="font-head text-h3 text-ink">2. Transcript</h2>
						<Show when={transcriptionId() && hasAudio() && !audioCleared()}>
							<Button variant="ghost" size="sm" onClick={deleteAudio}>
								<Trash2 class="size-4" aria-hidden="true" /> Verwijder audio
							</Button>
						</Show>
						<Show when={audioCleared()}>
							<span class="text-micro text-success">Audio verwijderd ✓</span>
						</Show>
					</div>
					<p class="whitespace-pre-wrap rounded-2 bg-bg p-4 text-body text-ink-2 leading-relaxed">
						{transcript()}
					</p>
				</section>
			</Show>

			{/* Step 3 — proposed answers */}
			<Show when={proposals().length > 0}>
				<section class="rounded-3 border border-line bg-surface p-5">
					<h2 class="mb-1 font-head text-h3 text-ink">3. Voorgestelde antwoorden</h2>
					<p class="mb-4 text-small text-muted">
						Concept op basis van het gesprek. Controleer en pas aan voordat je ze
						overneemt in de coach-vragenlijst.
					</p>
					<ul class="flex flex-col gap-4">
						<For each={proposals()}>
							{(p) => (
								<li>
									<label
										class="mb-1 block text-small font-medium text-ink-2"
										for={`proposal-${p.questionId}`}
									>
										{p.label}
									</label>
									<Show when={p.helpText}>
										<p class="mb-1 text-micro text-muted">{p.helpText}</p>
									</Show>
									<textarea
										id={`proposal-${p.questionId}`}
										rows={2}
										class="w-full resize-y rounded-2 border border-line bg-surface px-ctl-x py-ctl-y text-body text-ink focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
										value={p.value}
										onInput={(e) => updateProposal(p.questionId, e.currentTarget.value)}
									/>
									<div class="mt-1 flex items-center gap-2">
										<Button
											variant="ghost"
											size="sm"
											onClick={() => acceptProposal(p)}
											disabled={savingId() === p.questionId}
										>
											<Check class="size-4" aria-hidden="true" />
											{savingId() === p.questionId
												? "Bezig…"
												: acceptedIds().has(p.questionId)
													? "Opnieuw overnemen"
													: "Overnemen"}
										</Button>
										<Show when={acceptedIds().has(p.questionId)}>
											<span class="text-micro text-success">Overgenomen ✓</span>
										</Show>
									</div>
								</li>
							)}
						</For>
					</ul>
					<p class="mt-4 text-micro text-muted">
						Overgenomen antwoorden verschijnen in de coach-vragenlijst van dit
						coachplan (#16/#17).
					</p>
				</section>
			</Show>
		</div>
	);
}
