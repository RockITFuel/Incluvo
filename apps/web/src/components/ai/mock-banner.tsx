import { Show } from "solid-js";
import { Badge } from "../ui/badge";

/**
 * Clear indicator that the AI layer is running the offline MOCK provider (no EU
 * credentials configured). Shown across all AI surfaces so a demo can never be
 * mistaken for live output.
 */
export function MockBanner(props: { mock: boolean | null | undefined; model?: string }) {
	return (
		<Show when={props.mock}>
			<div
				role="note"
				class="flex flex-wrap items-center gap-2 rounded-2 bg-warning-100 px-3 py-2 text-small text-warning"
			>
				<Badge variant="warning" class="gap-1">
					MOCK
				</Badge>
				<span>
					AI-demo zonder echte koppeling — antwoorden zijn voorbeelden. Stel een
					EU-provider in voor live gebruik.
				</span>
			</div>
		</Show>
	);
}
