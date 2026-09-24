import { useQuery } from "@tanstack/solid-query";
import { Send, Sparkles } from "lucide-solid";
import { createEffect, createSignal, For, on, Show } from "solid-js";
import { useAssistant } from "../../lib/ai/use-assistant";
import { orpc } from "../../lib/orpc";
import { Select } from "../ui/select";
import { MockBanner } from "./mock-banner";

/**
 * AI-advies paneel (#22), styled as the sidebar card from the approved
 * "Coachplan invullen" prototype. A calm, WCAG-AA panel that streams
 * interventie-advies token-by-token over the oRPC Event Iterator (via the thin
 * `useAssistant` hook). The "Wens" chip and the suggestion cards surface the
 * prompt-starters, and "Meer adviezen" asks the model to continue.
 *
 * Embedded in the coach-review by passing `submissionId` + `coachplanContext`
 * (the plan is then fixed and the picker is hidden); standalone — the
 * `/assistent` werkbank — it lets the coach pick a plan from their review inbox,
 * exactly like the TranscriptionPanel. Without a plan the server has no
 * coachformulier to read, so the composer stays disabled rather than silently
 * advising about nobody (feedback Mark 15-07-2026, punt 5).
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
	const [pickedId, setPickedId] = createSignal<string | undefined>();
	let scrollEl: HTMLDivElement | undefined;

	// Provider mode for the static banner (the stream also reports it live).
	const providerQuery = useQuery(() => orpc.ai.provider.queryOptions());
	// Only needed for the standalone picker; harmless (and cached) when embedded.
	const inboxQuery = useQuery(() => orpc.coachplan.inbox.queryOptions());

	// The effective plan: the embedding page's submission, else the picked one.
	const effectiveId = () => props.submissionId ?? pickedId();

	const submissionOptions = () =>
		(inboxQuery.data ?? []).map((row) => ({
			value: row.submission.id,
			label: `${row.leerlingName} · ${row.templateName}`,
		}));

	const assistant = useAssistant({
		submissionId: effectiveId,
		coachplanContext: () => props.coachplanContext,
	});

	// Switching plans must not carry the previous leerling's turns into the next
	// conversation — the history is resent verbatim on every send.
	createEffect(
		on(effectiveId, () => assistant.reset(), { defer: true }),
	);

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
				<h3 style={{ "font-size": "0.9375rem" }}>{props.title ?? "AI-advies"}</h3>
				<span class="chip primary">
					<Sparkles class="size-3" aria-hidden="true" /> Wens
				</span>
			</div>
			<div
				style={{
					"font-size": "0.8125rem",
					color: "rgb(var(--muted))",
					"margin-bottom": "12px",
				}}
			>
				Op basis van plan + leervoorkeuren — als concept.
			</div>

			<MockBanner mock={isMock()} model={providerQuery.data?.model} />

			{/* Plan picker only when standalone (no submission from the page). */}
			<Show when={!props.submissionId}>
				<div style={{ "margin-bottom": "12px", "margin-top": "12px" }}>
					<Select
						label="Coachplan"
						placeholder="Kies een leerling / coachplan…"
						options={submissionOptions()}
						value={pickedId()}
						onChange={(v) => setPickedId(v)}
						description="Het advies wordt opgesteld op basis van de antwoorden in dit coachformulier."
					/>
					<Show when={!inboxQuery.isPending && submissionOptions().length === 0}>
						<p style={{ "font-size": "0.75rem", color: "rgb(var(--muted))", "margin-top": "6px" }}>
							Er staan nog geen ingediende coachplannen klaar om te bespreken.
						</p>
					</Show>
				</div>
			</Show>

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
											"font-size": "0.8125rem",
											"font-weight": "500",
											"text-align": "left",
											border: "0",
											cursor: "pointer",
											width: "100%",
										}}
										disabled={!effectiveId()}
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
											"font-size": "0.8125rem",
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
							"font-size": "0.75rem",
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
					disabled={assistant.streaming() || !effectiveId()}
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
					style={{ "min-height": "44px", "font-size": "0.8125rem", resize: "none", flex: "1" }}
					placeholder={
						effectiveId()
							? "Stel een vraag over interventies…"
							: "Kies eerst een coachplan…"
					}
					rows={1}
					value={draft()}
					disabled={assistant.streaming() || !effectiveId()}
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
					disabled={assistant.streaming() || !draft().trim() || !effectiveId()}
					aria-label="Verstuur vraag"
				>
					<Send class="size-3.5" aria-hidden="true" />
					{assistant.streaming() ? "Bezig…" : "Vraag"}
				</button>
			</form>
		</section>
	);
}
