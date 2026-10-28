/**
 * Answers and questions as people read them (PDF, AI context), and the rules
 * for choice questions (INC-29) and the leerling wording (INC-31).
 */
import type { formAnswer, formQuestion } from "@incluvo/drizzle/schema";
import { ORPCError } from "@orpc/server";
import type { QuestionOptions } from "./schema";

type Question = typeof formQuestion.$inferSelect;
type Answer = typeof formAnswer.$inferSelect;

/** Types whose options the form editor sets (INC-29). */
export const CHOICE_TYPES: readonly string[] = ["single_choice", "multiple_choice"];

/**
 * The answer as text, choice values turned into their labels; null when it
 * is empty or skipped. A multiple choice answer keeps its choices in
 * `valueJson` and the free field (INC-29) in `value`.
 */
export function answerText(
	answer: Answer | undefined,
	question: Pick<Question, "type" | "options">,
): string | null {
	if (!answer || answer.deliberatelySkipped) return null;
	const choices = (question.options as QuestionOptions | null)?.choices ?? [];
	const choiceLabel = (v: string) => choices.find((c) => c.value === v)?.label ?? v;
	const json = answer.valueJson as unknown;
	const free = answer.value?.trim() ?? "";
	if (Array.isArray(json) && json.length > 0) {
		const parts = json.map((v) => choiceLabel(String(v)));
		if (question.type === "multiple_choice" && free) parts.push(free);
		return parts.join(", ");
	}
	if (!free) return null;
	if (question.type === "single_choice" || question.type === "leervoorkeur") {
		return choiceLabel(answer.value!);
	}
	return answer.value;
}

/**
 * INC-29 AC3: choice options need a label (not just spaces), and a choice
 * question at least two of them. Returns the options with trimmed labels.
 */
export function cleanChoices(type: string, options: QuestionOptions | undefined) {
	if (!options?.choices || !CHOICE_TYPES.includes(type)) return options;
	const choices = options.choices.map((c) => ({ ...c, label: c.label.trim() }));
	if (choices.some((c) => !c.label)) {
		throw new ORPCError("BAD_REQUEST", { message: "Vul bij elke antwoordoptie een tekst in." });
	}
	if (choices.length < 2) {
		throw new ORPCError("BAD_REQUEST", { message: "Voeg minstens twee antwoordopties toe." });
	}
	if (new Set(choices.map((c) => c.value)).size !== choices.length) {
		throw new ORPCError("BAD_REQUEST", { message: "Twee antwoordopties hebben dezelfde waarde." });
	}
	return { ...options, choices };
}

function refuse(message: string): never {
	throw new ORPCError("BAD_REQUEST", { message });
}

/**
 * INC-29 AC5–AC7, on the server too: a choice answer may only hold the
 * question's own options — one for "Eén optie", any set for "Meerdere" — and
 * free text only where the question has a free field. The UI keeps to this;
 * a direct call must as well. `undefined` leaves that part of the answer as is.
 */
export function checkChoiceAnswer(
	q: Pick<Question, "type" | "options">,
	value: string | null | undefined,
	valueJson: unknown,
): void {
	if (!CHOICE_TYPES.includes(q.type)) return;
	const options = q.options as QuestionOptions | null;
	const allowed = new Set((options?.choices ?? []).map((c) => c.value));
	if (q.type === "single_choice") {
		if (valueJson != null && !(Array.isArray(valueJson) && valueJson.length === 0)) {
			refuse("Bij deze vraag kies je één antwoord.");
		}
		if (value && !allowed.has(value)) refuse("Dit antwoord is geen optie van deze vraag.");
		return;
	}
	if (valueJson != null) {
		if (!Array.isArray(valueJson) || valueJson.some((v) => typeof v !== "string")) {
			refuse("Ongeldig antwoord.");
		}
		const picked = valueJson as string[];
		if (picked.some((v) => !allowed.has(v))) refuse("Dit antwoord is geen optie van deze vraag.");
		if (new Set(picked).size !== picked.length) refuse("Een optie is dubbel gekozen.");
	}
	if (value?.trim() && !options?.allowOther) refuse("Deze vraag heeft geen vrij veld.");
}

/**
 * INC-38: the required questions of one part of the plan that have no answer
 * yet, in form order. Skipped counts as unanswered, and so does text of only
 * spaces; a free field alone answers a "Meerdere opties en vrij veld" question.
 */
export function openRequired(
	questions: readonly Question[],
	answers: readonly Answer[],
	section: Question["section"],
): Question[] {
	const bySection = questions
		.filter((q) => q.section === section && q.required)
		.toSorted((a, b) => a.position - b.position);
	const byQuestion = new Map(answers.map((a) => [a.questionId, a]));
	return bySection.filter((q) => !answerText(byQuestion.get(q.id), q)?.trim());
}

/** The refusal when required questions are open; `data` lists them for the UI. */
export function requiredOpenError(open: readonly Question[], who: "leerling" | "coach") {
	const n = open.length;
	return new ORPCError("BAD_REQUEST", {
		message:
			who === "leerling"
				? `Beantwoord eerst ${n === 1 ? "de verplichte vraag" : `de ${n} verplichte vragen`} voordat je je plan verstuurt.`
				: `Beantwoord eerst ${n === 1 ? "de verplichte vraag" : `de ${n} verplichte vragen`} voordat je het plan aanbiedt.`,
		data: { questionIds: open.map((q) => q.id) },
	});
}

/** A choice question that can't be filled in yet: fewer than two options. */
export function lacksChoices(q: Pick<Question, "type" | "options">): boolean {
	if (!CHOICE_TYPES.includes(q.type)) return false;
	const choices = (q.options as QuestionOptions | null)?.choices ?? [];
	return choices.filter((c) => c.label.trim()).length < 2;
}

/** INC-31: the wording the leerling reads; the coach always reads `label`. */
export function leerlingWording<T extends { label: string; leerlingLabel: string | null }>(q: T): T {
	return { ...q, label: q.leerlingLabel?.trim() || q.label };
}

/** An optional wording: trimmed, and empty means none. */
export function optionalText(text: string | null | undefined): string | null | undefined {
	if (text === undefined) return undefined;
	return text?.trim() || null;
}
