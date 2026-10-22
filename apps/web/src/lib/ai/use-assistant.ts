import { createSignal, onSettled } from "solid-js";
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
	// Plain mirrors of the signals: Solid 2 shows a write only after it flushes,
	// and the stream appends faster than that.
	let current: AssistantMessage[] = [];
	let busy = false;
	const commit = (next: AssistantMessage[]) => {
		current = next;
		setMessages(() => next);
	};
	/** Replaces the last turn when it is the assistant's. */
	const updateLast = (fn: (last: Extract<AssistantMessage, { role: "assistant" }>) => AssistantMessage | null) => {
		const last = current[current.length - 1];
		if (!last || last.role !== "assistant") return;
		const next = fn(last);
		commit(next ? [...current.slice(0, -1), next] : current.slice(0, -1));
	};

	async function send(text: string) {
		const content = text.trim();
		if (!content || busy) return;

		busy = true;
		setError(null);
		const next: AssistantMessage[] = [...current, { role: "user", content }];
		// Push the user turn and an empty assistant turn we fill as tokens arrive.
		commit([...next, { role: "assistant", content: "" }]);
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
					const delta = frame.delta;
					updateLast((last) => ({ role: "assistant", content: last.content + delta }));
				}
				if ("done" in frame) {
					const signature = frame.signature;
					updateLast((last) => ({ ...last, signature }));
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
			updateLast((last) => (last.content === "" ? null : last));
		} finally {
			// A reset() during the stream already freed the slot for a new one.
			if (controller?.signal === signal) {
				busy = false;
				setStreaming(false);
			}
		}
	}

	function reset() {
		controller?.abort();
		controller = undefined;
		busy = false;
		commit([]);
		setStreaming(false);
		setError(null);
	}

	// Stop consuming the stream when the hosting component unmounts.
	onSettled(() => () => controller?.abort());

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
