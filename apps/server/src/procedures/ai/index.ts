import {
	formAnswer,
	formQuestion,
	formSubmission,
	learningPreferenceLabel,
	transcription,
	user,
} from "@incluvo/drizzle/schema";
import { atLeast, can, policies } from "@incluvo/permissions";
import { ORPCError } from "@orpc/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { isMockProvider } from "../../ai/config";
import { adviceSystemPrompt } from "../../ai/prompts";
import { getAiProvider } from "../../ai/provider";
import { formatKennisContext, retrieveKennisHits } from "../../ai/retrieval";
import { assertValidStorageKey, deleteObject } from "../../courses/storage";
import { rateLimit } from "../../rate-limit";
import { requireLeerlingAccess } from "../../access";
import { type AuthedContext, base, protectedProcedure } from "../base";

/**
 * AI-laag domain (Epic 7): #1 vertaling, #18 transcriptie → conceptantwoorden,
 * #22 streaming interventie-advies. Register key: `ai`.
 *
 * Architecture (docs/decisions/tooling.md): all AI runs **server-side** here and
 * streams to Solid via the **oRPC Event Iterator** (a handler that returns an
 * async generator). The provider is an EU-resident, OpenAI-compatible endpoint
 * (Azure OpenAI Data Zone EUR / Mistral EU); when no credentials are set we use
 * a deterministic MOCK provider so everything is demoable offline
 * (`apps/server/src/ai`).
 *
 * Access control:
 *   - `translate` (#1) is open to any authenticated user (leerlingen/ouders are
 *     an explicit use case in the backlog).
 *   - `transcribe` (#18) and `assistant` (#22) are **coach-only** (coach+),
 *     enforced via the `requireCoach` middleware below. A leerling calling them
 *     is FORBIDDEN.
 *
 * pgvector RAG over kennisdocumenten for #22 is a follow-up (no embeddings table
 * yet — see ORCHESTRATOR TODO); for now the coachplan context is injected
 * directly into the prompt.
 */

// ---------------------------------------------------------------------------
// Coach-only gate (#18/#22 are in het coachgedeelte)
// ---------------------------------------------------------------------------

const MAX_AUDIO_BASE64_CHARS = 34_000_000; // ≈ 25 MB audio (Groq Whisper limit) in base64 (×4/3)

const requireCoach = base
	.$context<AuthedContext>()
	.middleware(async ({ context, next }) => {
		if (!atLeast(context.actor.role, "coach")) {
			throw new ORPCError("FORBIDDEN", {
				message: "Alleen een coach/docent kan AI-ondersteuning gebruiken",
			});
		}
		return next({ context });
	});

const coachProcedure = protectedProcedure.use(requireCoach);

/** Shared mock indicator so the UI can mark the active provider. */
const providerInfo = protectedProcedure
	.route({ method: "GET", path: "/ai/provider", tags: ["ai"] })
	.output(z.object({ mock: z.boolean(), model: z.string() }))
	.handler(async () => {
		const provider = getAiProvider();
		return { mock: provider.mock, model: provider.model };
	});

// ---------------------------------------------------------------------------
// #1 — Translate
// ---------------------------------------------------------------------------

const SUPPORTED_LANGUAGES = ["nl", "en", "ar", "uk", "tr", "pl", "de", "fr"] as const;

const translate = protectedProcedure
	.route({ method: "POST", path: "/ai/translate", tags: ["ai"] })
	.input(
		z.object({
			text: z.string().min(1).max(20_000),
			targetLanguage: z.enum(SUPPORTED_LANGUAGES),
		}),
	)
	.output(
		z.object({
			translated: z.string(),
			targetLanguage: z.string(),
			mock: z.boolean(),
		}),
	)
	.handler(async ({ input, context, signal }) => {
		// Throttle the abusable translation endpoint per user (H3).
		if (!rateLimit(`ai:translate:${context.actor.userId}`, { max: 30, windowMs: 60_000 })) {
			throw new ORPCError("TOO_MANY_REQUESTS", {
				message: "Te veel vertaalverzoeken. Wacht even en probeer opnieuw.",
			});
		}
		const provider = getAiProvider();
		const translated = await provider.translate(
			input.text,
			input.targetLanguage,
			signal,
		);
		return { translated, targetLanguage: input.targetLanguage, mock: provider.mock };
	});

// ---------------------------------------------------------------------------
// #18 — Transcribe → conceptantwoorden, persisted to `transcription`
// ---------------------------------------------------------------------------

/** Load a submission and assert the coach may review it (tenant + role). */
async function loadReviewableSubmission(
	context: AuthedContext,
	submissionId: string,
) {
	const [sub] = await context.db
		.select()
		.from(formSubmission)
		.where(eq(formSubmission.id, submissionId));
	if (!sub) throw new ORPCError("NOT_FOUND");
	if (!can(context.actor, policies.reviewCoachplan, sub)) {
		throw new ORPCError("FORBIDDEN");
	}
	await assertAssignedToLeerling(context, sub.leerlingId);
	return sub;
}

/** Only actors who may see this leerling's data (`requireLeerlingAccess`). */
async function assertAssignedToLeerling(context: AuthedContext, leerlingId: string): Promise<void> {
	await requireLeerlingAccess(context, leerlingId);
}

const ProposedAnswerSchema = z.object({
	questionId: z.string(),
	label: z.string(),
	helpText: z.string().nullable(),
	value: z.string(),
});

const transcribe = coachProcedure
	.route({ method: "POST", path: "/ai/transcribe", tags: ["ai"] })
	.input(
		z.object({
			submissionId: z.string().uuid(),
			/** Base64 audio for the real provider path (optional in dev). */
			audioBase64: z.string().optional(),
			audioFilename: z.string().optional(),
			/** Text stand-in for the transcript (mock/dev demo path). */
			textStandIn: z.string().optional(),
		}),
	)
	.output(
		z.object({
			transcriptionId: z.string(),
			transcript: z.string(),
			proposals: z.array(ProposedAnswerSchema),
			mock: z.boolean(),
		}),
	)
	.handler(async ({ input, context, signal }) => {
		// Throttle transcription per user — it hits the AI provider and persists
		// minors' audio-derived text (H3).
		if (!rateLimit(`ai:transcribe:${context.actor.userId}`, { max: 10, windowMs: 60_000 })) {
			throw new ORPCError("TOO_MANY_REQUESTS", {
				message: "Te veel transcriptieverzoeken. Wacht even en probeer opnieuw.",
			});
		}
		if (input.audioBase64 && input.audioBase64.length > MAX_AUDIO_BASE64_CHARS) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Audiobestand is te groot (maximaal 25 MB).",
			});
		}
		const sub = await loadReviewableSubmission(context, input.submissionId);

		// Only the coach-gedeelte questions of the submission's template get
		// proposed answers (#18: "omgezet naar de formuliervelden in de
		// vragenlijst die door Incluvo wordt aangeboden").
		const coachQuestions = await context.db
			.select({
				id: formQuestion.id,
				label: formQuestion.label,
				helpText: formQuestion.helpText,
			})
			.from(formQuestion)
			.where(
				and(
					eq(formQuestion.templateId, sub.templateId),
					// Proposals map onto the coach-vragenlijst (#18 → #17); the
					// "Overnemen" action persists via `saveCoachAnswer`, which only
					// accepts coach-section questions.
					eq(formQuestion.section, "coach"),
				),
			)
			.orderBy(asc(formQuestion.position));
		const questions = coachQuestions; // template questions, coach proposes per veld

		// Insert a pending transcription row first (privacy §4.3). Audio never goes
		// through the presign flow, so the key is always null — accepting a
		// client-supplied key here would hand deleteAudio an arbitrary-object-
		// deletion vector.
		const [pending] = await context.db
			.insert(transcription)
			.values({
				submissionId: sub.id,
				coachId: context.actor.userId,
				status: "processing",
				audioStorageKey: null,
			})
			.returning();
		if (!pending) throw new ORPCError("INTERNAL_SERVER_ERROR");

		const provider = getAiProvider();
		let result: { transcript: string; proposals: { questionId: string; value: string }[] };
		try {
			result = await provider.transcribe({
				audio: input.audioBase64
					? Uint8Array.from(Buffer.from(input.audioBase64, "base64"))
					: undefined,
				audioFilename: input.audioFilename,
				textStandIn: input.textStandIn,
				questions: questions.map((q) => ({
					id: q.id,
					label: q.label,
					helpText: q.helpText,
				})),
				signal,
			});
		} catch (err) {
			await context.db
				.update(transcription)
				.set({ status: "failed", updatedAt: new Date() })
				.where(eq(transcription.id, pending.id));
			// Log the provider detail server-side; never leak it to the client.
			console.error("transcribe failed", err);
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Transcriptie mislukt. Probeer het later opnieuw.",
			});
		}

		// Persist the transcript; keep status completed.
		await context.db
			.update(transcription)
			.set({
				status: "completed",
				transcriptText: result.transcript,
				updatedAt: new Date(),
			})
			.where(eq(transcription.id, pending.id));

		// Decorate proposals with their question labels for the review UI.
		const labelById = new Map(questions.map((q) => [q.id, q]));
		const proposals = result.proposals.map((p) => {
			const q = labelById.get(p.questionId);
			return {
				questionId: p.questionId,
				label: q?.label ?? "",
				helpText: q?.helpText ?? null,
				value: p.value,
			};
		});

		return {
			transcriptionId: pending.id,
			transcript: result.transcript,
			proposals,
			mock: provider.mock,
		};
	});

/**
 * Delete the source audio key after transcription (privacy §4.3). Clears
 * `audioStorageKey` on the transcription row (the transcript text is kept). The
 * actual object deletion in object storage is wired by the orchestrator.
 */
const deleteAudio = coachProcedure
	.route({ method: "POST", path: "/ai/transcribe/delete-audio", tags: ["ai"] })
	.input(z.object({ transcriptionId: z.string().uuid() }))
	.output(z.object({ ok: z.boolean(), audioStorageKey: z.string().nullable() }))
	.handler(async ({ input, context }) => {
		const [row] = await context.db
			.select()
			.from(transcription)
			.where(eq(transcription.id, input.transcriptionId));
		if (!row) throw new ORPCError("NOT_FOUND");
		// Re-check the coach may review the owning submission.
		await loadReviewableSubmission(context, row.submissionId);

		const previousKey = row.audioStorageKey;
		// AVG right-to-erasure (H4): actually delete the stored audio object before
		// clearing the column, so a minor's recording isn't orphaned in storage.
		// `deleteObject` tolerates a missing object (ENOENT); a real failure surfaces
		// so we don't null the key while the object still exists.
		if (previousKey) {
			// A malformed stored key would make `deleteObject` throw on every call,
			// permanently wedging the erasure flow — validate first and, if invalid,
			// skip the (impossible) deletion and just clear the column.
			let keyIsValid = true;
			try {
				assertValidStorageKey(previousKey);
			} catch {
				keyIsValid = false;
				console.warn("deleteAudio: malformed stored audio key, clearing column", {
					transcriptionId: row.id,
				});
			}
			if (keyIsValid) {
				try {
					await deleteObject(previousKey);
				} catch (err) {
					console.error("deleteAudio: object deletion failed", err);
					throw new ORPCError("INTERNAL_SERVER_ERROR", {
						message: "Verwijderen van de opname is mislukt. Probeer het later opnieuw.",
					});
				}
			}
		}
		await context.db
			.update(transcription)
			.set({ audioStorageKey: null, updatedAt: new Date() })
			.where(eq(transcription.id, row.id));
		return { ok: true, audioStorageKey: previousKey };
	});

// ---------------------------------------------------------------------------
// #22 — Streaming interventie-advies (oRPC Event Iterator)
// ---------------------------------------------------------------------------

const AdviceMessageSchema = z.object({
	role: z.enum(["user", "assistant"]),
	content: z.string().min(1).max(8000),
});

/** Max chars of composed coachplan context we fold into the prompt (input cap). */
const COACHPLAN_CONTEXT_CAP = 20_000;

/** Humanise one answer for the AI context, resolving choice labels (mirrors the PDF renderer). */
function renderAnswerForContext(
	answer: typeof formAnswer.$inferSelect | undefined,
	question: typeof formQuestion.$inferSelect,
): string {
	if (!answer) return "(niet ingevuld)";
	const opts = (question.options ?? null) as {
		choices?: { value: string; label: string }[];
	} | null;
	const choiceLabel = (v: string) =>
		opts?.choices?.find((c) => c.value === v)?.label ?? v;
	const json = answer.valueJson as unknown;
	if (Array.isArray(json) && json.length > 0) {
		return json.map((v) => choiceLabel(String(v))).join(", ");
	}
	if (answer.value?.trim()) {
		if (question.type === "single_choice" || question.type === "leervoorkeur") {
			return choiceLabel(answer.value);
		}
		return answer.value;
	}
	return "(niet ingevuld)";
}

/**
 * Compose the coachplan context for the AI-advies prompt (#22) SERVER-SIDE from
 * the submission's real questions + answers — the client only knows the leerling
 * name + leervoorkeur labels + current question, never the actual answers.
 *
 * Includes the leerling's name, their leervoorkeuren, then every question
 * (leerling + coach sections, in template order) with its answer, marking
 * answers the leerling flagged "bespreken met coach" or deliberately skipped.
 * Whole Q&A entries are dropped once the 20k-char cap is reached, so we never
 * truncate mid-sentence.
 */
async function composeCoachplanContext(
	context: AuthedContext,
	sub: typeof formSubmission.$inferSelect,
): Promise<string> {
	const [leerling] = await context.db
		.select({ name: user.name })
		.from(user)
		.where(eq(user.id, sub.leerlingId));
	const questions = await context.db
		.select()
		.from(formQuestion)
		.where(eq(formQuestion.templateId, sub.templateId))
		.orderBy(asc(formQuestion.position));
	const answers = await context.db
		.select()
		.from(formAnswer)
		.where(eq(formAnswer.submissionId, sub.id));
	const prefs = await context.db
		.select({ label: learningPreferenceLabel.label })
		.from(learningPreferenceLabel)
		.where(eq(learningPreferenceLabel.submissionId, sub.id));

	const answerByQuestion = new Map(answers.map((a) => [a.questionId, a]));

	const header = [`Leerling: ${leerling?.name ?? "onbekend"}`];
	if (prefs.length > 0) {
		header.push(`Leervoorkeuren: ${prefs.map((p) => p.label).join(", ")}`);
	}

	let out = header.join("\n");
	for (const q of questions) {
		const a = answerByQuestion.get(q.id);
		let line = `\n\nVraag: ${q.label}\nAntwoord: ${renderAnswerForContext(a, q)}`;
		if (a?.deliberatelySkipped) line += " (overgeslagen)";
		if (a?.discussWithCoach) line += " (wil bespreken met coach)";
		// Cap by dropping whole Q&A entries — never mid-sentence.
		if (out.length + line.length > COACHPLAN_CONTEXT_CAP) break;
		out += line;
	}
	return out;
}

/**
 * Streaming advice chat (#22). The handler is an **async generator**, which oRPC
 * serializes as an Event Iterator; the Solid client consumes it as an async
 * iterable and appends each `{ delta }` frame. A final `{ done: true }` frame
 * signals completion.
 *
 * When a `submissionId` is given the coachplan context is composed server-side
 * from the real answers (see `composeCoachplanContext`); the client-supplied
 * `coachplanContext` is only a fallback for callers without a submission. RAG
 * over kennisdocumenten via pgvector is folded in on top (see below).
 */
const assistant = coachProcedure
	.route({ method: "POST", path: "/ai/assistant", tags: ["ai"] })
	.input(
		z.object({
			/** Optional: scope advice to a specific coachplan (tenant-checked). */
			submissionId: z.string().uuid().optional(),
			/** Free-text coachplan context to ground the advice. */
			coachplanContext: z.string().max(20_000).optional(),
			messages: z.array(AdviceMessageSchema).min(1),
		}),
	)
	.handler(async function* ({ input, context, signal }) {
		// Throttle the streaming advice endpoint per user (H3).
		if (!rateLimit(`ai:assistant:${context.actor.userId}`, { max: 20, windowMs: 60_000 })) {
			throw new ORPCError("TOO_MANY_REQUESTS", {
				message: "Te veel AI-verzoeken. Wacht even en probeer opnieuw.",
			});
		}
		// If a submission is referenced, enforce the coach may read it and compose
		// the coachplan context server-side from the real answers (never trust a
		// client-built context for an answered plan).
		let serverContext: string | null = null;
		if (input.submissionId) {
			const sub = await loadReviewableSubmission(context, input.submissionId);
			serverContext = await composeCoachplanContext(context, sub);
		}

		const provider = getAiProvider();

		// #20 — ground the advice in the kennisdocumenten (RAG). Embed the coach's
		// latest question, retrieve the nearest chunks (global + own tenant) and
		// fold them into the system-prompt context. Best-effort: a retrieval
		// failure (e.g. pgvector not enabled) must never break the advice stream.
		let promptContext = serverContext ?? input.coachplanContext?.trim() ?? "";
		try {
			const lastUser = input.messages.findLast((m) => m.role === "user");
			if (lastUser) {
				const hits = await retrieveKennisHits(context.db, provider, lastUser.content, {
					organizationId: context.actor.organizationId,
					signal,
				});
				const kennis = formatKennisContext(hits);
				if (kennis) {
					promptContext = promptContext
						? `${promptContext}\n\n${kennis}`
						: kennis;
				}
			}
		} catch (err) {
			console.error("kennisdocumenten retrieval failed", err);
		}

		const messages = [
			{
				role: "system" as const,
				content: adviceSystemPrompt(promptContext || undefined),
			},
			...input.messages,
		];

		// First frame carries provider metadata so the UI can show "MOCK".
		yield { meta: { mock: provider.mock, model: provider.model } } as
			| { meta: { mock: boolean; model: string } }
			| { delta: string }
			| { done: true };

		for await (const delta of provider.streamAdvice({ messages, signal })) {
			yield { delta };
		}
		yield { done: true };
	});

export const aiRouter = base.router({
	provider: providerInfo,
	translate,
	transcribe,
	deleteAudio,
	assistant,
});

/** Whether the AI layer is running the mock provider (no credentials). */
export { isMockProvider };
