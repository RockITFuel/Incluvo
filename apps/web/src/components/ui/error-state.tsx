import { RotateCw, TriangleAlert } from "lucide-solid";
import { Show } from "solid-js";
import { friendlyError } from "../../lib/errors";

/**
 * Shown when data could not be loaded — distinct from an empty state, so
 * "nothing there" and "couldn't fetch it" never look the same. `what` names
 * the data ("de leerlingen"); `onRetry` adds an "Opnieuw proberen" button.
 */
export function ErrorState(props: {
	error: unknown;
	what?: string;
	onRetry?: () => void;
	class?: string;
}) {
	return (
		<div
			role="alert"
			class={`flex flex-wrap items-start gap-3 rounded-3 border border-danger/30 bg-danger-100 p-4 text-small text-ink ${props.class ?? ""}`}
		>
			<TriangleAlert class="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
			<div class="min-w-0 flex-1">
				<p class="font-medium">
					{props.what ? `Kon ${props.what} niet laden.` : "Laden lukte niet."}
				</p>
				<p class="text-muted">{friendlyError(props.error)}</p>
			</div>
			<Show when={props.onRetry}>
				<button
					type="button"
					class="btn ghost sm"
					onClick={() => props.onRetry?.()}
				>
					<RotateCw class="size-3.5" aria-hidden="true" /> Opnieuw proberen
				</button>
			</Show>
		</div>
	);
}
