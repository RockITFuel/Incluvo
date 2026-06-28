import { createFileRoute, Link } from "@tanstack/solid-router";
import { useQuery } from "@tanstack/solid-query";
import { ArrowRight, Flag, MessageSquare, NotebookPen } from "lucide-solid";
import { createMemo, createSignal, For, Show } from "solid-js";
import { Avatar } from "../../../components/ui/avatar";
import { Badge } from "../../../components/ui/badge";
import { buttonVariants } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { SegmentedControl } from "../../../components/ui/segmented-control";
import {
	PlanStatusBadge,
	relativeTime,
} from "../../../components/dashboard/plan-status";
import { Quickpanel } from "../../../components/dashboard/quickpanel";
import { cn } from "../../../lib/cn";
import { requireRole } from "../../../lib/auth/require-role";
import { orpc } from "../../../lib/orpc";

/**
 * Coach dashboard (#42). Calm overview of the coach's assigned leerlingen with
 * coachplan status, last activity, task progress, an aandacht-badge and
 * snelacties (Chat, Naar plan). A row click opens the Quickpanel slide-over
 * (#43); the profile-icon links to the full profile route (#44).
 *
 * Gated to coach+ in the UI (`requireRole("coach")`); the server re-enforces
 * coach+ and the coach↔leerling assignment on every procedure.
 */
export const Route = createFileRoute("/_protected/dashboard/")({
	beforeLoad: () => requireRole("coach"),
	component: DashboardPage,
});

type Filter = "all" | "attention" | "plan";

function DashboardPage() {
	const overview = useQuery(() => orpc.dashboard.overview.queryOptions());
	const [filter, setFilter] = createSignal<Filter>("all");
	const [openLeerling, setOpenLeerling] = createSignal<string | null>(null);
	const [openPlan, setOpenPlan] = createSignal<string | null>(null);
	const [openConvo, setOpenConvo] = createSignal<string | null>(null);

	const rows = createMemo(() => overview.data ?? []);

	const filtered = createMemo(() => {
		const f = filter();
		if (f === "attention") return rows().filter((r) => r.aandacht);
		if (f === "plan")
			return rows().filter(
				(r) =>
					r.plan.status === "submitted" || r.plan.status === "coach_review",
			);
		return rows();
	});

	const attentionCount = createMemo(
		() => rows().filter((r) => r.aandacht).length,
	);

	const openQuickpanel = (
		leerlingId: string,
		planSubmissionId: string | null,
		conversationId: string | null,
	) => {
		setOpenPlan(planSubmissionId);
		setOpenConvo(conversationId);
		setOpenLeerling(leerlingId);
	};

	return (
		<section class="mx-auto flex w-full max-w-5xl flex-col gap-6">
			<div>
				<h1 class="font-head text-h1 text-ink">Dashboard</h1>
				<p class="mt-1 text-body text-muted">
					Een rustig overzicht van je leerlingen. Klik op een leerling voor
					details.
				</p>
			</div>

			<Show when={overview.isLoading}>
				<p class="text-muted">Laden…</p>
			</Show>

			<Show when={!overview.isLoading && rows().length === 0}>
				<Card class="text-muted">
					Er zijn nog geen leerlingen aan jou gekoppeld.
				</Card>
			</Show>

			<Show when={rows().length > 0}>
				<div class="flex flex-wrap items-center gap-3">
					<SegmentedControl
						value={filter()}
						onChange={(v) => setFilter(v as Filter)}
						options={[
							{ value: "all", label: `Alle (${rows().length})` },
							{
								value: "attention",
								label: `Aandacht (${attentionCount()})`,
							},
							{ value: "plan", label: "Plan in behandeling" },
						]}
					/>
				</div>

				<ul class="flex flex-col gap-2">
					<For each={filtered()}>
						{(row) => (
							<li>
								<Card
									padding="sm"
									class={cn(
										"transition-colors hover:border-primary",
										openLeerling() === row.leerling.id &&
											"border-primary bg-primary-50",
									)}
								>
									<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
										{/* Leerling */}
										<div class="flex min-w-0 flex-1 items-center gap-3">
											<Avatar name={row.leerling.name} tone="leerling" />
											<div class="min-w-0">
												<p class="flex items-center gap-2 truncate font-medium text-ink">
													{row.leerling.name}
													<Show when={row.aandacht}>
														<Badge variant="danger">
															<Flag class="size-3" /> Aandacht
														</Badge>
													</Show>
												</p>
												<Show when={row.aandacht && row.aandachtRedenen.length}>
													<p class="truncate text-micro text-muted">
														{row.aandachtRedenen.join(" · ")}
													</p>
												</Show>
											</div>
										</div>

										{/* Coachplan */}
										<div class="w-36 shrink-0">
											<span class="inline-flex whitespace-nowrap">
												<PlanStatusBadge status={row.plan.status} />
											</span>
											<Show when={row.plan.discussCount > 0}>
												<span class="mt-1 block text-micro text-accent-700">
													{row.plan.discussCount} bespreken
												</span>
											</Show>
										</div>

										{/* Taken */}
										<div class="w-24 shrink-0 text-small">
											<span class="text-ink">{row.tasks.open} open</span>
											<Show when={row.tasks.overdue > 0}>
												<span class="block text-micro text-danger">
													{row.tasks.overdue} over tijd
												</span>
											</Show>
										</div>

										{/* Laatst actief */}
										<div class="w-28 shrink-0 text-small text-muted">
											{relativeTime(row.lastActivityAt)}
										</div>

										{/* Snelacties */}
										<div class="flex shrink-0 items-center gap-1">
											<button
												type="button"
												aria-label={`Open ${row.leerling.name}`}
												class={cn(
													buttonVariants({ variant: "subtle", size: "sm" }),
												)}
												onClick={() =>
													openQuickpanel(
														row.leerling.id,
														row.snelacties.planSubmissionId,
														row.snelacties.conversationId,
													)
												}
											>
												Open
											</button>
											<Link
												to="/chat"
												search={
													row.snelacties.conversationId
														? { conversationId: row.snelacties.conversationId }
														: { otherUserId: row.leerling.id }
												}
												aria-label={`Chat met ${row.leerling.name}`}
												class={cn(
													buttonVariants({ variant: "ghost", size: "icon" }),
												)}
											>
												<MessageSquare class="size-4" />
											</Link>
											<Show
												when={row.snelacties.planSubmissionId}
												fallback={
													<span
														aria-hidden="true"
														class={cn(
															buttonVariants({
																variant: "ghost",
																size: "icon",
															}),
															"pointer-events-none opacity-40",
														)}
													>
														<NotebookPen class="size-4" />
													</span>
												}
											>
												<Link
													to="/plan/$submissionId"
													params={{
														submissionId:
															row.snelacties.planSubmissionId ?? "",
													}}
													aria-label={`Coachplan van ${row.leerling.name}`}
													class={cn(
														buttonVariants({
															variant: "ghost",
															size: "icon",
														}),
													)}
												>
													<NotebookPen class="size-4" />
												</Link>
											</Show>
											<Link
												to="/dashboard/$leerlingId"
												params={{ leerlingId: row.leerling.id }}
												aria-label={`Profiel van ${row.leerling.name}`}
												class={cn(
													buttonVariants({ variant: "ghost", size: "icon" }),
												)}
											>
												<ArrowRight class="size-4" />
											</Link>
										</div>
									</div>
								</Card>
							</li>
						)}
					</For>
				</ul>
			</Show>

			<Quickpanel
				leerlingId={openLeerling()}
				planSubmissionId={openPlan()}
				conversationId={openConvo()}
				onClose={() => setOpenLeerling(null)}
			/>
		</section>
	);
}
