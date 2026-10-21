import { useRouter, type ErrorComponentProps } from "@tanstack/solid-router";
import { ErrorState } from "./error-state";

/** Shown while a cold deep link loads (router.tsx keeps the old page afterwards). */
export function RoutePending() {
	return (
		<div class="grid min-h-[40vh] place-items-center text-muted" aria-busy="true">
			<p class="text-small">Bezig met laden…</p>
		</div>
	);
}

/** A loader or page threw: show it calmly, with a retry that reruns the loaders. */
export function RouteError(props: ErrorComponentProps) {
	const router = useRouter();
	return (
		<div class="p-6">
			<ErrorState error={props.error} onRetry={() => void router.invalidate()} />
		</div>
	);
}
