import type { JSX } from "@solidjs/web";
import { Match, Switch } from "solid-js";
import type { RouteData } from "../../lib/route-data";
import { ErrorState } from "./error-state";

/**
 * Renders a loader result: the page for `granted`, a calm message for
 * `denied` and `error` (with a retry that reruns the loader).
 *
 *   const data = Route.useLoaderData();
 *   <RouteDataView data={data().tasks} what="de taken" onRetry={() => refresh(router, "tasks")}>
 *     {(tasks) => <TaskBoard tasks={tasks()} />}
 *   </RouteDataView>
 */
export function RouteDataView<T>(props: {
	data: RouteData<T>;
	/** Names the data in the error message ("de taken"). */
	what?: string;
	onRetry?: () => void;
	children: (value: () => T) => JSX.Element;
}) {
	return (
		<Switch>
			<Match when={props.data.access === "granted" && props.data}>
				{(data) => props.children(() => (data() as { value: T }).value)}
			</Match>
			<Match when={props.data.access === "denied"}>
				<p role="alert" class="rounded-3 border border-line bg-surface p-4 text-small text-ink-2">
					Je hebt hier geen toegang toe.
				</p>
			</Match>
			<Match when={props.data.access === "error" && props.data}>
				{(data) => (
					<ErrorState
						error={(data() as { error: unknown }).error}
						what={props.what}
						onRetry={props.onRetry}
					/>
				)}
			</Match>
		</Switch>
	);
}
