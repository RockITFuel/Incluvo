import { createUniqueId, For, Match, Show, Switch } from "solid-js";
import { Textarea } from "../ui/text-field";

/**
 * Per-question-type input registry for the coachplan wizard (tooling decision:
 * a component registry keyed on `question.type`). Each branch renders an
 * accessible control and reports a normalised value back:
 *   - text/longtext/single_choice/scale/boolean → `value` (string)
 *   - multiple_choice/leervoorkeur              → `valueJson` (string[])
 *   - multiple_choice with a free field (INC-29) → `valueJson` + `value`
 *
 * The wizard wires `onChange` to per-question autosave (#11).
 */

export type QuestionOptionDTO = { value: string; label: string };

export type QuestionDTO = {
	id: string;
	type: string;
	label: string;
	helpText: string | null;
	required: boolean;
	section: string;
	options: {
		theme?: string;
		choices?: QuestionOptionDTO[];
		/** INC-29: a multiple choice question with a free field. */
		allowOther?: boolean;
		scaleMin?: number;
		scaleMax?: number;
		scaleMinLabel?: string;
		scaleMaxLabel?: string;
	} | null;
};

export type AnswerValue = {
	value?: string | null;
	valueJson?: string[] | null;
};

type Props = {
	question: QuestionDTO;
	value: AnswerValue;
	disabled?: boolean;
	onChange: (next: AnswerValue) => void;
};

const SMILEYS = [
	{ value: "1", label: "Slecht", emoji: "😞" },
	{ value: "2", label: "Matig", emoji: "🙁" },
	{ value: "3", label: "Oké", emoji: "😐" },
	{ value: "4", label: "Goed", emoji: "🙂" },
	{ value: "5", label: "Top", emoji: "😄" },
];

/** A selectable option pill (single or multi). */
function OptionPill(props: {
	label: string;
	selected: boolean;
	disabled?: boolean;
	multi?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			disabled={props.disabled}
			aria-pressed={props.selected ? "true" : "false"}
			onClick={props.onClick}
			class="flex items-center gap-2.5 rounded-2 border-[1.5px] px-4 py-3 text-left text-body transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50 data-[on=true]:border-primary data-[on=true]:bg-primary-50 data-[on=true]:font-medium data-[on=true]:text-primary-700 data-[on=false]:border-line data-[on=false]:bg-surface data-[on=false]:text-ink hover:border-primary/60"
			data-on={String(props.selected)}
		>
			<span
				class={[
					"grid size-5 shrink-0 place-items-center border-[1.5px] text-white data-[on=true]:border-primary data-[on=true]:bg-primary data-[on=false]:border-line",
					{ "rounded-md": !!props.multi, "rounded-full": !props.multi },
				]}
				data-on={String(props.selected)}
			>
				<Show when={props.selected}>
					<span aria-hidden="true" class="text-micro">
						✓
					</span>
				</Show>
			</span>
			{props.label}
		</button>
	);
}

/** INC-29 variant 3: multiple choice plus a free field. */
export function allowsOther(question: Pick<QuestionDTO, "type" | "options">): boolean {
	return question.type === "multiple_choice" && Boolean(question.options?.allowOther);
}

export function QuestionInput(props: Props) {
	const choices = () => props.question.options?.choices ?? [];
	const selected = () => props.value.valueJson ?? [];
	const freeId = createUniqueId();

	// The choices and the free field are one answer: send both, so neither
	// replaces the other.
	const toggleMulti = (val: string) => {
		const cur = selected();
		const next = cur.includes(val)
			? cur.filter((v) => v !== val)
			: [...cur, val];
		props.onChange(
			allowsOther(props.question)
				? { valueJson: next, value: props.value.value ?? null }
				: { valueJson: next },
		);
	};

	return (
		<Switch>
			<Match when={props.question.type === "long_text"}>
				<Textarea
					aria-label={props.question.label}
					placeholder="Begin maar te typen…"
					rows={6}
					value={props.value.value ?? ""}
					disabled={props.disabled}
					onInput={(e) => props.onChange({ value: e.currentTarget.value })}
				/>
			</Match>

			<Match when={props.question.type === "short_text"}>
				<input
					type="text"
					aria-label={props.question.label}
					placeholder="Jouw antwoord…"
					disabled={props.disabled}
					value={props.value.value ?? ""}
					onInput={(e) => props.onChange({ value: e.currentTarget.value })}
					class="w-full rounded-2 border border-line bg-surface px-ctl-x py-ctl-y text-body text-ink placeholder:text-muted-2 focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
				/>
			</Match>

			<Match
				when={
					props.question.type === "multiple_choice" ||
					props.question.type === "leervoorkeur"
				}
			>
				<div class="flex flex-col gap-3">
					<div
						role="group"
						aria-label={props.question.label}
						class="grid gap-2 sm:grid-cols-2"
					>
						<For each={choices()}>
							{(opt) => (
								<OptionPill
									label={opt.label}
									multi
									disabled={props.disabled}
									selected={selected().includes(opt.value)}
									onClick={() => toggleMulti(opt.value)}
								/>
							)}
						</For>
					</div>
					<Show when={allowsOther(props.question)}>
						<div class="flex flex-col gap-1.5">
							<label for={freeId} class="text-small font-medium text-ink-2">
								Eigen antwoord (mag je leeg laten)
							</label>
							<input
								id={freeId}
								type="text"
								placeholder="Typ hier je eigen antwoord…"
								disabled={props.disabled}
								value={props.value.value ?? ""}
								onInput={(e) =>
									props.onChange({ valueJson: selected(), value: e.currentTarget.value })
								}
								class="w-full rounded-2 border border-line bg-surface px-ctl-x py-ctl-y text-body text-ink placeholder:text-muted-2 focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
							/>
						</div>
					</Show>
				</div>
			</Match>

			<Match when={props.question.type === "single_choice"}>
				<div
					role="group"
					aria-label={props.question.label}
					class="grid gap-2 sm:grid-cols-2"
				>
					<For each={choices()}>
						{(opt) => (
							<OptionPill
								label={opt.label}
								disabled={props.disabled}
								selected={props.value.value === opt.value}
								// Clicking the chosen option again clears the answer.
								onClick={() =>
									props.onChange({ value: props.value.value === opt.value ? null : opt.value })
								}
							/>
						)}
					</For>
				</div>
			</Match>

			<Match when={props.question.type === "boolean"}>
				<div class="flex gap-2">
					<OptionPill
						label="Ja"
						disabled={props.disabled}
						selected={props.value.value === "true"}
						onClick={() => props.onChange({ value: "true" })}
					/>
					<OptionPill
						label="Nee"
						disabled={props.disabled}
						selected={props.value.value === "false"}
						onClick={() => props.onChange({ value: "false" })}
					/>
				</div>
			</Match>

			<Match when={props.question.type === "scale"}>
				<div
					role="group"
					aria-label={props.question.label}
					class="flex flex-col gap-2"
				>
					<div class="flex flex-wrap gap-2">
						<For
							each={Array.from(
								{
									length:
										(props.question.options?.scaleMax ?? 5) -
										(props.question.options?.scaleMin ?? 1) +
										1,
								},
								(_, i) => (props.question.options?.scaleMin ?? 1) + i,
							)}
						>
							{(n) => (
								<button
									type="button"
									disabled={props.disabled}
									aria-label={`${n}`}
									aria-pressed={props.value.value === String(n) ? "true" : "false"}
									onClick={() => props.onChange({ value: String(n) })}
									data-on={String(props.value.value === String(n))}
									class="grid size-11 place-items-center rounded-2 border-[1.5px] text-body font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50 data-[on=true]:border-primary data-[on=true]:bg-primary data-[on=true]:text-primary-fg data-[on=false]:border-line data-[on=false]:bg-surface data-[on=false]:text-ink"
								>
									{n}
								</button>
							)}
						</For>
					</div>
					<div class="flex justify-between text-micro text-muted">
						<span>{props.question.options?.scaleMinLabel}</span>
						<span>{props.question.options?.scaleMaxLabel}</span>
					</div>
				</div>
			</Match>

			<Match when={props.question.type === "smiley"}>
				<div role="group" aria-label={props.question.label} class="flex gap-2">
					<For each={SMILEYS}>
						{(s) => (
							<button
								type="button"
								disabled={props.disabled}
								aria-label={s.label}
								aria-pressed={props.value.value === s.value ? "true" : "false"}
								onClick={() => props.onChange({ value: s.value })}
								data-on={String(props.value.value === s.value)}
								class="grid size-12 place-items-center rounded-2 border-[1.5px] text-2xl transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50 data-[on=true]:border-primary data-[on=true]:bg-primary-50 data-[on=false]:border-line data-[on=false]:bg-surface"
							>
								{s.emoji}
							</button>
						)}
					</For>
				</div>
			</Match>
		</Switch>
	);
}

/** Render a saved answer for the read-only overview / coach view. */
export function renderAnswerText(
	question: QuestionDTO,
	answer: AnswerValue | undefined,
): { kind: "chips" | "text" | "empty"; text?: string; chips?: string[] } {
	if (!answer) return { kind: "empty" };
	const labelFor = (v: string) =>
		question.options?.choices?.find((c) => c.value === v)?.label ?? v;
	// INC-29: the choices plus the free field; only spaces is no answer.
	if (question.type === "multiple_choice") {
		const chips = (answer.valueJson ?? []).map(labelFor);
		const free = answer.value?.trim();
		if (free) chips.push(free);
		return chips.length ? { kind: "chips", chips } : { kind: "empty" };
	}
	if (answer.valueJson && answer.valueJson.length) {
		return { kind: "chips", chips: answer.valueJson.map(labelFor) };
	}
	if (answer.value) {
		if (
			question.type === "single_choice" ||
			question.type === "leervoorkeur" ||
			question.type === "boolean"
		) {
			if (question.type === "boolean") {
				return { kind: "text", text: answer.value === "true" ? "Ja" : "Nee" };
			}
			return { kind: "text", text: labelFor(answer.value) };
		}
		return { kind: "text", text: answer.value };
	}
	return { kind: "empty" };
}

/**
 * INC-38: whether a question counts as answered. Text of only spaces doesn't,
 * and a free field alone answers a "Meerdere opties en vrij veld" question.
 * Mirrors `openRequired` on the server.
 */
export function isAnswered(question: QuestionDTO, answer: AnswerValue | undefined): boolean {
	const rendered = renderAnswerText(question, answer);
	return rendered.kind === "chips" || (rendered.kind === "text" && Boolean(rendered.text?.trim()));
}

/** The required questions without an answer, in the order given. */
export function openRequired<Q extends QuestionDTO>(
	questions: readonly Q[],
	answerFor: (q: Q) => AnswerValue | undefined,
): Q[] {
	return questions.filter((q) => q.required && !isAnswered(q, answerFor(q)));
}
