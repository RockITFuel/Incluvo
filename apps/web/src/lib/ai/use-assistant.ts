import { createSignal } from "solid-js";
import { client } from "../orpc";

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
 *   { meta: { mock, model } } | { delta: string } | { done: true }.
 */

export interface AssistantMessage {
	role: "user" | "assistant";
	content: string;
}

export interface UseAssistantOptions {
	submissionId?: string;
	/** Free-text coachplan context injected into the system prompt. */
	coachplanContext?: () => string | undefined;
}

export function useAssistant(options: UseAssistantOptions = {}) {
	const [messages, setMessages] = createSignal<AssistantMessage[]>([]);
	const [streaming, setStreaming] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);
	const [mock, setMock] = createSignal<boolean | null>(null);

	async function send(text: string) {
		const content = text.trim();
		if (!content || streaming()) return;

		setError(null);
		const history = messages();
		const next: AssistantMessage[] = [...history, { role: "user", content }];
		// Push the user turn and an empty assistant turn we fill as tokens arrive.
		setMessages([...next, { role: "assistant", content: "" }]);
		setStreaming(true);

		try {
			const iterator = await client.ai.assistant({
				submissionId: options.submissionId,
				coachplanContext: options.coachplanContext?.(),
				messages: next,
			});

			for await (const frame of iterator) {
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
				// { done: true } ends the loop naturally.
			}
		} catch (err) {
			setError(
				err instanceof Error
					? err.message
					: "Er ging iets mis bij het ophalen van het advies.",
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
		setMessages([]);
		setError(null);
	}

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
