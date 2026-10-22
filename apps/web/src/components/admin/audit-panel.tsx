import { createSignal, For, Show } from "solid-js";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Select } from "../ui/select";
import { Input } from "../ui/text-field";
import { createLoad } from "../../lib/load";
import { client } from "../../lib/orpc";
import { ErrorState } from "../ui/error-state";
import { actorLabel, formatDateTime } from "./format";

const OPERATION_OPTIONS = [
	{ value: "", label: "Alle bewerkingen" },
	{ value: "INSERT", label: "Aangemaakt" },
	{ value: "UPDATE", label: "Gewijzigd" },
	{ value: "DELETE", label: "Verwijderd" },
];

const OPERATION_TONE: Record<string, "success" | "primary" | "danger"> = {
	INSERT: "success",
	UPDATE: "primary",
	DELETE: "danger",
};

const PAGE_SIZE = 25;

/**
 * Audit-inzage (#60). Tenant-scoped for keyuser (their org's actors only) and
 * global for superadmin. Filters on table, operation and a specific actor;
 * paged via limit/offset with a "meer laden" button. It pages on its own
 * (lib/load.ts): every filter or page is a new request.
 */
export function AuditPanel() {
	const [tableName, setTableName] = createSignal("");
	const [operation, setOperation] = createSignal("");
	const [actor, setActor] = createSignal("");
	// Back to the first page whenever a filter changes.
	const [offset, setOffset] = createSignal(() => (tableName(), operation(), actor(), 0));

	const audit = createLoad(
		() => ({
			limit: PAGE_SIZE,
			offset: offset(),
			tableName: tableName() || undefined,
			operation: (operation() as "INSERT" | "UPDATE" | "DELETE" | "") || undefined,
			actor: actor() || undefined,
		}),
		(input, signal) => client.admin.audit.list(input, { signal }),
	);

	return (
		<section class="flex flex-col gap-4">
			<div class="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h2 class="font-head text-h3 text-ink">Audit</h2>
					<p class="mt-1 text-small text-muted">
						<Show
							when={audit.data()?.scope === "global"}
							fallback="Activiteit binnen jouw organisatie."
						>
							Activiteit over alle organisaties.
						</Show>
					</p>
				</div>
				<Show when={audit.data()?.scope}>
					<Badge variant="outline">
						{audit.data()?.scope === "global"
							? "Globaal"
							: "Eigen tenant"}
					</Badge>
				</Show>
			</div>

			{/* Filters */}
			<div class="flex flex-wrap items-end gap-3">
				<Input
					label="Tabel"
					placeholder="bv. user"
					value={tableName()}
					onInput={(e) => {
						setTableName(e.currentTarget.value);
					}}
					class="w-44"
				/>
				<div class="flex w-48 flex-col gap-1.5">
					<span class="text-small font-medium text-ink-2">Bewerking</span>
					<Select
						aria-label="Bewerking"
						options={OPERATION_OPTIONS}
						value={operation()}
						onChange={(v) => {
							setOperation(v ?? "");
							}}
					/>
				</div>
				<Input
					label="Actor"
					placeholder="user:… of system"
					value={actor()}
					onInput={(e) => {
						setActor(e.currentTarget.value);
					}}
					class="w-56"
				/>
			</div>

			<Show when={audit.loading() && !audit.data()}>
				<p class="text-muted">Laden…</p>
			</Show>
			<Show when={audit.error()}>
				{(error) => <ErrorState error={error()} what="de auditregels" onRetry={audit.reload} />}
			</Show>
			<Show when={audit.data()?.items.length === 0}>
				<p class="text-muted">Geen activiteit gevonden.</p>
			</Show>

			<ul class="flex flex-col gap-2">
				<For each={audit.data()?.items ?? []}>
					{(row) => (
						<li>
							<Card
								padding="sm"
								class="flex flex-wrap items-center justify-between gap-3"
							>
								<div class="min-w-0">
									<p class="font-medium text-ink">
										{row.tableName}
										<Show when={row.rowId}>
											<span class="text-muted"> · {row.rowId}</span>
										</Show>
									</p>
									<p class="text-micro text-muted">
										{actorLabel(row.actor)} ·{" "}
										{formatDateTime(row.createdAt)}
									</p>
								</div>
								<Badge variant={OPERATION_TONE[row.operation] ?? "neutral"}>
									{row.operation}
								</Badge>
							</Card>
						</li>
					)}
				</For>
			</ul>

			<div class="flex items-center justify-between gap-3">
				<Button
					variant="subtle"
					size="sm"
					disabled={offset() === 0}
					onClick={() => setOffset(Math.max(0, offset() - PAGE_SIZE))}
				>
					Vorige
				</Button>
				<span class="text-micro text-muted">
					Vanaf {offset() + 1}
				</span>
				<Button
					variant="subtle"
					size="sm"
					disabled={!audit.data()?.hasMore}
					onClick={() => setOffset(offset() + PAGE_SIZE)}
				>
					Volgende
				</Button>
			</div>
		</section>
	);
}
