import { createFileRoute, Link, useRouter } from "@tanstack/solid-router";
import { TaskBoard } from "../../../components/tasks/task-board";
import { Card } from "../../../components/ui/card";
import { RouteDataView } from "../../../components/ui/route-data-view";
import { Switch } from "../../../components/ui/switch";
import { toast } from "../../../components/ui/toast";
import { createAction } from "../../../lib/action";
import { requireRole } from "../../../lib/auth/role-guard";
import { client } from "../../../lib/orpc";
import { refresh } from "../../../lib/refresh";
import { loadRouteData } from "../../../lib/route-data";
import { useServerEvent } from "../../../lib/sse/use-events";

/**
 * Coach view of a leerling's takenlijst (#37–#41). A coach can add tasks, check
 * them off, adjust pinning and temporarily hide the whole list (#39). Gated to
 * the coach; the server re-enforces tenant + ownership on every call.
 */
export const Route = createFileRoute("/_protected/taken/$leerlingId")({
	beforeLoad: ({ context }) => requireRole(context.me, { min: "coach", coaching: true }),
	loader: ({ params, abortController }) =>
		loadRouteData(abortController.signal, (signal) =>
			client.tasks.list({ leerlingId: params.leerlingId }, { signal }),
		),
	component: CoachTakenPage,
});

function CoachTakenPage() {
	const params = Route.useParams();
	const router = useRouter();
	const tasks = Route.useLoaderData();

	const leerlingId = () => params().leerlingId;

	useServerEvent("task.changed", () => void refresh(router, "tasks"));

	const hideList = createAction(
		async (hidden: boolean) => {
			const res = await client.tasks.setListHidden({ leerlingId: leerlingId(), hidden });
			toast({
				title: res.listHidden ? "Takenlijst uitgezet" : "Takenlijst weer zichtbaar",
				tone: "success",
			});
			await refresh(router, "tasks");
		},
		{ error: "Kon takenlijst niet wijzigen" },
	);

	return (
		<section class="flex flex-col gap-6">
			<div>
				<Link
					to="/dashboard/$leerlingId"
					params={{ leerlingId: leerlingId() }}
					class="text-small text-muted hover:text-ink-2"
				>
					← Naar de leerling
				</Link>
				<h1 class="mt-1 font-head text-h1 text-ink">Takenlijst leerling</h1>
				<p class="mt-1 text-body text-muted">
					Beheer de taken van deze leerling: voeg toe, vink af of pas de planning aan.
				</p>
			</div>

			<RouteDataView data={tasks()} what="de taken" onRetry={() => void refresh(router, "tasks")}>
				{(data) => (
					<>
						{/* Hide toggle (#39) */}
						<Card padding="sm">
							<Switch
								checked={data().listHidden}
								disabled={hideList.pending()}
								label="Takenlijst tijdelijk uitzetten"
								description="De leerling ziet zijn takenlijst dan niet."
								onChange={(hidden) => void hideList.run(hidden)}
							/>
						</Card>

						<TaskBoard data={data()} leerlingId={leerlingId()} canManage={true} isCoach={true} />
					</>
				)}
			</RouteDataView>
		</section>
	);
}
