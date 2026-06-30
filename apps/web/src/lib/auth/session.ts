import { authClient, type Session } from "./auth-client";

/**
 * Client-side session cache.
 *
 * Route guards (`_protected` beforeLoad + `requireRole`) both need the session,
 * and `defaultPreload: "intent"` re-runs `beforeLoad` on every nav-link hover.
 * Calling `authClient.getSession()` raw each time floods `/api/auth/get-session`
 * and trips better-auth's rate limiter (429). Caching the result for a short
 * window collapses a burst of navigations/preloads into a single request.
 *
 * On a rate-limit / network error we fall back to the last known session rather
 * than bouncing the user to /login — a transient 429 shouldn't log them out.
 * Mirrors clp's `ensureSession`.
 */

let cached: { data: Session | null; ts: number } | null = null;
const TTL_MS = 30_000;

export async function getCachedSession(): Promise<Session | null> {
	// No session on the server (Bun SPA prerender): no cookies, empty baseURL.
	if (typeof window === "undefined") return null;

	if (cached && Date.now() - cached.ts < TTL_MS) {
		return cached.data;
	}

	try {
		const { data } = await authClient.getSession();
		cached = { data: data ?? null, ts: Date.now() };
		return cached.data;
	} catch (error) {
		// Transient failure (rate limit / offline): keep the user on their last
		// known session instead of forcing a re-login.
		if (cached) return cached.data;
		throw error;
	}
}

/** Drop the cache so the next guard re-validates. Call on sign-out. */
export function clearCachedSession(): void {
	cached = null;
}
