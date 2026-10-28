import { createMemo, createSignal, createStore, For, Show } from "solid-js";
import { Badge } from "../ui/badge";
import { Dialog } from "../ui/dialog";
import { SegmentedControl } from "../ui/segmented-control";
import { Textarea } from "../ui/text-field";
import { type AnswerValue, QuestionInput, type QuestionDTO } from "./question-input";

export type PreviewQuestion = QuestionDTO & {
	leerlingLabel: string | null;
	visibleToLeerling: boolean;
};

type View = "coach" | "leerling";

const VIEWS: { value: View; label: string }[] = [
	{ value: "coach", label: "Coach" },
	{ value: "leerling", label: "Leerling" },
];

/** The leerling reads their own wording when there is one (INC-31). */
const forLeerling = (q: PreviewQuestion): PreviewQuestion => ({
	...q,
	label: q.leerlingLabel?.trim() || q.label,
});

/** Questions per theme, in form order (as the wizard and the overview group them). */
function byTheme(questions: PreviewQuestion[]) {
	const groups: { theme: string; questions: PreviewQuestion[] }[] = [];
	for (const q of questions) {
		const theme = q.options?.theme ?? "Vragen";
		const group = groups.find((g) => g.theme === theme);
		if (group) group.questions.push(q);
		else groups.push({ theme, questions: [q] });
	}
	return groups;
}

/**
 * INC-32: the form as the coach and the leerling see it, from the editor.
 * Try-out answers live in this dialog only: nothing is saved and no plan is
 * made. The questions follow the editor, so saved changes show right away.
 */
export function FormPreview(props: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	name: string;
	questions: PreviewQuestion[];
}) {
	const [view, setView] = createSignal<View>("coach");
	const [answers, setAnswers] = createStore<Record<string, AnswerValue>>({});
	const answer = (q: PreviewQuestion, next: AnswerValue) =>
		setAnswers((draft) => {
			draft[q.id] = next;
		});

	const leerlingPart = createMemo(() =>
		props.questions.filter((q) => q.section === "leerling"),
	);
	const coachPart = createMemo(() => props.questions.filter((q) => q.section === "coach"));
	// What the leerling reads of the coach part once the plan is shared (INC-7).
	const sharedCoachPart = createMemo(() =>
		coachPart()
			.filter((q) => q.visibleToLeerling)
			.map(forLeerling),
	);

	const Field = (p: { q: PreviewQuestion; asCoach?: boolean }) => (
		<div class="flex flex-col gap-2 border-line-2 border-b pb-4 last:border-b-0">
			<div class="flex flex-wrap items-start justify-between gap-2">
				<p class="font-medium text-ink [overflow-wrap:anywhere]">
					{p.q.label}
					<Show when={p.q.required}>
						{" "}
						<Badge variant="accent">Verplicht</Badge>
					</Show>
				</p>
				<Show when={!p.q.visibleToLeerling && p.q.section === "leerling"}>
					<Badge variant="warning">Na inleveren verborgen voor leerling</Badge>
				</Show>
			</div>
			<Show when={p.q.helpText}>
				<p class="text-small text-muted">{p.q.helpText}</p>
			</Show>
			{/* The coach page writes text questions in a text area. */}
			<Show
				when={p.asCoach && (p.q.type === "short_text" || p.q.type === "long_text")}
				fallback={
					<QuestionInput
						question={p.q}
						value={answers[p.q.id] ?? {}}
						onChange={(next) => answer(p.q, next)}
					/>
				}
			>
				<Textarea
					aria-label={p.q.label}
					placeholder="Schrijf hier je observatie."
					value={answers[p.q.id]?.value ?? ""}
					onInput={(e) => answer(p.q, { value: e.currentTarget.value })}
				/>
			</Show>
		</div>
	);

	return (
		<Dialog
			open={props.open}
			onOpenChange={props.onOpenChange}
			title={`Voorbeeld: ${props.name}`}
			description="Probeer de vragen uit. Wat je hier invult, wordt niet opgeslagen."
			class="flex max-h-[90vh] max-w-3xl flex-col overflow-y-auto p-4 sm:p-6"
		>
			<div class="flex flex-col gap-4">
				<div class="flex flex-wrap items-center gap-3">
					<SegmentedControl
						aria-label="Weergave"
						options={VIEWS}
						value={view()}
						onChange={setView}
					/>
					<p class="text-small text-ink-2" aria-live="polite">
						{view() === "coach" ? "Je ziet het formulier als coach." : "Je ziet het formulier als leerling."}
					</p>
				</div>

				<Show when={props.questions.length === 0}>
					<p class="text-muted">Dit formulier heeft nog geen vragen.</p>
				</Show>

				<Show when={view() === "leerling"}>
					<Show when={leerlingPart().length === 0 && props.questions.length > 0}>
						<p class="text-muted">Er zijn geen vragen voor de leerling.</p>
					</Show>
					<For each={byTheme(leerlingPart().map(forLeerling))}>
						{(group) => (
							<section class="flex flex-col gap-4 rounded-3 border border-line p-4">
								<h3 class="font-head text-h3 text-ink">{group.theme}</h3>
								<For each={group.questions}>{(q) => <Field q={q} />}</For>
							</section>
						)}
					</For>
					<Show when={sharedCoachPart().length > 0}>
						<section class="flex flex-col gap-2 rounded-3 border border-dashed border-line p-4">
							<h3 class="font-head text-h3 text-ink">Van je coach</h3>
							<p class="text-small text-muted">
								Deze vragen ziet de leerling met het antwoord van de coach, als de
								coach het plan heeft gedeeld.
							</p>
							<ul class="list-disc pl-5 text-body text-ink-2">
								<For each={sharedCoachPart()}>
									{(q) => <li class="[overflow-wrap:anywhere]">{q.label}</li>}
								</For>
							</ul>
						</section>
					</Show>
				</Show>

				<Show when={view() === "coach"}>
					<Show when={coachPart().length === 0 && props.questions.length > 0}>
						<p class="text-muted">Er zijn geen vragen voor de coach.</p>
					</Show>
					<For each={byTheme(coachPart())}>
						{(group) => (
							<section class="flex flex-col gap-4 rounded-3 border border-line p-4">
								<h3 class="font-head text-h3 text-ink">{group.theme}</h3>
								<For each={group.questions}>{(q) => <Field q={q} asCoach />}</For>
							</section>
						)}
					</For>
					<Show when={leerlingPart().length > 0}>
						<section class="flex flex-col gap-2 rounded-3 border border-dashed border-line p-4">
							<h3 class="font-head text-h3 text-ink">Antwoorden van de leerling</h3>
							<p class="text-small text-muted">
								Naast het coachgedeelte leest de coach de antwoorden van de leerling
								bij deze vragen.
							</p>
							<ul class="list-disc pl-5 text-body text-ink-2">
								<For each={leerlingPart()}>
									{(q) => <li class="[overflow-wrap:anywhere]">{q.label}</li>}
								</For>
							</ul>
						</section>
					</Show>
				</Show>
			</div>
		</Dialog>
	);
}
