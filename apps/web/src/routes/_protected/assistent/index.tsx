import { createFileRoute, Link, useRouter } from "@tanstack/solid-router";
import { ArrowRight, Sparkles } from "../../../lib/icons";
import { For, Show } from "solid-js";
import { TranscriptionPanel } from "../../../components/ai/transcription-panel";
import { TranslatePanel } from "../../../components/ai/translate-panel";
import { RouteDataView } from "../../../components/ui/route-data-view";
import { Tabs } from "../../../components/ui/tabs";
import { requireRole } from "../../../lib/auth/role-guard";
import { client, type Output } from "../../../lib/orpc";
import { refresh } from "../../../lib/refresh";
import { loadRouteData } from "../../../lib/route-data";

/**
 * `/assistent` — the coach AI-werkbank (Epic 7).
 *
 *   - "Advies"        kies een coachplan; het advies zelf staat in de zijbalk
 *                     van dat plan (/plan/$submissionId), de enige plek ervoor
 *   - "Transcriptie"  gesprek → transcript → conceptantwoorden (#18)
 *   - "Vertaling"     AI-vertaling naar de taal van leerling/ouder (#1)
 *
 * Coach-gated (the server independently enforces coach-only on #18/#22; the
 * route gate is a UX guard). The AI runs server-side on an EU-resident provider;
 * a MOCK banner shows when no credentials are configured.
 */
export const Route = createFileRoute("/_protected/assistent/")({
	beforeLoad: ({ context }) => requireRole(context.me, { min: "coach", coaching: true }),
	loader: async ({ abortController }) => ({
		inbox: await loadRouteData(abortController.signal, (s) =>
			client.coachplan.inbox(undefined, { signal: s }),
		),
	}),
	component: AssistentPage,
});

type InboxRow = Output<typeof client.coachplan.inbox>[number];

function AssistentPage() {
	const router = useRouter();
	const data = Route.useLoaderData();
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
					{
						value: "advies",
						label: "Advies",
						content: (
							<RouteDataView
								data={data().inbox}
								what="de coachplannen"
								onRetry={() => void refresh(router, "coachplan")}
							>
								{(rows) => <AdviesPicker rows={rows()} />}
							</RouteDataView>
						),
					},
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

/**
 * AI-advies is always about one leerling's plan, so it lives next to that
 * plan. This tab only helps the coach get there from the review inbox.
 */
function AdviesPicker(props: { rows: InboxRow[] }) {
	return (
		<div class="flex flex-col gap-3">
			<p class="text-small text-muted">
				Kies een coachplan. Het AI-advies opent naast het plan, op basis van de
				antwoorden en leervoorkeuren van die leerling.
			</p>
			<Show when={props.rows.length === 0}>
				<p class="text-muted">
					Er staan nog geen ingeleverde coachplannen klaar om te bespreken.
				</p>
			</Show>
			<ul class="flex flex-col gap-2">
				<For each={props.rows}>
					{(row) => (
						<li>
							<Link
								to="/plan/$submissionId"
								params={{ submissionId: row.submission.id }}
								class="flex items-center justify-between gap-3 rounded-3 border border-line bg-surface px-4 py-3 hover:bg-line-2"
							>
								<span class="min-w-0">
									<span class="block font-medium text-ink">{row.leerlingName}</span>
									<span class="block truncate text-small text-muted">
										{row.templateName}
									</span>
								</span>
								<span class="inline-flex shrink-0 items-center gap-1.5 text-small font-medium text-primary-700">
									<Sparkles class="size-3.5" aria-hidden="true" /> AI-advies
									<ArrowRight class="size-3.5" aria-hidden="true" />
								</span>
							</Link>
						</li>
					)}
				</For>
			</ul>
		</div>
	);
}
