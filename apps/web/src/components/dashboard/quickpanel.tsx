import { Dialog as KDialog } from "@kobalte/core/dialog";
import { Link } from "@tanstack/solid-router";
import { useQuery } from "@tanstack/solid-query";
import { ArrowRight, MessageSquare, NotebookPen, X } from "lucide-solid";
import { For, Show } from "solid-js";
import { buttonVariants } from "../ui/button";
import { Avatar } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { cn } from "../../lib/cn";
import { orpc } from "../../lib/orpc";
import { PlanStatusBadge } from "./plan-status";

/**
 * Quickpanel slide-over (#43). Opens on a leerling row click and shows their
 * leervoorkeuren, today's tasks and active courses with progress, plus snelacties
 * (bericht / naar plan / volledig profiel). Built on Kobalte's Dialog for a
 * focus-trap, Esc-to-close and scroll-lock; positioned as a right-edge drawer.
 */
export function Quickpanel(props: {
	leerlingId: string | null;
	planSubmissionId: string | null;
	/** Existing 1:1 conversation id for the Bericht snelactie (#42), if any. */
	conversationId: string | null;
	onClose: () => void;
}) {
	const isOpen = () => props.leerlingId !== null;

	const query = useQuery(() => ({
		...orpc.dashboard.quickpanel.queryOptions({
			input: { leerlingId: props.leerlingId ?? "" },
		}),
		enabled: isOpen(),
	}));

	return (
		<KDialog
			open={isOpen()}
			onOpenChange={(o) => {
				if (!o) props.onClose();
			}}
		>
			<KDialog.Portal>
				<KDialog.Overlay class="fixed inset-0 z-50 bg-ink/40 animate-fade-in" />
				<div class="fixed inset-y-0 right-0 z-50 flex max-w-[100vw]">
					<KDialog.Content
						class={cn(
							"flex h-full w-[26rem] max-w-[100vw] flex-col overflow-y-auto border-line border-l bg-surface shadow-3",
							"motion-safe:animate-slide-in-right",
						)}
					>
						<div class="flex items-center gap-3 border-line border-b p-5">
							<Avatar
								name={query.data?.leerling.name ?? "…"}
								tone="leerling"
								size="lg"
							/>
							<div class="min-w-0 flex-1">
								<KDialog.Title class="truncate font-head text-h3 text-ink">
									{query.data?.leerling.name ?? "Leerling"}
								</KDialog.Title>
								<KDialog.Description class="truncate text-small text-muted">
									{query.data?.leerling.email ?? ""}
								</KDialog.Description>
							</div>
							<KDialog.CloseButton
								aria-label="Sluiten"
								class="grid size-8 shrink-0 place-items-center rounded-2 text-muted hover:bg-line-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
							>
								<X class="size-4" />
							</KDialog.CloseButton>
						</div>

						<div class="flex flex-1 flex-col gap-6 p-5">
							<Show
								when={!query.isLoading}
								fallback={<p class="text-muted">Laden…</p>}
							>
								{/* Coachplan status */}
								<section>
									<SectionLabel>Coachplan</SectionLabel>
									<div class="flex items-center gap-2">
										<PlanStatusBadge
											status={query.data?.plan.status ?? "niet_ingevuld"}
										/>
										<Show
											when={(query.data?.plan.discussCount ?? 0) > 0}
										>
											<Badge variant="accent">
												{query.data?.plan.discussCount} bespreken
											</Badge>
										</Show>
									</div>
								</section>

								{/* Leervoorkeuren */}
								<section>
									<SectionLabel>Leervoorkeuren</SectionLabel>
									<Show
										when={(query.data?.leervoorkeuren.length ?? 0) > 0}
										fallback={
											<p class="text-small text-muted">
												Nog geen leervoorkeuren vastgelegd.
											</p>
										}
									>
										<div class="flex flex-wrap gap-1.5">
											<For each={query.data?.leervoorkeuren}>
												{(v) => <Badge variant="primary">{v}</Badge>}
											</For>
										</div>
									</Show>
								</section>

								{/* Taken vandaag */}
								<section>
									<SectionLabel>Taken voor vandaag</SectionLabel>
									<Show
										when={(query.data?.tasksToday.length ?? 0) > 0}
										fallback={
											<p class="text-small text-muted">
												Geen open taken voor vandaag.
											</p>
										}
									>
										<ul class="flex flex-col gap-1.5">
											<For each={query.data?.tasksToday}>
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
									</Show>
								</section>

								{/* Actieve cursussen */}
								<section>
									<SectionLabel>Actieve cursussen</SectionLabel>
									<Show
										when={(query.data?.courses.length ?? 0) > 0}
										fallback={
											<p class="text-small text-muted">
												Geen actieve cursussen.
											</p>
										}
									>
										<ul class="flex flex-col gap-2">
											<For each={query.data?.courses}>
												{(c) => (
													<li class="flex items-center gap-3 rounded-2 bg-bg-2 px-3 py-2">
														<span class="min-w-0 flex-1 truncate text-small font-medium text-ink">
															{c.title}
														</span>
														<div
															class="h-2 w-20 overflow-hidden rounded-pill bg-line-2"
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
								</section>
							</Show>

							<div class="mt-auto flex flex-col gap-2 border-line border-t pt-4">
								<div class="grid grid-cols-2 gap-2">
									<Link
										to="/chat"
										search={
											props.conversationId
												? { conversationId: props.conversationId }
												: { otherUserId: props.leerlingId ?? "" }
										}
										class={cn(buttonVariants({ variant: "primary", size: "sm" }))}
									>
										<MessageSquare class="size-4" /> Bericht
									</Link>
									<Show
										when={props.planSubmissionId}
										fallback={
											<span
												class={cn(
													buttonVariants({ variant: "ghost", size: "sm" }),
													"pointer-events-none opacity-50",
												)}
											>
												<NotebookPen class="size-4" /> Naar plan
											</span>
										}
									>
										<Link
											to="/plan/$submissionId"
											params={{
												submissionId: props.planSubmissionId ?? "",
											}}
											class={cn(
												buttonVariants({ variant: "ghost", size: "sm" }),
											)}
										>
											<NotebookPen class="size-4" /> Naar plan
										</Link>
									</Show>
								</div>
								<Show when={props.leerlingId}>
									<Link
										to="/dashboard/$leerlingId"
										params={{ leerlingId: props.leerlingId ?? "" }}
										class={cn(
											buttonVariants({ variant: "ghost", size: "sm" }),
											"justify-center",
										)}
									>
										Volledig profiel <ArrowRight class="size-4" />
									</Link>
								</Show>
							</div>
						</div>
					</KDialog.Content>
				</div>
			</KDialog.Portal>
		</KDialog>
	);
}

function SectionLabel(props: { children: string }) {
	return (
		<h3 class="mb-2 font-medium text-micro text-muted uppercase tracking-wide">
			{props.children}
		</h3>
	);
}
