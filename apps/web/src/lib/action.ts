import { createSignal } from "solid-js";
import { toast } from "../components/ui/toast";
import { friendlyError } from "./errors";

/**
 * A write from a button or form: tracks `pending` and the last `error`, and
 * shows a toast when it fails (unless `onError` takes over). Resolves to the
 * result, or `undefined` when it failed or was already running.
 *
 *   const save = createAction(async (input: Input) => {
 *     await client.tasks.create(input);
 *     await refresh(router, "tasks");
 *   }, { error: "Opslaan lukte niet" });
 *
 *   <Button disabled={save.pending()} onClick={() => save.run(input)}>Opslaan</Button>
 */
export function createAction<A extends unknown[], R>(
	fn: (...args: A) => Promise<R>,
	options: { error?: string; onError?: (error: unknown) => void } = {},
) {
	const [pending, setPending] = createSignal(false);
	const [error, setError] = createSignal<unknown>(undefined);
	// Reads after a write see the old value until Solid flushes, so a double
	// click is guarded with a plain flag, not the signal.
	let running = false;

	async function run(...args: A): Promise<R | undefined> {
		if (running) return undefined;
		running = true;
		setPending(true);
		setError(undefined);
		try {
			return await fn(...args);
		} catch (caught) {
			setError(() => caught);
			if (options.onError) options.onError(caught);
			else toast({ title: options.error ?? "Dat lukte niet", description: friendlyError(caught), tone: "danger" });
			return undefined;
		} finally {
			running = false;
			setPending(false);
		}
	}

	return { run, pending, error };
}
