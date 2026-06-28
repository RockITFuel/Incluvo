/**
 * Provider abstraction for the Incluvo AI layer.
 *
 * Two implementations behind one interface:
 *   - `OpenAiCompatibleProvider` — the real path. Uses the official `openai`
 *     SDK pointed at a configurable **EU-resident, OpenAI-compatible baseURL**
 *     (Azure OpenAI Data Zone EUR / Mistral EU). EU residency is a HARD
 *     requirement (docs/research/ai-layer.md §5).
 *   - `MockProvider` — deterministic, offline fallback used whenever no AI
 *     credentials are configured, so the whole feature is demoable in dev.
 *
 * The router only ever depends on the `AiProvider` interface, so swapping the
 * EU endpoint (or vendor) is a config change, not a code change.
 */

import { KENNIS_EMBED_DIM } from "@incluvo/drizzle/schema";
import OpenAI from "openai";
import { type AiConfig, assertEuResidency, readAiConfig } from "./config";
import {
	type AdviceMessage,
	buildAnswerProposalMessages,
	type CoachQuestionRef,
	languageName,
	translateSystemPrompt,
} from "./prompts";

export interface ProposedAnswer {
	questionId: string;
	value: string;
}

export interface TranscribeResult {
	transcript: string;
	proposals: ProposedAnswer[];
}

export interface AiProvider {
	/** True for the mock provider (drives the UI "MOCK" indicator). */
	readonly mock: boolean;
	/** Model id in use (informational; surfaced in the UI). */
	readonly model: string;

	/** #1 — translate text to a target language code (nl/en/ar/uk/…). */
	translate(text: string, targetLanguageCode: string): Promise<string>;

	/**
	 * #18 — produce a transcript from audio (or, in mock/dev, from a text
	 * stand-in) and propose draft answers mapped onto the coach questions.
	 */
	transcribe(input: {
		/** Raw audio bytes (real path). */
		audio?: Uint8Array;
		audioFilename?: string;
		/** Text stand-in for the transcript (mock/dev path). */
		textStandIn?: string;
		questions: CoachQuestionRef[];
	}): Promise<TranscribeResult>;

	/**
	 * #22 — stream interventie-advies token by token. Returns an async iterable
	 * of text deltas, consumed by the oRPC Event Iterator.
	 */
	streamAdvice(input: {
		messages: AdviceMessage[];
	}): AsyncIterable<string>;

	/**
	 * #20 — embed one or more texts for the kennisdocumenten RAG-laag. Returns a
	 * `KENNIS_EMBED_DIM`-length vector per input (same order). The mock returns
	 * deterministic vectors so ingestion + retrieval are demoable offline.
	 */
	embed(texts: string[]): Promise<number[][]>;
}

// ---------------------------------------------------------------------------
// Real provider — OpenAI SDK against an EU-compatible endpoint
// ---------------------------------------------------------------------------

class OpenAiCompatibleProvider implements AiProvider {
	readonly mock = false;
	readonly model: string;
	private readonly client: OpenAI;
	private readonly config: AiConfig;

	constructor(config: AiConfig) {
		// EU data-residency gate — fail closed if the base URL host isn't on the
		// approved EU allow-list, so minors' data never reaches a non-EU endpoint.
		assertEuResidency(config);
		this.config = config;
		this.model = config.model;
		this.client = new OpenAI({
			apiKey: config.apiKey,
			baseURL: config.baseURL,
		});
	}

	async translate(text: string, targetLanguageCode: string): Promise<string> {
		const res = await this.client.chat.completions.create({
			model: this.model,
			messages: [
				{ role: "system", content: translateSystemPrompt(languageName(targetLanguageCode)) },
				{ role: "user", content: text },
			],
		});
		return res.choices[0]?.message?.content?.trim() ?? "";
	}

	async transcribe(input: {
		audio?: Uint8Array;
		audioFilename?: string;
		textStandIn?: string;
		questions: CoachQuestionRef[];
	}): Promise<TranscribeResult> {
		let transcript: string;
		if (input.audio) {
			const file = new File(
				[new Uint8Array(input.audio)],
				input.audioFilename ?? "gesprek.webm",
			);
			const res = await this.client.audio.transcriptions.create({
				file,
				model: this.config.transcribeModel,
				language: "nl",
			});
			transcript = res.text;
		} else {
			// A text stand-in lets the real provider still propose answers from a
			// pasted transcript when no audio is sent.
			transcript = input.textStandIn ?? "";
		}

		const proposals = await this.proposeAnswers(transcript, input.questions);
		return { transcript, proposals };
	}

	private async proposeAnswers(
		transcript: string,
		questions: CoachQuestionRef[],
	): Promise<ProposedAnswer[]> {
		if (!transcript.trim() || questions.length === 0) return [];
		const messages = buildAnswerProposalMessages(transcript, questions);
		const res = await this.client.chat.completions.create({
			model: this.model,
			messages,
			response_format: { type: "json_object" },
		});
		const raw = res.choices[0]?.message?.content ?? "{}";
		try {
			const parsed = JSON.parse(raw) as { answers?: ProposedAnswer[] };
			const valid = new Set(questions.map((q) => q.id));
			return (parsed.answers ?? [])
				.filter((a) => a && valid.has(a.questionId))
				.map((a) => ({ questionId: a.questionId, value: String(a.value ?? "") }));
		} catch {
			return [];
		}
	}

	async *streamAdvice(input: {
		messages: AdviceMessage[];
	}): AsyncIterable<string> {
		const stream = await this.client.chat.completions.create({
			model: this.model,
			stream: true,
			messages: input.messages,
		});
		for await (const chunk of stream) {
			const delta = chunk.choices[0]?.delta?.content;
			if (delta) yield delta;
		}
	}

	async embed(texts: string[]): Promise<number[][]> {
		if (texts.length === 0) return [];
		const res = await this.client.embeddings.create({
			model: this.config.embedModel,
			input: texts,
		});
		// Preserve input order and coerce to the fixed column dimension.
		return res.data
			.toSorted((a, b) => a.index - b.index)
			.map((d) => fitToDim(d.embedding as number[]));
	}
}

/** Coerce a vector to exactly `KENNIS_EMBED_DIM` (pad with 0 / truncate). */
function fitToDim(v: number[]): number[] {
	if (v.length === KENNIS_EMBED_DIM) return v;
	if (v.length > KENNIS_EMBED_DIM) return v.slice(0, KENNIS_EMBED_DIM);
	return [...v, ...Array.from({ length: KENNIS_EMBED_DIM - v.length }, () => 0)];
}

/**
 * Deterministic, dependency-free mock embedding (#20). Hashes whitespace tokens
 * into a fixed-width bag-of-words vector and L2-normalises it, so identical or
 * overlapping texts land near each other under cosine distance. Not semantic —
 * a stand-in so ingestion + retrieval work offline without an embeddings API.
 */
function mockEmbed(text: string): number[] {
	const counts = new Map<number, number>();
	const tokens = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
	for (const tok of tokens) {
		let h = 2166136261;
		for (let i = 0; i < tok.length; i++) {
			h ^= tok.charCodeAt(i);
			h = Math.imul(h, 16777619);
		}
		const idx = Math.abs(h) % KENNIS_EMBED_DIM;
		counts.set(idx, (counts.get(idx) ?? 0) + 1);
	}
	let norm = 0;
	for (const c of counts.values()) norm += c * c;
	norm = Math.sqrt(norm) || 1;
	return Array.from(
		{ length: KENNIS_EMBED_DIM },
		(_, i) => (counts.get(i) ?? 0) / norm,
	);
}

// ---------------------------------------------------------------------------
// Mock provider — deterministic, offline, no credentials
// ---------------------------------------------------------------------------

const CANNED_TRANSCRIPT = [
	"Coach: Fijn dat je er bent. Hoe gaat het de laatste tijd met school?",
	"Leerling: Wisselend. Rekenen vind ik echt lastig, vooral als het snel moet. Lezen gaat juist beter.",
	"Coach: Wat helpt jou als iets moeilijk is?",
	"Leerling: Als ik het stap voor stap mag doen en er een voorbeeld bij is. En als het rustig is om me heen, ik ben snel afgeleid.",
	"Coach: En waar word je blij van?",
	"Leerling: Tekenen en samenwerken in een klein groepje. Voor de hele klas iets vertellen vind ik spannend.",
	"Coach: Heb je een doel voor de komende weken?",
	"Leerling: Ik wil rekenen iets minder eng maken en vaker om hulp durven vragen.",
].join("\n");

/** Keyword → suggested Dutch answer snippets for plausible mock proposals. */
function mockAnswerFor(label: string): string {
	const l = label.toLowerCase();
	if (l.includes("sterk") || l.includes("goed") || l.includes("kracht")) {
		return "Lezen gaat goed; is creatief (tekenen) en werkt graag samen in een klein groepje.";
	}
	if (l.includes("lastig") || l.includes("moeilijk") || l.includes("uitdag") || l.includes("aandacht")) {
		return "Rekenen onder tijdsdruk is lastig; raakt snel afgeleid in een drukke omgeving.";
	}
	if (l.includes("voorkeur") || l.includes("leer") || l.includes("helpt")) {
		return "Werkt het best stap-voor-stap met een voorbeeld erbij, in een rustige omgeving.";
	}
	if (l.includes("doel") || l.includes("wens") || l.includes("plan")) {
		return "Rekenen minder spannend maken en vaker zelf om hulp durven vragen.";
	}
	if (l.includes("ondersteun") || l.includes("interventie") || l.includes("afspraak")) {
		return "Bied opdrachten in kleine stappen aan, met visuele voorbeelden en een prikkelarme werkplek.";
	}
	return "Conceptantwoord op basis van het gesprek — controleer en pas aan waar nodig.";
}

class MockProvider implements AiProvider {
	readonly mock = true;
	readonly model = "mock";

	async translate(text: string, targetLanguageCode: string): Promise<string> {
		const name = languageName(targetLanguageCode);
		// Clearly-marked pseudo-translation so it's obvious this is the mock.
		return `[MOCK-vertaling → ${name}] ${text}`;
	}

	async transcribe(input: {
		audio?: Uint8Array;
		audioFilename?: string;
		textStandIn?: string;
		questions: CoachQuestionRef[];
	}): Promise<TranscribeResult> {
		const transcript = input.textStandIn?.trim()
			? input.textStandIn.trim()
			: CANNED_TRANSCRIPT;
		const proposals: ProposedAnswer[] = input.questions.map((q) => ({
			questionId: q.id,
			value: mockAnswerFor(q.label),
		}));
		return { transcript, proposals };
	}

	async *streamAdvice(_input: {
		messages: AdviceMessage[];
	}): AsyncIterable<string> {
		const advice = [
			"Op basis van het coachplan zie ik een leerling die gebaat is bij structuur en rust.",
			"",
			"Concrete suggesties:",
			"1. Bied reken-taken in kleine stappen aan en voeg steeds een uitgewerkt voorbeeld toe.",
			"2. Creëer een prikkelarme werkplek (vaste plek, koptelefoon, minimale afleiding).",
			"3. Sluit aan bij de kracht: laat samenwerken in een klein groepje en benut creativiteit (tekenen) om stof te verwerken.",
			"4. Oefen het vragen om hulp met een laagdrempelig signaal (bijv. een hulpkaartje).",
			"5. Vier kleine successen om de rekenangst te verminderen.",
			"",
			"Dit is een concept-advies — bespreek en pas het samen met de leerling aan.",
		].join("\n");

		// Stream token-by-token (word-wise) to mimic real streaming.
		const tokens = advice.match(/\S+\s*|\n/g) ?? [advice];
		for (const token of tokens) {
			await new Promise((r) => setTimeout(r, 18));
			yield token;
		}
	}

	async embed(texts: string[]): Promise<number[][]> {
		return texts.map(mockEmbed);
	}
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

let cached: AiProvider | undefined;

/** Resolve the active provider (real EU endpoint if configured, else mock). */
export function getAiProvider(): AiProvider {
	if (cached) return cached;
	const config = readAiConfig();
	cached = config.live
		? new OpenAiCompatibleProvider(config)
		: new MockProvider();
	return cached;
}
