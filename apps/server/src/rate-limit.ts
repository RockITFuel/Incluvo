/**
 * Small reusable in-memory fixed-window rate limiter (H3).
 *
 * Intended use: the AI and PDF procedures (and any other expensive, abuse-prone
 * endpoint) should call `rateLimit()` with a stable key BEFORE doing the
 * expensive work, and reject the request (e.g. throw an oRPC `TOO_MANY_REQUESTS`
 * error) when it returns `false`.
 *
 * Keying guidance:
 *   - Per-user:  `rateLimit(`ai:advice:${session.user.id}`, { max: 20, windowMs: 60_000 })`
 *   - Per-IP:    `rateLimit(`pdf:${clientIp}`, { max: 10, windowMs: 60_000 })`
 *   Prefix the key with the operation name so different operations don't share a
 *   budget. Combine user + IP if you want to limit both dimensions.
 *
 * This is process-local (a `Map`), so on a horizontally-scaled deployment each
 * instance has its own budget. That is acceptable as a defence-in-depth layer on
 * top of an edge/proxy limiter; for hard global limits use a shared store
 * (Redis) instead. Stale buckets are pruned opportunistically on access and via
 * a periodic sweep, so memory use stays bounded.
 *
 * NOTE for the DATA agent: this util is intentionally standalone. Applying it to
 * the AI/PDF *procedures* (procedures/* and coachplan/index.ts) is your job —
 * those files are owned by other agents and were not touched here.
 */

export interface RateLimitOptions {
	/** Maximum number of allowed hits within the window. */
	max: number;
	/** Window length in milliseconds. */
	windowMs: number;
}

interface Bucket {
	/** Hit count in the current window. */
	count: number;
	/** Epoch ms when the current window resets. */
	resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** How often to sweep expired buckets (ms). */
const SWEEP_INTERVAL_MS = 5 * 60_000;
let lastSweep = 0;

function sweep(now: number): void {
	if (now - lastSweep < SWEEP_INTERVAL_MS) return;
	lastSweep = now;
	for (const [key, bucket] of buckets) {
		if (bucket.resetAt <= now) buckets.delete(key);
	}
}

/**
 * Fixed-window limiter. Returns `true` if this hit is allowed (and records it),
 * `false` if the caller has exceeded `max` within the current window.
 *
 * @example
 *   if (!rateLimit(`ai:translate:${userId}`, { max: 30, windowMs: 60_000 })) {
 *     throw errors.TOO_MANY_REQUESTS();
 *   }
 */
export function rateLimit(key: string, opts: RateLimitOptions): boolean {
	const now = Date.now();
	sweep(now);

	const bucket = buckets.get(key);
	if (!bucket || bucket.resetAt <= now) {
		buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
		return true;
	}

	if (bucket.count >= opts.max) return false;

	bucket.count += 1;
	return true;
}

/**
 * Inspect remaining budget without consuming a hit. Useful for surfacing
 * `Retry-After` / `X-RateLimit-Remaining` style metadata to callers.
 */
export function rateLimitStatus(
	key: string,
	opts: RateLimitOptions,
): { remaining: number; resetAt: number } {
	const now = Date.now();
	const bucket = buckets.get(key);
	if (!bucket || bucket.resetAt <= now) {
		return { remaining: opts.max, resetAt: now + opts.windowMs };
	}
	return {
		remaining: Math.max(0, opts.max - bucket.count),
		resetAt: bucket.resetAt,
	};
}

/** Test helper: clear all in-memory buckets. */
export function _resetRateLimits(): void {
	buckets.clear();
	lastSweep = 0;
}
