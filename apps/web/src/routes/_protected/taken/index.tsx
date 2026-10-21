import { createFileRoute, Link, useRouter } from "@tanstack/solid-router";
import { createSignal, For, Show } from "solid-js";
import { TaskBoard } from "../../../components/tasks/task-board";
import { Button } from "../../../components/ui/button";
import { RouteDataView } from "../../../components/ui/route-data-view";
import { useMe } from "../../../lib/auth/use-me";
import { Plus } from "../../../lib/icons";
import { client } from "../../../lib/orpc";
import { refresh } from "../../../lib/refresh";
import { loadRouteData } from "../../../lib/route-data";
import { useServerEvent } from "../../../lib/sse/use-events";

/**
 * Takenlijst (#37–#41) — a 1:1 port of the approved "Taken" prototype. A
 * leerling sees their own list split into Vandaag / Toekomst / Klaar and can
 * check off, pin and add tasks. A coach lands here too but is pointed to a
 * leerling to manage (the coach view lives at `/taken/$leerlingId`).
 */
export const Route = createFileRoute("/_protected/taken/")({
	loader: async ({ context, abortController }) => {
		const signal = abortController.signal;
		// A coach has no own task list but picks a leerling.
		return context.me.role === "leerling"
			? {
					view: "leerling" as const,
					tasks: await loadRouteData(signal, (s) => client.tasks.list({}, { signal: s })),
				}
			: {
					view: "coach" as const,
					users: await loadRouteData(signal, (s) =>
						client.account.users.listInTenant(undefined, { signal: s }),
					),
				};
	},
	component: TakenPage,
});

function TakenPage() {
	const me = useMe();
	const router = useRouter();
	const data = Route.useLoaderData();
	const [adding, setAdding] = createSignal(false);

	useServerEvent("task.changed", () => void refresh(router, "tasks"));

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

			<Show when={data().view === "leerling" && data().tasks}>
				{(tasks) => (
					<RouteDataView
						data={tasks()}
						what="je taken"
						onRetry={() => void refresh(router, "tasks")}
					>
						{(list) => (
							<Show
								when={!list().listHidden}
								fallback={
									<p class="text-muted">Je coach heeft je takenlijst tijdelijk uitgezet.</p>
								}
							>
								<TaskBoard
									data={list()}
									canManage={true}
									adding={adding()}
									onAddingChange={setAdding}
								/>
							</Show>
						)}
					</RouteDataView>
				)}
			</Show>

			{/* Coach view: point them to a leerling to manage. */}
			<Show when={data().view === "coach" && data().users}>
				{(users) => (
					<div class="ds-col" style={{ gap: "8px", "margin-top": "24px" }}>
						<p class="card-sub">
							Kies een leerling om diens takenlijst te bekijken en te beheren.
						</p>
						<RouteDataView
							data={users()}
							what="de leerlingen"
							onRetry={() => void refresh(router, "people")}
						>
							{(list) => <CoachLeerlingPicker users={list()} />}
						</RouteDataView>
					</div>
				)}
			</Show>
		</>
	);
}

function CoachLeerlingPicker(props: { users: { id: string; name: string; role: string }[] }) {
	const leerlingen = () => props.users.filter((u) => u.role === "leerling");

	return (
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
	);
}
