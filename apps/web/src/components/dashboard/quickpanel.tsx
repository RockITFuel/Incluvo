import { Dialog as KDialog } from "@kobalte/core/dialog";
import { Link } from "@tanstack/solid-router";
import { useQuery } from "@tanstack/solid-query";
import {
	ArrowRight,
	ListChecks,
	MessageSquare,
	NotebookPen,
	X,
} from "lucide-solid";
import { For, type JSX, Show } from "solid-js";
import { cn } from "../../lib/cn";
import { orpc } from "../../lib/orpc";
import { PlanStatusBadge } from "./plan-status";

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

	const query = useQuery(() => ({
		...orpc.dashboard.quickpanel.queryOptions({
			input: { leerlingId: props.leerlingId ?? "" },
		}),
		enabled: isOpen(),
	}));

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
								style={{ width: "48px", height: "48px", "font-size": "16px" }}
								aria-hidden="true"
							>
								{initials(query.data?.leerling.name ?? "…")}
							</div>
							<div class="ds-grow" style={{ "min-width": "0" }}>
								<KDialog.Title
									style={{
										"font-family": "var(--font-head)",
										"font-weight": "600",
										"font-size": "18px",
										overflow: "hidden",
										"text-overflow": "ellipsis",
										"white-space": "nowrap",
									}}
								>
									{query.data?.leerling.name ?? "Leerling"}
								</KDialog.Title>
								<KDialog.Description
									style={{
										"font-size": "13px",
										color: "rgb(var(--muted))",
										overflow: "hidden",
										"text-overflow": "ellipsis",
										"white-space": "nowrap",
									}}
								>
									{query.data?.leerling.email ?? ""}
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
							<Show
								when={!query.isLoading}
								fallback={
									<p style={{ color: "rgb(var(--muted))" }}>Laden…</p>
								}
							>
								{/* Coachplan status */}
								<section>
									<SectionLabel>Coachplan</SectionLabel>
									<div class="ds-row" style={{ gap: "8px" }}>
										<PlanStatusBadge
											status={query.data?.plan.status ?? "niet_ingevuld"}
										/>
										<Show when={(query.data?.plan.discussCount ?? 0) > 0}>
											<span class="chip accent">
												{query.data?.plan.discussCount} bespreken
											</span>
										</Show>
									</div>
								</section>

								{/* Leervoorkeuren */}
								<section>
									<SectionLabel>Leervoorkeuren</SectionLabel>
									<Show
										when={(query.data?.leervoorkeuren.length ?? 0) > 0}
										fallback={
											<p
												style={{
													"font-size": "13px",
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
											<For each={query.data?.leervoorkeuren}>
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
												"font-size": "12px",
												color: "rgb(var(--muted))",
											}}
										>
											{query.data?.tasksToday.length ?? 0} vandaag
										</span>
									</div>
									<Show
										when={(query.data?.tasksToday.length ?? 0) > 0}
										fallback={
											<p
												style={{
													"font-size": "13px",
													color: "rgb(var(--muted))",
												}}
											>
												Geen open taken voor vandaag.
											</p>
										}
									>
										<div class="ds-col" style={{ gap: "6px" }}>
											<For each={query.data?.tasksToday}>
												{(t) => (
													<div
														class="ds-row ds-between"
														style={{
															padding: "10px 12px",
															background: "rgb(var(--bg-2))",
															"border-radius": "8px",
															"font-size": "13px",
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
										when={(query.data?.courses.length ?? 0) > 0}
										fallback={
											<p
												style={{
													"font-size": "13px",
													color: "rgb(var(--muted))",
												}}
											>
												Geen actieve cursussen.
											</p>
										}
									>
										<div class="ds-col" style={{ gap: "6px" }}>
											<For each={query.data?.courses}>
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
																"font-size": "13px",
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
																"font-size": "12px",
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
		</KDialog>
	);
}

function SectionLabel(props: { children: JSX.Element; noMargin?: boolean }) {
	return (
		<h3
			style={{
				"font-size": "12px",
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
