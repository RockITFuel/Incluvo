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
export function answerText(answer: Answer | undefined, question: Question): string | null {
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
