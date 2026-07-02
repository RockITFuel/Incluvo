import { createFileRoute, Link } from "@tanstack/solid-router";
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { Plus } from "lucide-solid";
import { createSignal, For, Show } from "solid-js";
import { Button } from "../../../components/ui/button";
import { TaskBoard } from "../../../components/tasks/task-board";
import { useMe } from "../../../lib/auth/use-me";
import { orpc } from "../../../lib/orpc";
import { useServerEvent } from "../../../lib/sse/use-events";

/**
 * Takenlijst (#37–#41) — a 1:1 port of the approved "Taken" prototype. A
 * leerling sees their own list split into Vandaag / Toekomst / Klaar and can
 * check off, pin and add tasks. A coach lands here too but is pointed to a
 * leerling to manage (the coach view lives at `/taken/$leerlingId`).
 */
export const Route = createFileRoute("/_protected/taken/")({
	component: TakenPage,
});

function TakenPage() {
	const me = useMe();
	const queryClient = useQueryClient();
	const [adding, setAdding] = createSignal(false);

	const tasksQuery = useQuery(() => ({
		...orpc.tasks.list.queryOptions({ input: {} }),
		// A coach has no own task list; don't fetch for them.
		enabled: me.is("leerling"),
	}));

	useServerEvent("task.changed", () =>
		queryClient.invalidateQueries({ queryKey: orpc.tasks.list.key() }),
	);

	return (
		<>
			<div class="page-head">
				<div>
					<h1>Mijn taken</h1>
					<div class="sub">Splits per dag — focus op vandaag, zicht op de week.</div>
				</div>
				<Show when={me.is("leerling")}>
					<div class="ds-row">
						<button type="button" class="btn ghost" onClick={() => setAdding(true)}>
							<Plus class="size-3.5" aria-hidden="true" /> Taak toevoegen
						</button>
					</div>
				</Show>
			</div>

			{/* Leerling view */}
			<Show when={me.is("leerling")}>
				<Show when={tasksQuery.isLoading}>
					<p class="text-muted">Laden…</p>
				</Show>
				<Show when={tasksQuery.error}>
					<p class="text-danger">Kon taken niet laden.</p>
				</Show>
				<Show when={tasksQuery.data}>
					{(data) => (
						<Show
							when={!data().listHidden}
							fallback={
								<p class="text-muted">
									Je coach heeft je takenlijst tijdelijk uitgezet.
								</p>
							}
						>
							<TaskBoard
								data={data()}
								canManage={true}
								adding={adding()}
								onAddingChange={setAdding}
							/>
						</Show>
					)}
				</Show>
			</Show>

			{/* Coach view: point them to a leerling to manage. */}
			<Show when={me.hasAtLeast("coach")}>
				<div class="ds-col" style={{ gap: "8px", "margin-top": "24px" }}>
					<p class="card-sub">
						Kies een leerling om diens takenlijst te bekijken en te beheren.
					</p>
					<CoachLeerlingPicker />
				</div>
			</Show>
		</>
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
			<ul class="ds-col" style={{ gap: "8px" }}>
				<For each={leerlingen()}>
					{(u) => (
						<li>
							<Link to="/taken/$leerlingId" params={{ leerlingId: u.id }}>
								<Button variant="subtle">{u.name}</Button>
							</Link>
						</li>
					)}
				</For>
				<Show when={leerlingen().length === 0}>
					<p class="text-muted">Geen leerlingen in je organisatie.</p>
				</Show>
			</ul>
		</Show>
	);
}
