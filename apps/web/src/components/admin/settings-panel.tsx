import { useQuery } from "@tanstack/solid-query";
import { For, Show } from "solid-js";
import { Card } from "../ui/card";
import { ErrorState } from "../ui/error-state";
import { orpc } from "../../lib/orpc";

/**
 * Bewaartermijnen (#4, AVG). Read-only: the policy is decided centrally
 * (docs/decisions/bewaartermijnen.md) — pupil data is kept without a time
 * limit for now, audio is never stored, the audit log is purged after a fixed
 * number of days. Schools have nothing to configure until that changes.
 */
export function SettingsPanel() {
	const policy = useQuery(() => orpc.admin.settings.getRetention.queryOptions());

	const days = (n: number | null) =>
		n === null ? "Onbeperkt" : `${n} dagen`;

	const rows = () => {
		const p = policy.data;
		if (!p) return [];
		return [
			{ label: "Coachplannen", value: days(p.coachplanDays) },
			{ label: "Chats", value: days(p.chatDays) },
			{ label: "Transcripties van gesprekken", value: days(p.transcriptDays) },
			{
				label: "Opnames van gesprekken",
				value: p.recordingsStored
					? "Bewaard"
					: "Niet bewaard — de opname gaat direct naar de transcriptie",
			},
			{ label: "Audit-log (wie wat wijzigde)", value: days(p.auditLogDays) },
		];
	};

	return (
		<section class="flex flex-col gap-4">
			<div>
				<h2 class="font-head text-h3 text-ink">Bewaartermijnen</h2>
				<p class="mt-1 text-small text-muted">
					Hoe lang Incluvo gegevens bewaart. Dit beleid wordt door Ondivera
					vastgesteld en geldt voor alle scholen.
				</p>
			</div>

			<Show when={policy.isLoading}>
				<p class="text-muted">Laden…</p>
			</Show>
			<Show when={policy.error}>
				<ErrorState
					error={policy.error}
					what="de bewaartermijnen"
					onRetry={() => policy.refetch()}
				/>
			</Show>

			<Show when={policy.data}>
				<Card padding="none" class="overflow-hidden">
					<dl>
						<For each={rows()}>
							{(row) => (
								<div class="flex flex-wrap items-baseline justify-between gap-2 border-line-2 border-b px-4 py-3 last:border-b-0">
									<dt class="text-small font-medium text-ink-2">{row.label}</dt>
									<dd class="text-small text-ink">{row.value}</dd>
								</div>
							)}
						</For>
					</dl>
				</Card>
				<p class="text-small text-muted">
					Gegevens van leerlingen worden niet automatisch verwijderd. Wil een
					school of ouder gegevens laten verwijderen, neem dan contact op met
					Ondivera.
				</p>
			</Show>
		</section>
	);
}
