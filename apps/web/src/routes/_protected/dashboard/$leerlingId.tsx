import { createFileRoute, Link } from "@tanstack/solid-router";
import { useQuery } from "@tanstack/solid-query";
import {
	ArrowLeft,
	Flag,
	MessageSquare,
	NotebookPen,
} from "lucide-solid";
import { For, Show } from "solid-js";
import { Avatar } from "../../../components/ui/avatar";
import { Badge } from "../../../components/ui/badge";
import { buttonVariants } from "../../../components/ui/button";
import { Card, CardHeader, CardTitle } from "../../../components/ui/card";
import {
	PlanStatusBadge,
	relativeTime,
} from "../../../components/dashboard/plan-status";
import { cn } from "../../../lib/cn";
import { requireRole } from "../../../lib/auth/require-role";
import { orpc } from "../../../lib/orpc";

/**
 * Full leerling profile (#44). A fuller read-only view for a coach: coachplan
 * status + leervoorkeuren, task progress and today's tasks, active courses,
 * recent coachplan submissions and coach assignments. Gated to coach+; the
 * server re-asserts the coach↔leerling assignment within the tenant.
 */
export const Route = createFileRoute("/_protected/dashboard/$leerlingId")({
	beforeLoad: () => requireRole("coach"),
	component: ProfilePage,
});

const STATUS_LABEL: Record<string, string> = {
	draft: "Concept",
	submitted: "Ingeleverd",
	coach_review: "In behandeling",
	shared_with_leerling: "Gedeeld",
	completed: "Afgerond",
};

function ProfilePage() {
	const params = Route.useParams();
	const profile = useQuery(() =>
		orpc.dashboard.profile.queryOptions({
			input: { leerlingId: params().leerlingId },
		}),
	);

	return (
		<section class="mx-auto flex w-full max-w-4xl flex-col gap-6">
			<Link
				to="/dashboard"
				class={cn(
					buttonVariants({ variant: "ghost", size: "sm" }),
					"self-start",
				)}
			>
				<ArrowLeft class="size-4" /> Dashboard
			</Link>

			<Show when={profile.isLoading}>
				<p class="text-muted">Laden…</p>
			</Show>

			<Show when={profile.isError}>
				<Card class="border-warning bg-warning-100/40 text-ink-2">
					Geen toegang tot dit profiel of leerling niet gevonden.
				</Card>
			</Show>

			<Show when={profile.data}>
				{(data) => (
					<>
						{/* Header */}
						<Card padding="lg">
							<div class="flex flex-wrap items-center gap-4">
								<Avatar
									name={data().leerling.name}
									tone="leerling"
									size="lg"
								/>
								<div class="min-w-0 flex-1">
									<h1 class="flex items-center gap-2 font-head text-h1 text-ink">
										{data().leerling.name}
										<Show when={data().aandacht}>
											<Badge variant="danger">
												<Flag class="size-3" /> Aandacht
											</Badge>
										</Show>
									</h1>
									<p class="text-small text-muted">{data().leerling.email}</p>
									<Show when={data().aandacht && data().aandachtRedenen.length}>
										<p class="mt-1 text-small text-ink-2">
											{data().aandachtRedenen.join(" · ")}
										</p>
									</Show>
								</div>
								<div class="flex shrink-0 gap-2">
									<Link
										to="/chat"
										class={cn(
											buttonVariants({ variant: "ghost", size: "sm" }),
										)}
									>
										<MessageSquare class="size-4" /> Bericht
									</Link>
									<Show when={data().plan.submissionId}>
										<Link
											to="/plan/$submissionId"
											params={{
												submissionId: data().plan.submissionId ?? "",
											}}
											class={cn(buttonVariants({ size: "sm" }))}
										>
											<NotebookPen class="size-4" /> Open coachplan
										</Link>
									</Show>
								</div>
							</div>
						</Card>

						<div class="grid gap-6 md:grid-cols-[1.6fr_1fr]">
							<div class="flex flex-col gap-6">
								{/* Coachplan */}
								<Card>
									<CardHeader>
										<CardTitle>Coachplan</CardTitle>
										<PlanStatusBadge status={data().plan.status} />
									</CardHeader>
									<dl class="grid grid-cols-2 gap-4 text-small">
										<div>
											<dt class="text-muted">Laatst bijgewerkt</dt>
											<dd class="text-ink">
												{relativeTime(data().plan.updatedAt)}
											</dd>
										</div>
										<div>
											<dt class="text-muted">Te bespreken</dt>
											<dd class="text-ink">
												{data().plan.discussCount} vraag/vragen
											</dd>
										</div>
									</dl>
								</Card>

								{/* Recente inzendingen */}
								<Card>
									<CardHeader>
										<CardTitle>Recente inzendingen</CardTitle>
									</CardHeader>
									<Show
										when={data().recentSubmissions.length > 0}
										fallback={
											<p class="text-small text-muted">
												Nog geen coachplannen ingeleverd.
											</p>
										}
									>
										<ul class="flex flex-col gap-2">
											<For each={data().recentSubmissions}>
												{(s) => (
													<li class="flex items-center justify-between gap-3 rounded-2 bg-bg-2 px-3 py-2">
														<div class="min-w-0">
															<p class="text-small text-ink">
																{STATUS_LABEL[s.status] ?? s.status}
															</p>
															<p class="text-micro text-muted">
																{relativeTime(s.submittedAt ?? s.updatedAt)}
															</p>
														</div>
														<div class="flex items-center gap-2">
															<Show when={s.discussCount > 0}>
																<Badge variant="accent">
																	{s.discussCount} bespreken
																</Badge>
															</Show>
															<Link
																to="/plan/$submissionId"
																params={{ submissionId: s.id }}
																class={cn(
																	buttonVariants({
																		variant: "ghost",
																		size: "sm",
																	}),
																)}
															>
																Open
															</Link>
														</div>
													</li>
												)}
											</For>
										</ul>
									</Show>
								</Card>

								{/* Cursussen */}
								<Card>
									<CardHeader>
										<CardTitle>Actieve cursussen</CardTitle>
									</CardHeader>
									<Show
										when={data().courses.length > 0}
										fallback={
											<p class="text-small text-muted">
												Geen actieve cursussen.
											</p>
										}
									>
										<ul class="flex flex-col gap-3">
											<For each={data().courses}>
												{(c) => (
													<li class="flex items-center gap-3">
														<span class="min-w-0 flex-1 truncate text-small font-medium text-ink">
															{c.title}
														</span>
														<div
															class="h-2 w-32 overflow-hidden rounded-pill bg-line-2"
															role="progressbar"
															aria-valuenow={c.progress}
															aria-valuemin={0}
															aria-valuemax={100}
															aria-label={`Voortgang ${c.title}`}
														>
															<div
																class="h-full rounded-pill bg-primary"
																style={{ width: `${c.progress}%` }}
															/>
														</div>
														<span class="w-9 text-right text-micro text-muted">
															{c.progress}%
														</span>
													</li>
												)}
											</For>
										</ul>
									</Show>
								</Card>
							</div>

							<div class="flex flex-col gap-6">
								{/* Leervoorkeuren */}
								<Card>
									<CardHeader>
										<CardTitle>Leervoorkeuren</CardTitle>
									</CardHeader>
									<Show
										when={data().leervoorkeuren.length > 0}
										fallback={
											<p class="text-small text-muted">
												Nog niet vastgelegd.
											</p>
										}
									>
										<div class="flex flex-wrap gap-1.5">
											<For each={data().leervoorkeuren}>
												{(v) => <Badge variant="primary">{v}</Badge>}
											</For>
										</div>
									</Show>
								</Card>

								{/* Taken */}
								<Card>
									<CardHeader>
										<CardTitle>Taken</CardTitle>
									</CardHeader>
									<div class="flex gap-4 text-small">
										<Stat label="Open" value={data().tasks.open} />
										<Stat label="Klaar" value={data().tasks.done} />
										<Stat
											label="Over tijd"
											value={data().tasks.overdue}
											tone={data().tasks.overdue > 0 ? "danger" : undefined}
										/>
									</div>
									<Show when={data().tasksToday.length > 0}>
										<div class="mt-4">
											<p class="mb-2 text-micro text-muted uppercase tracking-wide">
												Vandaag
											</p>
											<ul class="flex flex-col gap-1.5">
												<For each={data().tasksToday}>
													{(t) => (
														<li class="flex items-center justify-between gap-2 rounded-2 bg-bg-2 px-3 py-2 text-small">
															<span class="min-w-0 truncate text-ink">
																{t.title}
															</span>
															<Show when={t.overdue}>
																<Badge variant="danger">over tijd</Badge>
															</Show>
														</li>
													)}
												</For>
											</ul>
										</div>
									</Show>
								</Card>

								{/* Begeleiding */}
								<Card>
									<CardHeader>
										<CardTitle>Begeleiding</CardTitle>
									</CardHeader>
									<Show
										when={data().assignments.length > 0}
										fallback={
											<p class="text-small text-muted">
												Geen coach gekoppeld.
											</p>
										}
									>
										<ul class="flex flex-col gap-2">
											<For each={data().assignments}>
												{(a) => (
													<li class="flex items-center gap-3">
														<Avatar name={a.coachName} tone="coach" size="sm" />
														<div class="min-w-0">
															<p class="truncate text-small text-ink">
																{a.coachName}
															</p>
															<p class="text-micro text-muted">
																Coach · sinds {relativeTime(a.createdAt)}
															</p>
														</div>
													</li>
												)}
											</For>
										</ul>
									</Show>
								</Card>
							</div>
						</div>
					</>
				)}
			</Show>
		</section>
	);
}

function Stat(props: {
	label: string;
	value: number;
	tone?: "danger";
}) {
	return (
		<div>
			<p
				class={cn(
					"font-head text-h2",
					props.tone === "danger" ? "text-danger" : "text-ink",
				)}
			>
				{props.value}
			</p>
			<p class="text-micro text-muted">{props.label}</p>
		</div>
	);
}
