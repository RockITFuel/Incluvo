import { useMutation, useQuery } from "@tanstack/solid-query";
import { Check, Mic, Square, Trash2, Upload, Video } from "lucide-solid";
import { createSignal, Index, Show } from "solid-js";
import { useRecorder } from "../../lib/ai/use-recorder";
import { client, orpc } from "../../lib/orpc";
import { Select } from "../ui/select";
import { toast } from "../ui/toast";
import { MockBanner } from "./mock-banner";

/**
 * Transcriptietool (#18), styled as the sidebar card from the approved
 * "Coachplan invullen" prototype. The coach records or uploads the gesprek (or,
 * in the mock/offline demo, pastes a text stand-in) and the AI returns a
 * transcript plus voorgestelde conceptantwoorden per coach-vraag — editable
 * before accepting.
 *
 * Embedded in the coach-review of a coachplan by passing `submissionId` (the
 * plan is then fixed and the picker is hidden); standalone it lets the coach
 * pick a plan from their review inbox. "Overnemen" writes onto the coach
 * vragenlijst via `coachplan.saveCoachAnswer` (#17); the source audio can be
 * deleted after transcription (privacy §4.3).
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

export function TranscriptionPanel(props: { submissionId?: string }) {
	const providerQuery = useQuery(() => orpc.ai.provider.queryOptions());
	// Only needed for the standalone picker; harmless (and cached) when embedded.
	const inboxQuery = useQuery(() => orpc.coachplan.inbox.queryOptions());

	const [pickedId, setPickedId] = createSignal<string | undefined>();
	const [textStandIn, setTextStandIn] = createSignal("");
	const [transcript, setTranscript] = createSignal<string | null>(null);
	const [transcriptionId, setTranscriptionId] = createSignal<string | null>(null);
	const [proposals, setProposals] = createSignal<Proposal[]>([]);
	const [audioCleared, setAudioCleared] = createSignal(false);
	const [uploadBase64, setUploadBase64] = createSignal<string | null>(null);
	const [uploadName, setUploadName] = createSignal<string | null>(null);

	const recorder = useRecorder();

	// The effective plan: the embedding page's submission, else the picked one.
	const effectiveId = () => props.submissionId ?? pickedId();
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
		const id = effectiveId();
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

	// Per-proposal "Overnemen" state (#18 → #17).
	const [savingId, setSavingId] = createSignal<string | null>(null);
	const [acceptedIds, setAcceptedIds] = createSignal<Set<string>>(new Set());

	const acceptProposal = async (p: Proposal) => {
		const id = effectiveId();
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
		<div
			class="card"
			style={{
				"border-color": transcribe.isPending
					? "rgb(var(--accent))"
					: "rgb(var(--line))",
			}}
		>
			<div class="card-head">
				<h3 style={{ "font-size": "15px" }}>Transcriptietool</h3>
				<span class="chip">Beta</span>
			</div>
			<div
				style={{
					"font-size": "13px",
					color: "rgb(var(--muted))",
					"margin-bottom": "12px",
				}}
			>
				Neem het gesprek op. AI vult de juiste velden in (Incluvo-vragenlijst).
			</div>

			<MockBanner mock={providerQuery.data?.mock} model={providerQuery.data?.model} />

			{/* Plan picker only when standalone (no submission from the page). */}
			<Show when={!props.submissionId}>
				<div style={{ "margin-bottom": "12px", "margin-top": "12px" }}>
					<Select
						label="Coachplan"
						placeholder="Kies een leerling / coachplan…"
						options={submissionOptions()}
						value={pickedId()}
						onChange={(v) => setPickedId(v)}
					/>
				</div>
			</Show>

			{/* Capture controls */}
			<div class="ds-col" style={{ gap: "8px", "margin-top": "12px" }}>
				<Show
					when={recorder.supported()}
					fallback={
						<span style={{ "font-size": "12px", color: "rgb(var(--muted))" }}>
							Opnemen niet beschikbaar — importeer of plak een transcript.
						</span>
					}
				>
					<Show
						when={!recorder.recording()}
						fallback={
							<button
								type="button"
								class="btn accent"
								onClick={() => recorder.stop()}
							>
								<Square class="size-3.5" aria-hidden="true" /> Stop opname
							</button>
						}
					>
						<button
							type="button"
							class="btn primary"
							onClick={() => recorder.start()}
						>
							<Mic class="size-3.5" aria-hidden="true" /> Start opname
						</button>
					</Show>
				</Show>

				<input
					type="file"
					accept="audio/*"
					class="sr-only"
					id="audio-upload"
					onChange={onUpload}
				/>
				{/* "Importeer Teams/Zoom" = pick a recording file to transcribe. */}
				<button
					type="button"
					class="btn ghost"
					onClick={() => document.getElementById("audio-upload")?.click()}
				>
					<Video class="size-3.5" aria-hidden="true" /> Importeer Teams/Zoom
				</button>

				<Show when={recorder.audioUrl()}>
					<audio controls src={recorder.audioUrl() ?? undefined} class="h-9 w-full">
						<track kind="captions" />
					</audio>
				</Show>
				<Show when={uploadName()}>
					<span
						class="ds-row"
						style={{ "font-size": "12px", color: "rgb(var(--muted))", gap: "6px" }}
					>
						<Upload class="size-3.5" aria-hidden="true" /> {uploadName()}
					</span>
				</Show>
				<Show when={recorder.error()}>
					<p role="alert" style={{ color: "rgb(var(--danger))", "font-size": "12px" }}>
						{recorder.error()}
					</p>
				</Show>
			</div>

			{/* Text stand-in (handy for the demo / offline mock) */}
			<div style={{ "margin-top": "12px" }}>
				<label
					class="lab"
					style={{
						display: "block",
						"font-size": "12px",
						"font-weight": "500",
						color: "rgb(var(--ink-2))",
						"margin-bottom": "6px",
					}}
					for="transcript-standin"
				>
					Of plak een transcript
				</label>
				<textarea
					id="transcript-standin"
					class="textarea"
					style={{ "min-height": "70px", "font-size": "13px" }}
					placeholder="Plak hier de tekst van het gesprek…"
					value={textStandIn()}
					onInput={(e) => setTextStandIn(e.currentTarget.value)}
				/>
			</div>

			<div style={{ "margin-top": "12px" }}>
				<button
					type="button"
					class="btn primary sm"
					onClick={run}
					disabled={transcribe.isPending}
					style={{ width: "100%", "justify-content": "center" }}
				>
					{transcribe.isPending
						? "Bezig met transcriberen…"
						: "Transcribeer & stel antwoorden voor"}
				</button>
			</div>

			{/* Transcript quote block */}
			<Show when={transcript()}>
				<div
					class="ds-row ds-between"
					style={{ "margin-top": "14px", "margin-bottom": "6px", gap: "8px" }}
				>
					<div style={{ "font-size": "13px", "font-weight": "600" }}>Transcript</div>
					<Show when={transcriptionId() && hasAudio() && !audioCleared()}>
						<button type="button" class="btn ghost sm" onClick={deleteAudio}>
							<Trash2 class="size-3.5" aria-hidden="true" /> Verwijder audio
						</button>
					</Show>
					<Show when={audioCleared()}>
						<span style={{ "font-size": "11px", color: "rgb(var(--success))" }}>
							Audio verwijderd ✓
						</span>
					</Show>
				</div>
				<div
					style={{
						padding: "10px 12px",
						background: "rgb(var(--bg-2))",
						"border-radius": "10px",
						"font-size": "13px",
						"font-style": "italic",
						"border-left": "3px solid rgb(var(--accent))",
						"white-space": "pre-wrap",
					}}
				>
					"{transcript()}"
				</div>
			</Show>

			{/* Proposed answers */}
			<Show when={proposals().length > 0}>
				<div style={{ "margin-top": "14px" }}>
					<div
						style={{
							"font-size": "13px",
							"font-weight": "600",
							"margin-bottom": "4px",
						}}
					>
						Voorgestelde antwoorden
					</div>
					<p
						style={{
							"font-size": "12px",
							color: "rgb(var(--muted))",
							"margin-bottom": "10px",
						}}
					>
						Concept op basis van het gesprek. Controleer voordat je ze overneemt.
					</p>
					<ul class="ds-col" style={{ gap: "12px" }}>
						<Index each={proposals()}>
							{(p) => (
								<li>
									<label
										class="lab"
										style={{
											display: "block",
											"font-size": "12px",
											"font-weight": "500",
											color: "rgb(var(--ink-2))",
											"margin-bottom": "4px",
										}}
										for={`proposal-${p().questionId}`}
									>
										{p().label}
									</label>
									<Show when={p().helpText}>
										<p
											style={{
												"font-size": "11px",
												color: "rgb(var(--muted))",
												"margin-bottom": "4px",
											}}
										>
											{p().helpText}
										</p>
									</Show>
									<textarea
										id={`proposal-${p().questionId}`}
										class="textarea"
										style={{ "min-height": "56px", "font-size": "13px" }}
										value={p().value}
										onInput={(e) =>
											updateProposal(p().questionId, e.currentTarget.value)
										}
									/>
									<div
										class="ds-row"
										style={{ gap: "8px", "margin-top": "6px" }}
									>
										<button
											type="button"
											class="btn ghost sm"
											onClick={() => acceptProposal(p())}
											disabled={savingId() === p().questionId}
										>
											<Check class="size-3.5" aria-hidden="true" />
											{savingId() === p().questionId
												? "Bezig…"
												: acceptedIds().has(p().questionId)
													? "Opnieuw overnemen"
													: "Overnemen"}
										</button>
										<Show when={acceptedIds().has(p().questionId)}>
											<span
												style={{ "font-size": "11px", color: "rgb(var(--success))" }}
											>
												Overgenomen ✓
											</span>
										</Show>
									</div>
								</li>
							)}
						</Index>
					</ul>
				</div>
			</Show>
		</div>
	);
}
