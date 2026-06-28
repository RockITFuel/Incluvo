import { createFileRoute } from "@tanstack/solid-router";
import { AssistantPanel } from "../../../components/ai/assistant-panel";
import { TranscriptionPanel } from "../../../components/ai/transcription-panel";
import { TranslatePanel } from "../../../components/ai/translate-panel";
import { Tabs } from "../../../components/ui/tabs";
import { requireRole } from "../../../lib/auth/require-role";

/**
 * `/assistent` — the coach AI-werkbank (Epic 7).
 *
 *   - "Advies"        AI-assistent met streaming interventie-advies (#22)
 *   - "Transcriptie"  gesprek → transcript → conceptantwoorden (#18)
 *   - "Vertaling"     AI-vertaling naar de taal van leerling/ouder (#1)
 *
 * Coach-gated (the server independently enforces coach-only on #18/#22; the
 * route gate is a UX guard). The AI runs server-side on an EU-resident provider;
 * a MOCK banner shows when no credentials are configured.
 */
export const Route = createFileRoute("/_protected/assistent/")({
	beforeLoad: () => requireRole("coach"),
	component: AssistentPage,
});

function AssistentPage() {
	return (
		<section class="mx-auto flex w-full max-w-3xl flex-col gap-6">
			<div>
				<h1 class="font-head text-h1 text-ink">AI-assistent</h1>
				<p class="mt-1 text-body text-muted">
					Ondersteuning bij coachgesprekken: advies, transcriptie en vertaling.
					Alle output is een concept dat je zelf controleert.
				</p>
			</div>

			<Tabs
				aria-label="AI-hulpmiddelen"
				items={[
					{ value: "advies", label: "Advies", content: <AssistantPanel /> },
					{
						value: "transcriptie",
						label: "Transcriptie",
						content: <TranscriptionPanel />,
					},
					{ value: "vertaling", label: "Vertaling", content: <TranslatePanel /> },
				]}
			/>
		</section>
	);
}
