import { useQuery } from "@tanstack/solid-query";
import { Send, Sparkles } from "lucide-solid";
import { createEffect, createSignal, For, on, Show } from "solid-js";
import { useAssistant } from "../../lib/ai/use-assistant";
import { orpc } from "../../lib/orpc";
import { Button } from "../ui/button";
import { MockBanner } from "./mock-banner";

/**
 * Reusable AI-assistent paneel (#22). A calm, WCAG-AA chat that streams
 * interventie-advies token-by-token over the oRPC Event Iterator (via the thin
 * `useAssistant` hook). Drop it on the /assistent route or embed it in the
 * coach-review of a coachplan by passing `submissionId` + `coachplanContext`.
 */

const STARTERS = [
	"Welke interventies passen bij deze leerling?",
	"Geef een paar concrete tips voor in de klas.",
	"Hoe kan ik de motivatie van deze leerling vergroten?",
];

export function AssistantPanel(props: {
	submissionId?: string;
	coachplanContext?: string;
	/** Optional heading override. */
	title?: string;
}) {
	const [draft, setDraft] = createSignal("");
	let scrollEl: HTMLDivElement | undefined;

	// Provider mode for the static banner (the stream also reports it live).
	const providerQuery = useQuery(() => orpc.ai.provider.queryOptions());

	const assistant = useAssistant({
		submissionId: props.submissionId,
		coachplanContext: () => props.coachplanContext,
	});

	const isMock = () => assistant.mock() ?? providerQuery.data?.mock ?? null;

	createEffect(
		on(assistant.messages, () => {
			queueMicrotask(() => {
				if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
			});
		}),
	);

	const submit = () => {
		const text = draft().trim();
		if (!text || assistant.streaming()) return;
		setDraft("");
		void assistant.send(text);
	};

	return (
		<section
			class="flex min-h-0 flex-col rounded-3 border border-line bg-surface"
			aria-label="AI-assistent voor interventie-advies"
		>
			<header class="flex items-center gap-3 border-line border-b px-5 py-4">
				<span
					class="grid size-9 place-items-center rounded-2 bg-primary-50 text-primary-700"
					aria-hidden="true"
				>
					<Sparkles class="size-5" />
				</span>
				<div class="min-w-0">
					<h2 class="font-head text-h3 text-ink">
						{props.title ?? "AI-assistent"}
					</h2>
					<p class="text-micro text-muted">
						Advies over interventies op basis van het coachplan — als concept.
					</p>
				</div>
			</header>

			<div class="px-5 pt-4">
				<MockBanner mock={isMock()} model={providerQuery.data?.model} />
			</div>

			{/* Conversation */}
			<div
				ref={scrollEl}
				class="min-h-[18rem] flex-1 overflow-y-auto px-5 py-4"
				aria-live="polite"
				aria-busy={assistant.streaming() ? "true" : "false"}
			>
				<Show
					when={assistant.messages().length > 0}
					fallback={
						<div class="flex flex-col gap-4 py-6 text-center">
							<p class="text-muted text-small">
								Stel een vraag om advies te krijgen, of kies een suggestie.
							</p>
							<ul class="mx-auto flex max-w-md flex-col gap-2">
								<For each={STARTERS}>
									{(s) => (
										<li>
											<button
												type="button"
												class="w-full rounded-2 border border-line bg-bg px-3 py-2 text-left text-body text-ink-2 hover:bg-primary-50 hover:text-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
												onClick={() => {
													setDraft("");
													void assistant.send(s);
												}}
											>
												{s}
											</button>
										</li>
									)}
								</For>
							</ul>
						</div>
					}
				>
					<ul class="flex flex-col gap-3">
						<For each={assistant.messages()}>
							{(m) => (
								<li
									class="max-w-[85%]"
									classList={{
										"self-end ml-auto": m.role === "user",
										"self-start": m.role === "assistant",
									}}
								>
									<div
										class="whitespace-pre-wrap rounded-3 px-3.5 py-2.5 text-body leading-relaxed"
										classList={{
											"bg-primary text-primary-fg": m.role === "user",
											"border border-line bg-bg text-ink": m.role === "assistant",
										}}
									>
										<Show
											when={m.content}
											fallback={
												<span class="text-muted" aria-label="Advies wordt gegenereerd">
													Advies wordt opgesteld…
												</span>
											}
										>
											{m.content}
										</Show>
									</div>
								</li>
							)}
						</For>
					</ul>
				</Show>

				<Show when={assistant.error()}>
					<p role="alert" class="mt-3 text-danger text-small">
						{assistant.error()}
					</p>
				</Show>
			</div>

			{/* Composer */}
			<form
				class="flex items-end gap-2 border-line border-t px-4 py-3"
				onSubmit={(e) => {
					e.preventDefault();
					submit();
				}}
			>
				<label class="sr-only" for="assistant-composer">
					Stel een vraag aan de AI-assistent
				</label>
				<textarea
					id="assistant-composer"
					class="min-h-[2.75rem] flex-1 resize-none rounded-2 border border-line bg-surface px-ctl-x py-ctl-y text-body text-ink placeholder:text-muted-2 focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
					placeholder="Stel een vraag over interventies…"
					rows={1}
					value={draft()}
					disabled={assistant.streaming()}
					onInput={(e) => setDraft(e.currentTarget.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault();
							submit();
						}
					}}
				/>
				<Button
					type="submit"
					disabled={assistant.streaming() || !draft().trim()}
					aria-label="Verstuur vraag"
				>
					<Send class="size-4" aria-hidden="true" />
					{assistant.streaming() ? "Bezig…" : "Vraag"}
				</Button>
			</form>
		</section>
	);
}
