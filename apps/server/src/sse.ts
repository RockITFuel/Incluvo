/**
 * Minimal in-process Server-Sent Events hub with **per-user targeting**.
 *
 * Every connected client is registered under its authenticated `userId`, so a
 * handler can fan an event out to a precise set of recipients with
 * `publishTo(event, recipientUserIds)` — a frame is only ever delivered to the
 * controllers of the listed users, never globally. The old global `publish`
 * fan-out (which leaked every user's private data to every socket) has been
 * removed.
 *
 * For multi-instance deployments swap this for a Redis/Postgres LISTEN-NOTIFY
 * backed bus that carries the recipient set in the message envelope.
 */
const encoder = new TextEncoder();

/** Live SSE controllers, keyed by the authenticated user they belong to. */
const clientsByUser = new Map<
	string,
	Set<ReadableStreamDefaultController<Uint8Array>>
>();

export interface ServerEvent {
	type: string;
	// biome-ignore lint: arbitrary event payload
	payload?: unknown;
}

/**
 * Deliver an event ONLY to the controllers of the given users. De-dupes the
 * recipient list and silently drops controllers that have already closed.
 */
export function publishTo(
	event: ServerEvent,
	recipientUserIds: Iterable<string>,
): void {
	const frame = encoder.encode(
		`event: ${event.type}\ndata: ${JSON.stringify(event.payload ?? null)}\n\n`,
	);
	const seen = new Set<string>();
	for (const userId of recipientUserIds) {
		if (!userId || seen.has(userId)) continue;
		seen.add(userId);
		const controllers = clientsByUser.get(userId);
		if (!controllers) continue;
		for (const controller of controllers) {
			try {
				controller.enqueue(frame);
			} catch {
				controllers.delete(controller);
			}
		}
		if (controllers.size === 0) clientsByUser.delete(userId);
	}
}

/**
 * Build a streaming `Response` for the `/sse/events` endpoint, registered to a
 * single authenticated user. The caller (`index.ts`) authenticates the request
 * and passes the resolved `userId`.
 */
export function sseResponse(
	userId: string,
	corsHeaders: Record<string, string>,
): Response {
	let heartbeat: ReturnType<typeof setInterval>;
	let self: ReadableStreamDefaultController<Uint8Array>;

	const register = (controller: ReadableStreamDefaultController<Uint8Array>) => {
		let set = clientsByUser.get(userId);
		if (!set) {
			set = new Set();
			clientsByUser.set(userId, set);
		}
		set.add(controller);
	};

	const unregister = (
		controller: ReadableStreamDefaultController<Uint8Array>,
	) => {
		const set = clientsByUser.get(userId);
		if (!set) return;
		set.delete(controller);
		if (set.size === 0) clientsByUser.delete(userId);
	};

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			self = controller;
			register(controller);
			controller.enqueue(encoder.encode(`event: ready\ndata: null\n\n`));
			// Keep proxies from closing an idle connection.
			heartbeat = setInterval(() => {
				try {
					controller.enqueue(encoder.encode(`: ping\n\n`));
				} catch {
					clearInterval(heartbeat);
				}
			}, 25_000);
		},
		cancel() {
			clearInterval(heartbeat);
			unregister(self);
		},
	});

	return new Response(stream, {
		headers: {
			"content-type": "text/event-stream",
			"cache-control": "no-cache",
			connection: "keep-alive",
			...corsHeaders,
		},
	});
}
