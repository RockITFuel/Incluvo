import { For, Match, Show, Switch } from "solid-js";
import { Textarea } from "../ui/text-field";

/**
 * Per-question-type input registry for the coachplan wizard (tooling decision:
 * a component registry keyed on `question.type`). Each branch renders an
 * accessible control and reports a normalised value back:
 *   - text/longtext/single_choice/scale/boolean → `value` (string)
 *   - multiple_choice/leervoorkeur              → `valueJson` (string[])
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
			aria-pressed={props.selected}
			onClick={props.onClick}
			class="flex items-center gap-2.5 rounded-2 border-[1.5px] px-4 py-3 text-left text-body transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50 data-[on=true]:border-primary data-[on=true]:bg-primary-50 data-[on=true]:font-medium data-[on=true]:text-primary-700 data-[on=false]:border-line data-[on=false]:bg-surface data-[on=false]:text-ink hover:border-primary/60"
			data-on={props.selected}
		>
			<span
				class="grid size-5 shrink-0 place-items-center border-[1.5px] text-white data-[on=true]:border-primary data-[on=true]:bg-primary data-[on=false]:border-line"
				classList={{ "rounded-md": props.multi, "rounded-full": !props.multi }}
				data-on={props.selected}
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

export function QuestionInput(props: Props) {
	const choices = () => props.question.options?.choices ?? [];
	const selected = () => props.value.valueJson ?? [];

	const toggleMulti = (val: string) => {
		const cur = selected();
		const next = cur.includes(val)
			? cur.filter((v) => v !== val)
			: [...cur, val];
		props.onChange({ valueJson: next });
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
			</Match>

			<Match when={props.question.type === "single_choice"}>
				<div
					role="radiogroup"
					aria-label={props.question.label}
					class="grid gap-2 sm:grid-cols-2"
				>
					<For each={choices()}>
						{(opt) => (
							<OptionPill
								label={opt.label}
								disabled={props.disabled}
								selected={props.value.value === opt.value}
								onClick={() => props.onChange({ value: opt.value })}
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
					role="radiogroup"
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
									aria-pressed={props.value.value === String(n)}
									onClick={() => props.onChange({ value: String(n) })}
									data-on={props.value.value === String(n)}
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
				<div role="radiogroup" aria-label={props.question.label} class="flex gap-2">
					<For each={SMILEYS}>
						{(s) => (
							<button
								type="button"
								disabled={props.disabled}
								aria-label={s.label}
								aria-pressed={props.value.value === s.value}
								onClick={() => props.onChange({ value: s.value })}
								data-on={props.value.value === s.value}
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
