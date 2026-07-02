import { useQuery } from "@tanstack/solid-query";
import { Send, Sparkles } from "lucide-solid";
import { createEffect, createSignal, For, on, Show } from "solid-js";
import { useAssistant } from "../../lib/ai/use-assistant";
import { orpc } from "../../lib/orpc";
import { MockBanner } from "./mock-banner";

/**
 * AI-advies paneel (#22), styled as the sidebar card from the approved
 * "Coachplan invullen" prototype. A calm, WCAG-AA panel that streams
 * interventie-advies token-by-token over the oRPC Event Iterator (via the thin
 * `useAssistant` hook). Embed it in the coach-review by passing `submissionId`
 * + `coachplanContext`; the "Wens" chip and the suggestion cards surface the
 * prompt-starters, and "Meer adviezen" asks the model to continue.
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
		<section class="card" aria-label="AI-advies over interventies">
			<div class="card-head">
				<h3 style={{ "font-size": "15px" }}>{props.title ?? "AI-advies"}</h3>
				<span class="chip primary">
					<Sparkles class="size-3" aria-hidden="true" /> Wens
				</span>
			</div>
			<div
				style={{
					"font-size": "13px",
					color: "rgb(var(--muted))",
					"margin-bottom": "12px",
				}}
			>
				Op basis van plan + leervoorkeuren — als concept.
			</div>

			<MockBanner mock={isMock()} model={providerQuery.data?.model} />

			{/* Conversation / suggestions */}
			<div
				ref={scrollEl}
				style={{ "max-height": "18rem", "overflow-y": "auto", "margin-top": "8px" }}
				aria-live="polite"
				aria-busy={assistant.streaming() ? "true" : "false"}
			>
				<Show
					when={assistant.messages().length > 0}
					fallback={
						<div class="ds-col" style={{ gap: "8px" }}>
							<For each={STARTERS}>
								{(s) => (
									<button
										type="button"
										style={{
											padding: "10px 12px",
											background: "rgb(var(--bg-2))",
											"border-radius": "10px",
											"font-size": "13px",
											"font-weight": "500",
											"text-align": "left",
											border: "0",
											cursor: "pointer",
											width: "100%",
										}}
										onClick={() => {
											setDraft("");
											void assistant.send(s);
										}}
									>
										{s}
									</button>
								)}
							</For>
						</div>
					}
				>
					<ul class="ds-col" style={{ gap: "8px" }}>
						<For each={assistant.messages()}>
							{(m) => (
								<li
									style={{ "max-width": "92%" }}
									classList={{
										"self-end ml-auto": m.role === "user",
										"self-start": m.role === "assistant",
									}}
								>
									<div
										style={{
											padding: "10px 12px",
											"border-radius": "10px",
											"font-size": "13px",
											"line-height": "1.5",
											"white-space": "pre-wrap",
											background:
												m.role === "user"
													? "rgb(var(--primary))"
													: "rgb(var(--bg-2))",
											color: m.role === "user" ? "#fff" : "rgb(var(--ink))",
										}}
									>
										<Show
											when={m.content}
											fallback={
												<span
													style={{ color: "rgb(var(--muted))" }}
													aria-label="Advies wordt gegenereerd"
												>
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
					<p
						role="alert"
						style={{
							"margin-top": "10px",
							color: "rgb(var(--danger))",
							"font-size": "12px",
						}}
					>
						{assistant.error()}
					</p>
				</Show>
			</div>

			{/* "Meer adviezen" — ask the model to continue with more suggestions. */}
			<Show when={assistant.messages().length > 0}>
				<button
					type="button"
					class="btn ghost sm"
					style={{ "margin-top": "10px", width: "100%", "justify-content": "center" }}
					disabled={assistant.streaming()}
					onClick={() => void assistant.send("Geef nog een paar concrete adviezen.")}
				>
					Meer adviezen
				</button>
			</Show>

			{/* Composer */}
			<form
				class="ds-row"
				style={{ "align-items": "flex-end", gap: "8px", "margin-top": "12px" }}
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
					class="textarea"
					style={{ "min-height": "44px", "font-size": "13px", resize: "none", flex: "1" }}
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
				<button
					type="submit"
					class="btn primary sm"
					disabled={assistant.streaming() || !draft().trim()}
					aria-label="Verstuur vraag"
				>
					<Send class="size-3.5" aria-hidden="true" />
					{assistant.streaming() ? "Bezig…" : "Vraag"}
				</button>
			</form>
		</section>
	);
}
