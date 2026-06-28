import { useQuery } from "@tanstack/solid-query";
import { createSignal, For, Show } from "solid-js";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Select } from "../ui/select";
import { Input } from "../ui/text-field";
import { orpc } from "../../lib/orpc";
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
 * paged via limit/offset with a "meer laden" button.
 */
export function AuditPanel() {
	const [tableName, setTableName] = createSignal("");
	const [operation, setOperation] = createSignal("");
	const [actor, setActor] = createSignal("");
	const [offset, setOffset] = createSignal(0);

	const auditQuery = useQuery(() =>
		orpc.admin.audit.list.queryOptions({
			input: {
				limit: PAGE_SIZE,
				offset: offset(),
				tableName: tableName() || undefined,
				operation:
					(operation() as "INSERT" | "UPDATE" | "DELETE" | "") || undefined,
				actor: actor() || undefined,
			},
		}),
	);

	const resetPaging = () => setOffset(0);

	return (
		<section class="flex flex-col gap-4">
			<div class="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h2 class="font-head text-h3 text-ink">Audit</h2>
					<p class="mt-1 text-small text-muted">
						<Show
							when={auditQuery.data?.scope === "global"}
							fallback="Activiteit binnen jouw organisatie."
						>
							Activiteit over alle organisaties.
						</Show>
					</p>
				</div>
				<Show when={auditQuery.data?.scope}>
					<Badge variant="outline">
						{auditQuery.data?.scope === "global"
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
						resetPaging();
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
							resetPaging();
						}}
					/>
				</div>
				<Input
					label="Actor"
					placeholder="user:… of system"
					value={actor()}
					onInput={(e) => {
						setActor(e.currentTarget.value);
						resetPaging();
					}}
					class="w-56"
				/>
			</div>

			<Show when={auditQuery.isLoading}>
				<p class="text-muted">Laden…</p>
			</Show>
			<Show when={auditQuery.error}>
				<p class="text-danger">Kon auditregels niet laden.</p>
			</Show>
			<Show
				when={!auditQuery.isLoading && auditQuery.data?.items.length === 0}
			>
				<p class="text-muted">Geen activiteit gevonden.</p>
			</Show>

			<ul class="flex flex-col gap-2">
				<For each={auditQuery.data?.items}>
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
					disabled={!auditQuery.data?.hasMore}
					onClick={() => setOffset(offset() + PAGE_SIZE)}
				>
					Volgende
				</Button>
			</div>
		</section>
	);
}
