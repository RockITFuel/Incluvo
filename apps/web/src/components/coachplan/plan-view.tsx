import { useQuery } from "@tanstack/solid-query";
import { For, Show, createMemo } from "solid-js";
import { orpc } from "../../lib/orpc";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import { type AnswerValue, type QuestionDTO, renderAnswerText } from "./question-input";

/**
 * A plan version, read-only, as the leerling sees it: their own answers per
 * theme, then — once the coach has shared the plan — the coach's part and
 * the leervoorkeuren (the server leaves those out before sharing).
 */
export function PlanView(props: { submissionId: string }) {
	const query = useQuery(() =>
		orpc.coachplan.getSubmission.queryOptions({ input: { id: props.submissionId } }),
	);
	const answers = createMemo(() => {
		const map: Record<string, AnswerValue & { skipped: boolean }> = {};
		for (const a of query.data?.answers ?? []) {
			map[a.questionId] = {
				value: a.value,
				valueJson: (a.valueJson as string[] | null) ?? null,
				skipped: a.deliberatelySkipped,
			};
		}
		return map;
	});
	const questions = () => (query.data?.questions ?? []) as unknown as QuestionDTO[];
	const coachQuestions = () =>
		questions().filter((q) => q.section === "coach" && answers()[q.id]);
	const themes = createMemo(() => {
		const order: string[] = [];
		for (const q of questions()) {
			if (q.section !== "leerling") continue;
			const t = q.options?.theme ?? "Vragen";
			if (!order.includes(t)) order.push(t);
		}
		return order;
	});

	const Answer = (p: { q: QuestionDTO }) => {
		const a = () => answers()[p.q.id];
		const rendered = () => renderAnswerText(p.q, a());
		return (
			<div class="border-line-2 border-b pb-3.5 last:border-b-0">
				<p class="font-medium text-ink-2">{p.q.label}</p>
				<div class="mt-1.5 text-body">
					<Show
						when={!a()?.skipped}
						fallback={<Badge variant="warning">Overgeslagen</Badge>}
					>
						<Show when={rendered().kind === "chips"}>
							<div class="flex flex-wrap gap-1.5">
								<For each={rendered().chips}>{(c) => <Badge variant="primary">{c}</Badge>}</For>
							</div>
						</Show>
						<Show when={rendered().kind === "text"}>
							<p class="whitespace-pre-wrap text-ink">{rendered().text}</p>
						</Show>
						<Show when={rendered().kind === "empty"}>
							<span class="text-muted italic">Niet ingevuld</span>
						</Show>
					</Show>
				</div>
			</div>
		);
	};

	return (
		<Show when={query.data} fallback={<p class="text-muted">Laden…</p>}>
			<div class="flex flex-col gap-5">
				<Show when={coachQuestions().length > 0}>
					<Card class="border-primary">
						<h2 class="mb-3 font-head text-h3 text-ink">Van je coach</h2>
						<div class="flex flex-col gap-3.5">
							<For each={coachQuestions()}>{(q) => <Answer q={q} />}</For>
						</div>
						<Show when={(query.data?.learningPreferences.length ?? 0) > 0}>
							<h3 class="mt-4 mb-2 font-medium text-ink-2">Zo leer je graag</h3>
							<div class="flex flex-wrap gap-1.5">
								<For each={query.data?.learningPreferences}>
									{(l) => <Badge variant="accent">{l.replaceAll("_", " ")}</Badge>}
								</For>
							</div>
						</Show>
					</Card>
				</Show>
				<For each={themes()}>
					{(theme) => (
						<Card>
							<h2 class="mb-3 font-head text-h3 text-ink">{theme}</h2>
							<div class="flex flex-col gap-3.5">
								<For
									each={questions().filter(
										(q) => q.section === "leerling" && (q.options?.theme ?? "Vragen") === theme,
									)}
								>
									{(q) => <Answer q={q} />}
								</For>
							</div>
						</Card>
					)}
				</For>
			</div>
		</Show>
	);
}
