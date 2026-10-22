import { ORPCError } from "@orpc/client";
import { redirect } from "@tanstack/solid-router";
import { clearMe, isUnauthenticated } from "./auth/me";

/**
 * What a route loader hands its page: the data, or why there is none. A loader
 * never throws for a failed request, so the page decides how "no access" and
 * "couldn't load" look (components/ui/route-data-view.tsx), and the layout
 * around it stays usable.
 */
export type RouteData<T> =
	| { access: "granted"; value: T }
	| { access: "denied" }
	| { access: "error"; error: unknown };

const isDenied = (error: unknown) =>
	error instanceof ORPCError && (error.code === "FORBIDDEN" || error.status === 403);

const isAbort = (error: unknown) =>
	error instanceof DOMException && error.name === "AbortError";

/** Errors worth a retry: the network or the server, not a refusal or a bad request. */
const isTransient = (error: unknown) =>
	!(error instanceof ORPCError) ||
	error.status >= 500 ||
	error.status === 408 ||
	error.status === 429;

const wait = (ms: number, signal: AbortSignal) =>
	new Promise<void>((resolve, reject) => {
		const timer = setTimeout(resolve, ms);
		signal.addEventListener("abort", () => {
			clearTimeout(timer);
			reject(signal.reason);
		});
	});

/**
 * Runs a loader request, retrying a transient failure twice (250 ms, 500 ms).
 * A lost session sends you to the login; an abort (you navigated away) is
 * rethrown so the router drops it.
 *
 *   loader: ({ abortController }) =>
 *     loadRouteData(abortController.signal, (signal) =>
 *       client.tasks.list({}, { signal })),
 */
export async function loadRouteData<T>(
	signal: AbortSignal,
	request: (signal: AbortSignal) => Promise<T>,
): Promise<RouteData<T>> {
	for (let attempt = 0; ; attempt++) {
		try {
			return { access: "granted", value: await request(signal) };
		} catch (error) {
			if (isAbort(error) || signal.aborted) throw error;
			if (isUnauthenticated(error)) {
				clearMe();
				throw redirect({ to: "/login" });
			}
			if (isDenied(error)) return { access: "denied" };
			if (attempt >= 2 || !isTransient(error)) return { access: "error", error };
			await wait(250 * 2 ** attempt, signal);
		}
	}
}

/** The value when granted, else `undefined`: for data a page can do without. */
export function granted<T>(data: RouteData<T>): T | undefined {
	return data.access === "granted" ? data.value : undefined;
}
