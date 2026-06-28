import { createFileRoute, Link } from "@tanstack/solid-router";
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { Show } from "solid-js";
import { Button } from "../../../components/ui/button";
import { TaskBoard } from "../../../components/tasks/task-board";
import { useMe } from "../../../lib/auth/use-me";
import { orpc } from "../../../lib/orpc";
import { useServerEvent } from "../../../lib/sse/use-events";

/**
 * Takenlijst (#37–#41). A leerling sees their own list split into Vandaag /
 * Toekomst / Klaar and can check off, pin and add tasks. A coach lands here too
 * but is pointed to a leerling to manage (the coach view lives at
 * `/taken/$leerlingId`).
 */
export const Route = createFileRoute("/_protected/taken/")({
	component: TakenPage,
});

function TakenPage() {
	const me = useMe();
	const queryClient = useQueryClient();

	const tasksQuery = useQuery(() => ({
		...orpc.tasks.list.queryOptions({ input: {} }),
		// A coach has no own task list; don't fetch for them.
		enabled: me.is("leerling"),
	}));

	useServerEvent("task.changed", () =>
		queryClient.invalidateQueries({ queryKey: orpc.tasks.list.key() }),
	);

	return (
		<section class="flex flex-col gap-6">
			<div>
				<h1 class="font-head text-h1 text-ink">Mijn taken</h1>
				<p class="mt-1 text-body text-muted">
					Splits per dag — focus op vandaag, zicht op de week.
				</p>
			</div>

			{/* Leerling view */}
			<Show when={me.is("leerling")}>
				<Show when={tasksQuery.isLoading}>
					<p class="text-muted">Laden…</p>
				</Show>
				<Show when={tasksQuery.error}>
					<p class="text-danger">Kon taken niet laden.</p>
				</Show>
				<Show when={tasksQuery.data} keyed>
					{(data) => (
						<Show
							when={!data.listHidden}
							fallback={
								<p class="text-muted">
									Je coach heeft je takenlijst tijdelijk uitgezet.
								</p>
							}
						>
							<TaskBoard data={data} canManage={true} />
						</Show>
					)}
				</Show>
			</Show>

			{/* Coach view: point them to a leerling to manage. */}
			<Show when={me.hasAtLeast("coach")}>
				<div class="flex flex-col gap-2">
					<p class="text-body text-muted">
						Kies een leerling om diens takenlijst te bekijken en te beheren.
					</p>
					<CoachLeerlingPicker />
				</div>
			</Show>
		</section>
	);
}

function CoachLeerlingPicker() {
	const usersQuery = useQuery(() =>
		orpc.account.users.listInTenant.queryOptions(),
	);
	const leerlingen = () =>
		(usersQuery.data ?? []).filter((u) => u.role === "leerling");

	return (
		<Show
			when={!usersQuery.isLoading}
			fallback={<p class="text-muted">Leerlingen laden…</p>}
		>
			<ul class="flex flex-col gap-2">
				{leerlingen().map((u) => (
					<li>
						<Link to="/taken/$leerlingId" params={{ leerlingId: u.id }}>
							<Button variant="subtle">{u.name}</Button>
						</Link>
					</li>
				))}
				<Show when={leerlingen().length === 0}>
					<p class="text-muted">Geen leerlingen in je organisatie.</p>
				</Show>
			</ul>
		</Show>
	);
}
