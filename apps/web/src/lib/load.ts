import { createEffect, createSignal } from "solid-js";

/**
 * Component-local data, for what is not a page's data: a dialog that loads its
 * options when it opens, a panel inside a page that pages on its own. Page
 * data belongs in the route loader (lib/route-data.ts).
 *
 * Refetches when `source` changes (a falsy source means "not now"), aborts the
 * request it replaces, and `reload()` asks again.
 *
 *   const catalog = createLoad(
 *     () => props.open && { schoolId: props.schoolId },
 *     (input, signal) => client.courses.catalog(input, { signal }),
 *   );
 *   catalog.data(); catalog.loading(); catalog.error(); catalog.reload();
 */
export function createLoad<S, T>(
	source: () => S | false | null | undefined,
	fetcher: (source: S, signal: AbortSignal) => Promise<T>,
) {
	const [data, setData] = createSignal<T | undefined>(undefined);
	const [error, setError] = createSignal<unknown>(undefined);
	const [loading, setLoading] = createSignal(false);
	const [attempt, setAttempt] = createSignal(0);

	createEffect(
		() => ({ value: source(), attempt: attempt() }),
		({ value }) => {
			if (value === false || value === null || value === undefined) return;
			const controller = new AbortController();
			// Writes happen after the await, outside the effect's owner.
			queueMicrotask(() => setLoading(true));
			fetcher(value, controller.signal)
				.then((result) => {
					if (controller.signal.aborted) return;
					setData(() => result);
					setError(undefined);
				})
				.catch((caught: unknown) => {
					if (!controller.signal.aborted) setError(() => caught);
				})
				.finally(() => {
					if (!controller.signal.aborted) setLoading(false);
				});
			return () => controller.abort();
		},
	);

	return { data, error, loading, reload: () => setAttempt((n) => n + 1) };
}
