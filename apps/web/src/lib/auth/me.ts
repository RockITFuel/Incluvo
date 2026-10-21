import { ORPCError } from "@orpc/client";
import { client, type Output } from "../orpc";
import { clearCachedSession, getCachedSession } from "./session";

export type Me = Output<typeof client.account.me>;

/**
 * `account.me` for the protected layout's `beforeLoad`, which runs on every
 * navigation and on every hover preload. Fresh for 30 s, then reloaded; a
 * transient failure keeps the last known identity instead of logging out.
 * Concurrent callers share one request.
 */
const TTL_MS = 30_000;
let cached: { me: Me; at: number } | null = null;
let inflight: Promise<Me | null> | null = null;

/** True for "no (valid) session": the only failure that sends you to /login. */
export const isUnauthenticated = (error: unknown) =>
	error instanceof ORPCError && (error.status === 401 || error.code === "UNAUTHORIZED");

export function loadMe(): Promise<Me | null> {
	if (cached && Date.now() - cached.at < TTL_MS) return Promise.resolve(cached.me);
	inflight ??= getCachedSession()
		// No session: answer null without asking the API (which would 401).
		.then((session) => (session?.session ? client.account.me() : null))
		.then((me) => {
			if (!me) {
				cached = null;
				return null;
			}
			cached = { me, at: Date.now() };
			return me;
		})
		.catch((error: unknown) => {
			if (isUnauthenticated(error)) {
				cached = null;
				return null;
			}
			if (cached) return cached.me;
			throw error;
		})
		.finally(() => {
			inflight = null;
		});
	return inflight;
}

/** Forget the identity (sign in/out, role switch); the next guard reloads it. */
export function clearMe(): void {
	cached = null;
	clearCachedSession();
}
