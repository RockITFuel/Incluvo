import { Dialog as KDialog } from "@kobalte/core/dialog";
import { Link } from "@tanstack/solid-router";
import {
	ArrowRight,
	ListChecks,
	Plus,
	MessageSquare,
	NotebookPen,
	X,
} from "../../lib/icons";
import type { JSX } from "@solidjs/web";
import { createSignal, For, Show } from "solid-js";
import { cn } from "../../lib/cn";
import { createLoad } from "../../lib/load";
import { client } from "../../lib/orpc";
import { PlanStatusBadge } from "./plan-status";
import { ErrorState } from "../../components/ui/error-state";
import { TaskCreateDialog } from "../tasks/task-create-dialog";

/**
 * Quickpanel slide-over (#43) — a 1:1 port of the approved prototype's panel.
 * Opens on a leerling row click and shows their coachplan status,
 * leervoorkeuren, today's tasks and active courses with progress, plus
 * snelacties (bericht / naar plan / volledig profiel).
 *
 * Built on Kobalte's Dialog for a focus-trap, Esc-to-close and scroll-lock,
 * positioned as a right-edge drawer; the inner markup uses the shared
 * design-system component classes (.chip, .progress, .btn) to match the design.
 */
export function Quickpanel(props: {
	leerlingId: string | null;
	planSubmissionId: string | null;
	/** Existing 1:1 conversation id for the Bericht snelactie (#42), if any. */
	conversationId: string | null;
	onClose: () => void;
}) {
	const isOpen = () => props.leerlingId !== null;

	const [taskOpen, setTaskOpen] = createSignal(false);
	// Loads when the panel opens for a leerling; a new leerling aborts the old request.
	const panel = createLoad(
		() => props.leerlingId,
		(leerlingId, signal) => client.dashboard.quickpanel({ leerlingId }, { signal }),
	);

	const initials = (name: string): string =>
		name
			.trim()
			.split(/\s+/)
			.map((w) => w[0] ?? "")
			.slice(0, 2)
			.join("")
			.toUpperCase();

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
						// Kobalte 2 alpha misses Escape (docs/solid-2-architecture.md).
						onKeyDown={(e: KeyboardEvent) => {
							if (e.key === "Escape") props.onClose();
						}}
						class={cn(
							"flex h-full w-[26rem] max-w-[100vw] flex-col overflow-y-auto border-line border-l bg-surface shadow-3",
							"motion-safe:animate-slide-in-right",
						)}
					>
						{/* Header */}
						<div
							style={{
								padding: "20px",
								"border-bottom": "1px solid rgb(var(--line))",
								display: "flex",
								"align-items": "center",
								gap: "12px",
							}}
						>
							<div
								class="avatar"
								style={{ width: "48px", height: "48px", "font-size": "1rem" }}
								aria-hidden="true"
							>
								{initials(panel.data()?.leerling.name ?? "…")}
							</div>
							<div class="ds-grow" style={{ "min-width": "0" }}>
								<KDialog.Title
									style={{
										"font-family": "var(--font-head)",
										"font-weight": "600",
										"font-size": "1.125rem",
										overflow: "hidden",
										"text-overflow": "ellipsis",
										"white-space": "nowrap",
									}}
								>
									{panel.data()?.leerling.name ?? "Leerling"}
								</KDialog.Title>
								<KDialog.Description
									style={{
										"font-size": "0.8125rem",
										color: "rgb(var(--muted))",
										overflow: "hidden",
										"text-overflow": "ellipsis",
										"white-space": "nowrap",
									}}
								>
									{panel.data()?.leerling.email ?? ""}
								</KDialog.Description>
							</div>
							<KDialog.CloseButton class="icon-btn" aria-label="Sluiten">
								<X class="size-4" aria-hidden="true" />
							</KDialog.CloseButton>
						</div>

						{/* Body */}
						<div
							style={{
								padding: "20px",
								display: "flex",
								"flex-direction": "column",
								gap: "18px",
								flex: "1",
							}}
						>
							<Show when={panel.error()}>
								<ErrorState
									error={panel.error()}
									what="deze leerling"
									onRetry={panel.reload}
								/>
							</Show>
							<Show
								when={panel.data() && !panel.error()}
								fallback={
									<Show when={panel.loading()}>
										<p style={{ color: "rgb(var(--muted))" }}>Laden…</p>
									</Show>
								}
							>
								{/* Coachplan status */}
								<section>
									<SectionLabel>Coachplan</SectionLabel>
									<div class="ds-row" style={{ gap: "8px" }}>
										<PlanStatusBadge
											status={panel.data()?.plan.status ?? "niet_ingevuld"}
										/>
										<Show when={(panel.data()?.plan.discussCount ?? 0) > 0}>
											<span class="chip accent">
												{panel.data()?.plan.discussCount} bespreken
											</span>
										</Show>
									</div>
								</section>

								{/* Leervoorkeuren */}
								<section>
									<SectionLabel>Leervoorkeuren</SectionLabel>
									<Show
										when={(panel.data()?.leervoorkeuren.length ?? 0) > 0}
										fallback={
											<p
												style={{
													"font-size": "0.8125rem",
													color: "rgb(var(--muted))",
												}}
											>
												Nog geen leervoorkeuren vastgelegd.
											</p>
										}
									>
										<div
											class="ds-row"
											style={{ "flex-wrap": "wrap", gap: "6px" }}
										>
											<For each={panel.data()?.leervoorkeuren}>
												{(v) => <span class="chip primary">{v}</span>}
											</For>
										</div>
									</Show>
								</section>

								{/* Open taken */}
								<section>
									<div
										class="ds-row ds-between"
										style={{ "margin-bottom": "8px" }}
									>
										<SectionLabel noMargin>Open taken</SectionLabel>
										<span
											style={{
												"font-size": "0.75rem",
												color: "rgb(var(--muted))",
											}}
										>
											{panel.data()?.tasksToday.length ?? 0} vandaag
										</span>
									</div>
									<Show
										when={(panel.data()?.tasksToday.length ?? 0) > 0}
										fallback={
											<p
												style={{
													"font-size": "0.8125rem",
													color: "rgb(var(--muted))",
												}}
											>
												Geen open taken voor vandaag.
											</p>
										}
									>
										<div class="ds-col" style={{ gap: "6px" }}>
											<For each={panel.data()?.tasksToday}>
												{(t) => (
													<div
														class="ds-row ds-between"
														style={{
															padding: "10px 12px",
															background: "rgb(var(--bg-2))",
															"border-radius": "8px",
															"font-size": "0.8125rem",
															gap: "8px",
														}}
													>
														<span
															class="ds-row"
															style={{ gap: "8px", "min-width": "0" }}
														>
															<ListChecks
																class="size-3.5"
																aria-hidden="true"
																style={{
																	color: "rgb(var(--muted))",
																	"flex-shrink": "0",
																}}
															/>
															<span
																style={{
																	overflow: "hidden",
																	"text-overflow": "ellipsis",
																	"white-space": "nowrap",
																}}
															>
																{t.title}
															</span>
														</span>
														<Show when={t.overdue}>
															<span class="chip danger">over tijd</span>
														</Show>
													</div>
												)}
											</For>
										</div>
									</Show>
								</section>

								{/* Actieve cursussen */}
								<section>
									<SectionLabel>Actieve cursussen</SectionLabel>
									<Show
										when={(panel.data()?.courses.length ?? 0) > 0}
										fallback={
											<p
												style={{
													"font-size": "0.8125rem",
													color: "rgb(var(--muted))",
												}}
											>
												Geen actieve cursussen.
											</p>
										}
									>
										<div class="ds-col" style={{ gap: "6px" }}>
											<For each={panel.data()?.courses}>
												{(c) => (
													<div
														class="ds-row ds-between"
														style={{
															padding: "8px 12px",
															background: "rgb(var(--bg-2))",
															"border-radius": "8px",
															gap: "12px",
														}}
													>
														<div
															style={{
																"font-size": "0.8125rem",
																"font-weight": "500",
																flex: "1",
																"min-width": "0",
																overflow: "hidden",
																"text-overflow": "ellipsis",
																"white-space": "nowrap",
															}}
														>
															{c.title}
														</div>
														<div
															style={{ width: "80px" }}
															role="progressbar"
															aria-valuenow={c.progress}
															aria-valuemin={0}
															aria-valuemax={100}
															aria-label={`Voortgang ${c.title}`}
														>
															<div class="progress">
																<span style={{ width: `${c.progress}%` }} />
															</div>
														</div>
														<div
															style={{
																"font-size": "0.75rem",
																color: "rgb(var(--muted))",
																width: "32px",
																"text-align": "right",
															}}
														>
															{c.progress}%
														</div>
													</div>
												)}
											</For>
										</div>
									</Show>
								</section>
							</Show>

							{/* Snelacties */}
							<div
								style={{
									"margin-top": "auto",
									display: "flex",
									"flex-direction": "column",
									gap: "8px",
									"border-top": "1px solid rgb(var(--line))",
									"padding-top": "16px",
								}}
							>
								<div
									class="ds-grid"
									style={{ "grid-template-columns": "1fr 1fr", gap: "8px" }}
								>
									<Link
										to="/chat"
										search={
											props.conversationId
												? { conversationId: props.conversationId }
												: { otherUserId: props.leerlingId ?? "" }
										}
										class="btn primary"
										style={{ "justify-content": "center" }}
									>
										<MessageSquare class="size-3.5" aria-hidden="true" /> Bericht
									</Link>
									<Show
										when={props.planSubmissionId}
										fallback={
											<span
												class="btn ghost"
												style={{
													"justify-content": "center",
													opacity: "0.5",
													"pointer-events": "none",
												}}
											>
												<NotebookPen class="size-3.5" aria-hidden="true" /> Naar
												plan
											</span>
										}
									>
										<Link
											to="/plan/$submissionId"
											params={{ submissionId: props.planSubmissionId ?? "" }}
											class="btn ghost"
											style={{ "justify-content": "center" }}
										>
											<NotebookPen class="size-3.5" aria-hidden="true" /> Naar
											plan
										</Link>
									</Show>
								</div>
								<Show when={props.leerlingId}>
									<button
										type="button"
										class="btn primary"
										style={{ "justify-content": "center" }}
										onClick={() => setTaskOpen(true)}
									>
										<Plus class="size-3.5" aria-hidden="true" /> Taak aanmaken
									</button>
									<Link
										to="/taken/$leerlingId"
										params={{ leerlingId: props.leerlingId ?? "" }}
										class="btn ghost"
										style={{ "justify-content": "center" }}
									>
										<ListChecks class="size-3.5" aria-hidden="true" /> Taken beheren
									</Link>
									<Link
										to="/dashboard/$leerlingId"
										params={{ leerlingId: props.leerlingId ?? "" }}
										class="btn ghost"
										style={{ "justify-content": "center" }}
									>
										Volledig profiel{" "}
										<ArrowRight class="size-3.5" aria-hidden="true" />
									</Link>
								</Show>
							</div>
						</div>
					</KDialog.Content>
				</div>
			</KDialog.Portal>
			<TaskCreateDialog
				leerlingId={props.leerlingId}
				leerlingName={panel.data()?.leerling.name}
				open={taskOpen()}
				onOpenChange={setTaskOpen}
			/>
		</KDialog>
	);
}

function SectionLabel(props: { children: JSX.Element; noMargin?: boolean }) {
	return (
		<h3
			style={{
				"font-size": "0.75rem",
				"font-weight": "600",
				color: "rgb(var(--muted))",
				"text-transform": "uppercase",
				"letter-spacing": "0.06em",
				"margin-bottom": props.noMargin ? "0" : "8px",
			}}
		>
			{props.children}
		</h3>
	);
}
