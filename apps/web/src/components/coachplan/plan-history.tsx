import { Link, useRouter } from "@tanstack/solid-router";
import { createSignal, For, Show } from "solid-js";
import { createAction } from "../../lib/action";
import { createLoad } from "../../lib/load";
import { client, type Output } from "../../lib/orpc";
import { refresh } from "../../lib/refresh";
import { PlanStatusBadge } from "../dashboard/plan-status";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { ErrorState } from "../ui/error-state";
import { toast } from "../ui/toast";

/**
 * INC-33: a leerling's coachplannen — the actuele plan and the earlier ones,
 * which stay with all their answers — and the coach's "Nieuw coachplan".
 */

export type Plans = Output<typeof client.coachplan.plans>;
export type Plan = Plans["plans"][number];

/** "12 oktober 2026" */
export function planDate(date: Date | string): string {
	return new Date(date).toLocaleDateString("nl-NL", {
		day: "numeric",
		month: "long",
		year: "numeric",
	});
}

/** "Plan na de zomer · versie 2": the form a plan was started on (AC3/AC7). */
export function formLabel(plan: { templateName: string; templateVersion: number }): string {
	return `${plan.templateName} · versie ${plan.templateVersion}`;
}

/** The coach's list of plans, each linking to its version(s) (AC6/AC7). */
export function PlanList(props: { plans: Plan[] }) {
	return (
		<ul class="flex flex-col gap-2" aria-label="Coachplannen">
			<For each={props.plans}>
				{(plan) => (
					<li
						class={[
							"flex flex-wrap items-center justify-between gap-3 rounded-2 border p-3",
							plan.actueel ? "border-primary bg-primary-50" : "border-line bg-bg-2",
						]}
					>
						<div class="min-w-0">
							<div class="flex flex-wrap items-center gap-2">
								<Badge variant={plan.actueel ? "primary" : "neutral"}>
									{plan.actueel ? "Actueel plan" : "Eerder plan"}
								</Badge>
								<span class="text-small font-medium text-ink">{formLabel(plan)}</span>
							</div>
							<p class="mt-1 text-micro text-muted">
								Toegewezen op {planDate(plan.assignedAt)}
								{plan.assignedByName ? ` door ${plan.assignedByName}` : ""}
								<Show when={plan.replacedAt}>
									{(at) => <> · vervangen op {planDate(at())}</>}
								</Show>
							</p>
							<Show when={plan.versions.length > 1}>
								<p class="mt-1 flex flex-wrap items-center gap-2 text-micro text-muted">
									Versies:
									<For each={plan.versions.toReversed()}>
										{(v) => (
											<Link
												to="/plan/$submissionId"
												params={{ submissionId: v.id }}
												class="text-primary-700 underline"
												aria-label={`Versie ${v.version} van dit plan openen`}
											>
												{v.version}
											</Link>
										)}
									</For>
								</p>
							</Show>
						</div>
						<div class="flex items-center gap-2">
							<Show when={plan.shown}>
								{(v) => (
									<>
										<PlanStatusBadge status={v().status} />
										<Link
											to="/plan/$submissionId"
											params={{ submissionId: v().id }}
											class="btn ghost sm"
											aria-label={`${plan.actueel ? "Actueel plan" : "Eerder plan"} ${formLabel(plan)} openen`}
										>
											Openen
										</Link>
									</>
								)}
							</Show>
						</div>
					</li>
				)}
			</For>
		</ul>
	);
}

/**
 * "Nieuw coachplan": the coach picks a published form of the school (AC2/AC3)
 * and starts an empty plan on it. The plan the coach saw as actueel goes along
 * (`replacesPlanId`), so a second click or another coach can't make two
 * (AC9).
 */
export function AssignPlanDialog(props: {
	leerlingId: string;
	leerlingName: string;
	actuele: Plan | null;
}) {
	const router = useRouter();
	const [open, setOpen] = createSignal(false);
	const [choice, setChoice] = createSignal<string | null>(null);
	const forms = createLoad(
		() => open() && props.leerlingId,
		(leerlingId, signal) => client.coachplan.assignableTemplates({ leerlingId }, { signal }),
	);
	const none = () => forms.data()?.length === 0;
	// The actuele plan isn't finished: say what happens to it.
	const inProgress = () => {
		const status = props.actuele?.shown?.status;
		return Boolean(status) && status !== "shared_with_leerling" && status !== "completed";
	};

	const assign = createAction(
		async (templateId: string) => {
			try {
				await client.coachplan.assignNewPlan({
					leerlingId: props.leerlingId,
					templateId,
					replacesPlanId: props.actuele?.id ?? null,
				});
				toast({
					title: "Nieuw coachplan toegewezen",
					description: `${props.leerlingName} krijgt er een melding van.`,
					tone: "success",
				});
				setOpen(false);
				setChoice(null);
			} finally {
				// Also after a refusal: show the plans as they are now.
				await refresh(router, "coachplan");
			}
		},
		{ error: "Toewijzen lukte niet" },
	);

	return (
		<Dialog
			open={open()}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) setChoice(null);
			}}
			title="Nieuw coachplan"
			description={`Kies een formulier van de school voor ${props.leerlingName}. Het nieuwe plan begint leeg en wordt het actuele plan.`}
			trigger={{ children: "Nieuw coachplan", variant: "ghost", size: "sm" }}
			footer={
				<>
					<Button variant="ghost" onClick={() => setOpen(false)}>
						Annuleren
					</Button>
					<Button
						disabled={!choice() || assign.pending()}
						onClick={() => {
							const id = choice();
							if (id) void assign.run(id);
						}}
					>
						{assign.pending() ? "Bezig…" : "Plan toewijzen"}
					</Button>
				</>
			}
		>
			<div class="flex flex-col gap-4">
				<Show when={forms.loading() && !forms.data()}>
					<p class="text-small text-muted" role="status">
						Formulieren laden…
					</p>
				</Show>
				<Show when={forms.error()}>
					<ErrorState
						error={forms.error()}
						what="de formulieren"
						onRetry={() => forms.reload()}
					/>
				</Show>
				<Show when={none()}>
					<p class="rounded-2 border border-line bg-bg-2 p-3 text-small text-ink-2" role="status">
						Er is nog geen gepubliceerd formulier van de school. Vraag de keyuser om
						er een te publiceren; daarna kun je een nieuw plan toewijzen.
					</p>
				</Show>
				<Show when={(forms.data()?.length ?? 0) > 0}>
					<fieldset class="flex flex-col gap-2">
						<legend class="mb-2 text-small font-medium text-ink">Formulier</legend>
						<For each={forms.data()}>
							{(form) => (
								<label
									class={[
										"flex cursor-pointer items-start gap-3 rounded-2 border p-3",
										choice() === form.id ? "border-primary bg-primary-50" : "border-line",
									]}
								>
									<input
										type="radio"
										name="formulier"
										value={form.id}
										checked={choice() === form.id}
										onChange={() => setChoice(form.id)}
										class="mt-1"
									/>
									<span class="min-w-0">
										<span class="block text-small font-medium text-ink">
											{form.name} · versie {form.version}
										</span>
										<Show when={form.isSchoolDefault}>
											<span class="block text-micro text-muted">Standaard van de school</span>
										</Show>
										<Show when={form.description}>
											<span class="block text-micro text-muted">{form.description}</span>
										</Show>
									</span>
								</label>
							)}
						</For>
					</fieldset>
					<Show when={props.actuele}>
						<p class="text-small text-ink-2">
							Het huidige plan blijft bewaard bij de eerdere plannen, met alle antwoorden.
							<Show when={inProgress()}>
								{" "}
								Het is nog niet gedeeld met de leerling en kan daarna niet meer worden
								ingevuld.
							</Show>
						</p>
					</Show>
				</Show>
			</div>
		</Dialog>
	);
}
