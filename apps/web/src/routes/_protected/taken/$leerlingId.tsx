import { createFileRoute, Link } from "@tanstack/solid-router";
import {
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/solid-query";
import { Show } from "solid-js";
import { Card } from "../../../components/ui/card";
import { Switch } from "../../../components/ui/switch";
import { toast } from "../../../components/ui/toast";
import { TaskBoard } from "../../../components/tasks/task-board";
import { requireRole } from "../../../lib/auth/require-role";
import { orpc } from "../../../lib/orpc";
import { useServerEvent } from "../../../lib/sse/use-events";

/**
 * Coach view of a leerling's takenlijst (#37–#41). A coach can add tasks, check
 * them off, adjust pinning and temporarily hide the whole list (#39). Gated to
 * coach+ in the UI; the server re-enforces tenant + ownership on every call.
 */
export const Route = createFileRoute("/_protected/taken/$leerlingId")({
	beforeLoad: () => requireRole("coach"),
	component: CoachTakenPage,
});

function CoachTakenPage() {
	const params = Route.useParams();
	const queryClient = useQueryClient();

	const leerlingId = () => params().leerlingId;

	const tasksQuery = useQuery(() =>
		orpc.tasks.list.queryOptions({ input: { leerlingId: leerlingId() } }),
	);

	useServerEvent("task.changed", () =>
		queryClient.invalidateQueries({ queryKey: orpc.tasks.list.key() }),
	);

	const hideList = useMutation(() =>
		orpc.tasks.setListHidden.mutationOptions({
			onSuccess: (res) => {
				queryClient.invalidateQueries({ queryKey: orpc.tasks.list.key() });
				toast({
					title: res.listHidden
						? "Takenlijst uitgezet"
						: "Takenlijst weer zichtbaar",
					tone: "success",
				});
			},
			onError: () =>
				toast({ title: "Kon takenlijst niet wijzigen", tone: "danger" }),
		}),
	);

	return (
		<section class="flex flex-col gap-6">
			<div>
				<Link
					to="/taken"
					class="text-small text-muted hover:text-ink-2"
				>
					← Alle leerlingen
				</Link>
				<h1 class="mt-1 font-head text-h1 text-ink">Takenlijst leerling</h1>
				<p class="mt-1 text-body text-muted">
					Beheer de taken van deze leerling: voeg toe, vink af of pas de
					planning aan.
				</p>
			</div>

			<Show when={tasksQuery.isLoading}>
				<p class="text-muted">Laden…</p>
			</Show>
			<Show when={tasksQuery.error}>
				<p class="text-danger">Kon taken niet laden.</p>
			</Show>

			<Show when={tasksQuery.data} keyed>
				{(data) => (
					<>
						{/* Hide toggle (#39) */}
						<Card padding="sm">
							<Switch
								checked={data.listHidden}
								disabled={hideList.isPending}
								label="Takenlijst tijdelijk uitzetten"
								description="De leerling ziet zijn takenlijst dan niet."
								onChange={(hidden) =>
									hideList.mutate({ leerlingId: leerlingId(), hidden })
								}
							/>
						</Card>

						<TaskBoard
							data={data}
							leerlingId={leerlingId()}
							canManage={true}
							isCoach={true}
						/>
					</>
				)}
			</Show>
		</section>
	);
}
