/**
 * Ordered autosave for the coachplan wizard (INC-1).
 *
 * The wizard saves on every keystroke. Sent as independent requests, a slow
 * older save could arrive after a newer one and overwrite it, losing what the
 * leerling typed last. Here each question has at most one request in flight;
 * changes made meanwhile are merged and sent when it returns, so the server
 * always ends on the newest value. `flush()` waits until everything is saved,
 * for "Opslaan & afsluiten" and "Versturen".
 */

export type SavePatch = Record<string, unknown>;

type Entry = {
	inFlight: Promise<void> | null;
	pending: SavePatch | null;
	callbacks: (() => void)[];
};

export function createAnswerSaver(
	send: (questionId: string, patch: SavePatch) => Promise<void>,
	onError: (error: unknown) => void = () => {},
) {
	const entries = new Map<string, Entry>();

	const run = (questionId: string, entry: Entry) => {
		const patch = entry.pending;
		if (!patch) return;
		const callbacks = entry.callbacks;
		entry.pending = null;
		entry.callbacks = [];
		let failed = false;
		entry.inFlight = send(questionId, patch)
			.then(
				() => {
					for (const cb of callbacks) cb();
				},
				(error) => {
					// Keep the unsent change, under anything typed since, so the next
					// save or a flush retries it: nothing the leerling typed is dropped.
					failed = true;
					entry.pending = { ...patch, ...entry.pending };
					entry.callbacks = [...callbacks, ...entry.callbacks];
					onError(error);
				},
			)
			.finally(() => {
				entry.inFlight = null;
				// Newer changes waited for this request: send them now. After a
				// failure, wait for the next save or flush instead of hammering.
				if (!failed) run(questionId, entry);
			});
	};

	const settle = async () => {
		for (;;) {
			const flying = [...entries.values()]
				.map((e) => e.inFlight)
				.filter((p): p is Promise<void> => p !== null);
			if (flying.length === 0) return;
			await Promise.all(flying);
		}
	};

	return {
		/** Queue a change for a question; `onSaved` runs once it reached the server. */
		save(questionId: string, patch: SavePatch, onSaved?: () => void) {
			let entry = entries.get(questionId);
			if (!entry) {
				entry = { inFlight: null, pending: null, callbacks: [] };
				entries.set(questionId, entry);
			}
			entry.pending = { ...entry.pending, ...patch };
			if (onSaved) entry.callbacks.push(onSaved);
			if (!entry.inFlight) run(questionId, entry);
		},

		/**
		 * Wait until every queued change is saved, retrying a failed one once.
		 * Resolves false when something still could not be saved.
		 */
		async flush(): Promise<boolean> {
			await settle();
			for (const [id, e] of entries) if (e.pending && !e.inFlight) run(id, e);
			await settle();
			return ![...entries.values()].some((e) => e.pending);
		},

		/** True while something is being saved or waiting to be saved. */
		busy(): boolean {
			return [...entries.values()].some((e) => e.inFlight !== null || e.pending !== null);
		},
	};
}
