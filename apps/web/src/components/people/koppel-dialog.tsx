import { useMutation, useQuery, useQueryClient } from "@tanstack/solid-query";
import { createEffect, createSignal, on, Show } from "solid-js";
import { friendlyError } from "../../lib/errors";
import { orpc } from "../../lib/orpc";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Select } from "../ui/select";
import { toast } from "../ui/toast";

type Ref = { id: string; name: string } | null;

/**
 * Coach koppelen (INC-18): one vaste coach, and while that coach is away a
 * vervanger — another person — who reaches the leerling the same way until the
 * keyuser ends the vervanging. The server checks every rule; a refused change
 * keeps the koppelingen as they were and says why.
 */
export function KoppelDialog(props: {
	leerling: { id: string; name: string; vasteCoach: Ref; vervanger: Ref } | null;
	onOpenChange: (open: boolean) => void;
}) {
	const queryClient = useQueryClient();
	const coaches = useQuery(() => ({
		...orpc.people.coaches.list.queryOptions(),
		enabled: props.leerling !== null,
	}));
	const [vast, setVast] = createSignal<string | undefined>();
	const [vervanger, setVervanger] = createSignal<string | undefined>();

	createEffect(
		on(
			() => props.leerling,
			(l) => {
				setVast(l?.vasteCoach?.id);
				setVervanger(undefined);
			},
		),
	);

	const options = (exclude?: string) =>
		(coaches.data ?? [])
			.filter((c) => c.status === "actief" && c.id !== exclude)
			.map((c) => ({ value: c.id, label: c.name }));

	const set = useMutation(() =>
		orpc.people.koppeling.set.mutationOptions({
			onSuccess: (_res, input) => {
				void queryClient.invalidateQueries({ queryKey: orpc.people.key() });
				void queryClient.invalidateQueries({ queryKey: orpc.admin.assignments.key() });
				toast({
					title:
						input.kind === "vast"
							? "Vaste coach opgeslagen"
							: input.coachId
								? "Vervanger gekoppeld"
								: "Vervanging beëindigd",
					tone: "success",
				});
				props.onOpenChange(false);
			},
			onError: (error) =>
				toast({ title: "Niet gewijzigd", description: friendlyError(error), tone: "danger" }),
		}),
	);

	return (
		<Dialog
			open={props.leerling !== null}
			onOpenChange={props.onOpenChange}
			title="Coach koppelen"
			description={props.leerling ? `Voor ${props.leerling.name}` : undefined}
		>
			<Show when={props.leerling}>
				{(l) => (
					<div class="flex flex-col gap-6">
						<section class="flex flex-col gap-3">
							<h3 class="font-medium text-ink">Vaste coach</h3>
							<p class="text-small text-muted">
								De coach die de leerling begeleidt. Bij een wissel verliest de vorige coach de
								toegang.
							</p>
							<div class="flex flex-wrap items-end gap-2">
								<Select
									aria-label="Vaste coach"
									class="min-w-60 flex-1"
									options={options(l().vervanger?.id)}
									value={vast()}
									placeholder={coaches.isLoading ? "Laden…" : "Kies een coach"}
									onChange={setVast}
								/>
								<Button
									disabled={!vast() || vast() === l().vasteCoach?.id || set.isPending}
									onClick={() =>
										set.mutate({ leerlingId: l().id, kind: "vast", coachId: vast() ?? null })
									}
								>
									{l().vasteCoach ? "Wijzigen" : "Koppelen"}
								</Button>
							</div>
						</section>

						<section class="flex flex-col gap-3 border-line-2 border-t pt-5">
							<h3 class="font-medium text-ink">Vervanger</h3>
							<p class="text-small text-muted">
								Bij ziekte of afwezigheid van de vaste coach. De vaste coach blijft gekoppeld; de
								vervanger heeft dezelfde toegang tot je de vervanging beëindigt.
							</p>
							<Show
								when={l().vervanger}
								fallback={
									<Show
										when={l().vasteCoach}
										fallback={
											<p class="text-small text-ink-2">Koppel eerst een vaste coach.</p>
										}
									>
										<div class="flex flex-wrap items-end gap-2">
											<Select
												aria-label="Vervanger"
												class="min-w-60 flex-1"
												options={options(l().vasteCoach?.id)}
												value={vervanger()}
												placeholder="Kies een vervanger"
												onChange={setVervanger}
											/>
											<Button
												variant="ghost"
												disabled={!vervanger() || set.isPending}
												onClick={() =>
													set.mutate({
														leerlingId: l().id,
														kind: "vervanger",
														coachId: vervanger() ?? null,
													})
												}
											>
												Vervanger koppelen
											</Button>
										</div>
									</Show>
								}
							>
								{(v) => (
									<div class="flex flex-wrap items-center justify-between gap-3 rounded-2 border border-line bg-bg-2 px-4 py-3">
										<p class="text-body text-ink">
											{v().name} <span class="text-small text-muted">vervangt nu</span>
										</p>
										<Button
											variant="ghost"
											disabled={set.isPending}
											onClick={() =>
												set.mutate({ leerlingId: l().id, kind: "vervanger", coachId: null })
											}
										>
											Vervanging beëindigen
										</Button>
									</div>
								)}
							</Show>
						</section>
					</div>
				)}
			</Show>
		</Dialog>
	);
}
