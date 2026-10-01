import { createSignal, onCleanup } from "solid-js";
import { client } from "../orpc";
import { friendlyError } from "../errors";

/**
 * Thin local AI-assistant hook (backlog #22) wrapping the **oRPC Event
 * Iterator** stream from `ai.assistant`.
 *
 * ── useChat decision (docs/decisions/tooling.md) ───────────────────────────
 * `@tanstack/ai-solid`'s `useChat` is built around a `@tanstack/ai-client`
 * transport that speaks the AI-SDK data-stream HTTP protocol — it does not
 * cleanly consume an oRPC `AsyncIteratorObject`. The tooling decision says to
 * keep TanStack AI behind a thin local hook precisely so we can fall back to the
 * stable hand-rolled Event-Iterator client without touching feature code. We
 * take that fallback here: this hook drives the stream directly over the typed
 * oRPC client (`client.ai.assistant`), which is the stable, sovereign,
 * dependency-free path. The hook's surface (`messages`, `send`, `streaming`)
 * mirrors a `useChat` so it can be swapped for the alpha later if it matures.
 *
 * The server handler is an async generator; each frame is either
 *   { meta: { mock, model } } | { delta: string } | { done: true, signature }.
 * The signature is kept with the assistant turn and sent back with the history:
 * the server only accepts assistant turns it signed itself.
 */

export type AssistantMessage =
	| { role: "user"; content: string }
	| { role: "assistant"; content: string; signature?: string };

export interface UseAssistantOptions {
	/** The coachplan whose real answers the server composes the context from. */
	submissionId: () => string;
}

export function useAssistant(options: UseAssistantOptions) {
	const [messages, setMessages] = createSignal<AssistantMessage[]>([]);
	const [streaming, setStreaming] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);
	const [mock, setMock] = createSignal<boolean | null>(null);

	// Aborts the in-flight stream so navigating away or reset() stops consuming
	// the (paid) LLM stream and writing into a cleared conversation.
	let controller: AbortController | undefined;

	async function send(text: string) {
		const content = text.trim();
		if (!content || streaming()) return;

		setError(null);
		const history = messages();
		const next: AssistantMessage[] = [...history, { role: "user", content }];
		// Push the user turn and an empty assistant turn we fill as tokens arrive.
		setMessages([...next, { role: "assistant", content: "" }]);
		setStreaming(true);

		// Cancel any previous stream and open a fresh abort scope for this turn.
		controller?.abort();
		controller = new AbortController();
		const { signal } = controller;

		try {
			// Only completed (signed) answers go back; an answer that was cut off
			// has no signature and is left out.
			const turns: Parameters<typeof client.ai.assistant>[0]["messages"] = [];
			for (const m of next) {
				if (m.role === "user") turns.push(m);
				else if (m.signature) {
					turns.push({ role: "assistant", content: m.content, signature: m.signature });
				}
			}
			// The server takes at most 20 turns and wants a question first.
			while (turns.length > 19 || turns[0]?.role === "assistant") turns.shift();
			const iterator = await client.ai.assistant(
				{ submissionId: options.submissionId(), messages: turns },
				{ signal },
			);

			for await (const frame of iterator) {
				if (signal.aborted) break;
				if ("meta" in frame) {
					setMock(frame.meta.mock);
					continue;
				}
				if ("delta" in frame) {
					setMessages((prev) => {
						const copy = [...prev];
						const last = copy[copy.length - 1];
						if (last && last.role === "assistant") {
							copy[copy.length - 1] = {
								role: "assistant",
								content: last.content + frame.delta,
							};
						}
						return copy;
					});
				}
				if ("done" in frame) {
					setMessages((prev) => {
						const copy = [...prev];
						const last = copy[copy.length - 1];
						if (last && last.role === "assistant") {
							copy[copy.length - 1] = { ...last, signature: frame.signature };
						}
						return copy;
					});
				}
			}
		} catch (err) {
			// Aborted streams are intentional — don't surface them as errors or
			// touch the (already-cleared) conversation.
			if (signal.aborted) return;
			setError(
				friendlyError(err, "Er ging iets mis bij het ophalen van het advies."),
			);
			// Drop the empty assistant placeholder on failure.
			setMessages((prev) => {
				const copy = [...prev];
				const last = copy[copy.length - 1];
				if (last && last.role === "assistant" && last.content === "") copy.pop();
				return copy;
			});
		} finally {
			setStreaming(false);
		}
	}

	function reset() {
		controller?.abort();
		controller = undefined;
		setMessages([]);
		setError(null);
	}

	// Stop consuming the stream when the hosting component unmounts.
	onCleanup(() => controller?.abort());

	return {
		messages,
		streaming,
		error,
		/** True when the server is using the offline MOCK provider. */
		mock,
		send,
		reset,
	};
}
