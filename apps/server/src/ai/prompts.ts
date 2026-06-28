/**
 * Prompt builders for the Incluvo AI layer. Kept separate from the provider so
 * prompts can be reviewed/tuned by domain experts (backlog #22 opmerking:
 * "Belangrijk is een goede prompt te maken").
 *
 * All system prompts are in Dutch, calm and supportive in tone, and explicitly
 * frame the AI output as a *concept/suggestion* the coach reviews and edits —
 * never an autonomous decision about a leerling.
 */

/** A single coach-questionnaire question to propose an answer for (#18). */
export interface CoachQuestionRef {
	id: string;
	label: string;
	helpText?: string | null;
}

/** A chat turn for the streaming assistant (#22). */
export interface AdviceMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

const SHARED_GUARDRAILS = [
	"Je bent een ondersteunende AI-assistent binnen Incluvo, een leeromgeving voor het onderwijs.",
	"Je adviseert coaches/docenten; je neemt nooit zelfstandig beslissingen over een leerling.",
	"Je output is altijd een CONCEPT dat de coach controleert en aanpast.",
	"Schrijf in helder, rustig en respectvol Nederlands (taalniveau B1 waar mogelijk).",
	"Wees concreet en niet stigmatiserend. Geen medische diagnoses.",
].join(" ");

/**
 * System prompt for the interventie-advies assistant (#22).
 *
 * Grounded in Universal Design for Learning (UDL) op basis van de input van
 * Mark Timmermans (Ondivera) — e-mail "Input Incluvo", 12-06-2026: vertrek vanuit
 * wat we over de leerling weten uit het coachplan en geef suggesties langs de drie
 * UDL-principes (betrokkenheid, representatie, actie & expressie).
 */
export function adviceSystemPrompt(context?: string): string {
	const base = `${SHARED_GUARDRAILS} Je ondersteunt de coach/docent bij het bedenken van leeractiviteiten en interventies volgens de principes van Universal Design for Learning (UDL). Vertrek vanuit wat bekend is over de leerling uit het coachplan: interesses, motivatie, leerbehoeften, thuissituatie, voorkennis, leervoorkeuren en wat de leerling zelf graag wil leren. Geef je suggesties langs de drie UDL-principes: (1) meervoudige betrokkenheid — hoe kun je deze leerling motiveren; (2) meervoudige representatie — welke vormen van lesaanbod passen; (3) meervoudige actie en expressie — op welke manieren kan de leerling laten zien wat hij of zij geleerd heeft. Vertaal dit naar een concrete, gedifferentieerde aanpak met praktische voorbeelden en, waar nuttig, sjablonen. Stel een verdiepende vraag als belangrijke informatie ontbreekt. Houd je advies kort en overzichtelijk.`;
	if (context?.trim()) {
		return `${base}\n\nContext uit het coachplan:\n${context.trim()}`;
	}
	return base;
}

/**
 * Build the messages for the transcription → conceptantwoorden step (#18). The
 * model receives the transcript plus the coach questions and must return a JSON
 * object mapping question ids to proposed Dutch answers.
 */
export function buildAnswerProposalMessages(
	transcript: string,
	questions: CoachQuestionRef[],
): AdviceMessage[] {
	const questionList = questions
		.map(
			(q, i) =>
				`${i + 1}. [id=${q.id}] ${q.label}${q.helpText ? ` (toelichting: ${q.helpText})` : ""}`,
		)
		.join("\n");

	const system = `${SHARED_GUARDRAILS} Je krijgt een transcript van een coachgesprek tussen een coach en een leerling. Vat de relevante inhoud samen en stel per vraag uit de coach-vragenlijst een conceptantwoord voor in het Nederlands. Baseer je uitsluitend op het transcript; als het transcript geen informatie bevat voor een vraag, geef dan een kort, voorzichtig conceptantwoord of laat het veld leeg. Antwoord ALLEEN met geldige JSON in de vorm {"answers":[{"questionId":"...","value":"..."}]}.`;

	const user = `Transcript:\n"""\n${transcript}\n"""\n\nCoach-vragen:\n${questionList}\n\nGeef de conceptantwoorden als JSON.`;

	return [
		{ role: "system", content: system },
		{ role: "user", content: user },
	];
}

/** System prompt for the translation procedure (#1). */
export function translateSystemPrompt(targetLanguage: string): string {
	return `Je bent een professionele vertaler voor een onderwijs-leeromgeving. Vertaal de tekst van de gebruiker getrouw naar ${targetLanguage}. Behoud de toon en betekenis, vertaal natuurlijk en begrijpelijk. Geef ALLEEN de vertaalde tekst terug, zonder uitleg of aanhalingstekens.`;
}

/** Human-readable language names for supported target locales (#1). */
export const LANGUAGE_NAMES: Record<string, string> = {
	nl: "Nederlands",
	en: "Engels (English)",
	ar: "Arabisch (العربية)",
	uk: "Oekraïens (українська)",
	tr: "Turks (Türkçe)",
	pl: "Pools (polski)",
	de: "Duits (Deutsch)",
	fr: "Frans (français)",
};

export function languageName(code: string): string {
	return LANGUAGE_NAMES[code] ?? code;
}
