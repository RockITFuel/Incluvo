import { onCleanup, onMount } from "solid-js";

/**
 * Shared Server-Sent-Events transport for `/sse/events`.
 *
 * The browser limits concurrent EventSource connections per origin (HTTP/1.1:
 * ~6 across the whole site). Opening one per `useServerEvent` call quickly
 * starves the connection pool, so instead every subscriber multiplexes over a
 * single, lazily-opened, module-level EventSource. The connection is opened on
 * the first subscription and closed again once the last subscriber unmounts
 * (ref-counted), so navigating away from SSE-using pages releases the socket.
 */
type Handler = (payload: unknown) => void;

let source: EventSource | null = null;
/** Per-event-type subscriber registry. Each entry is a live handler set. */
const registry = new Map<string, Set<{ current: Handler }>>();
/** The single DOM listener installed per event type on the shared source. */
const domListeners = new Map<string, EventListener>();
let refCount = 0;

function ensureSource(): EventSource {
	if (!source) {
		source = new EventSource("/sse/events", { withCredentials: true });
	}
	return source;
}

function ensureDomListener(type: string) {
	if (domListeners.has(type)) return;
	const listener: EventListener = (event) => {
		let payload: unknown = null;
		try {
			payload = JSON.parse((event as MessageEvent).data);
		} catch {
			/* keep null */
		}
		// Snapshot so a handler that (un)subscribes mid-dispatch can't corrupt
		// the iteration, and always read the *current* handler ref (no stale
		// closure freeze).
		const subs = registry.get(type);
		if (!subs) return;
		// oxlint-disable-next-line unicorn/no-useless-spread -- deliberate snapshot (see above)
		for (const ref of [...subs]) ref.current(payload);
	};
	domListeners.set(type, listener);
	ensureSource().addEventListener(type, listener);
}

function teardownIfIdle() {
	if (refCount > 0) return;
	if (source) {
		for (const [type, listener] of domListeners) {
			source.removeEventListener(type, listener);
		}
		source.close();
		source = null;
	}
	domListeners.clear();
	registry.clear();
}

/**
 * Subscribe to a server event type emitted over `/sse/events`.
 *
 *   useServerEvent("item.created", () => refetch());
 *
 * All calls share one underlying EventSource. The handler is read live on every
 * dispatch, so changing the captured closure between renders is safe.
 */
export function useServerEvent(type: string, handler: Handler) {
	// A mutable ref so the shared dispatcher always invokes the latest handler.
	const ref = { current: handler };
	ref.current = handler;

	onMount(() => {
		ensureSource();
		ensureDomListener(type);
		let subs = registry.get(type);
		if (!subs) {
			subs = new Set();
			registry.set(type, subs);
		}
		subs.add(ref);
		refCount += 1;

		onCleanup(() => {
			const set = registry.get(type);
			if (set) {
				set.delete(ref);
				if (set.size === 0) registry.delete(type);
			}
			refCount = Math.max(0, refCount - 1);
			teardownIfIdle();
		});
	});
}
