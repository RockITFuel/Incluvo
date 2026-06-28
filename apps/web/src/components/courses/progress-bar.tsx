import { Show } from "solid-js";

/**
 * Voortgangsbalk (#24): percentage of progress-counting blocks completed.
 * Hidden entirely when the coach has closed the "oogje" (progressBarHidden).
 */
export function CourseProgressBar(props: {
	percent: number;
	done: number;
	total: number;
	hidden?: boolean;
}) {
	return (
		<Show when={!props.hidden}>
			<div class="flex flex-col gap-1.5">
				<div class="flex items-center justify-between text-small text-muted">
					<span>Voortgang</span>
					<span aria-hidden="true">
						{props.done}/{props.total} · {props.percent}%
					</span>
				</div>
				<div
					class="h-3 w-full overflow-hidden rounded-pill bg-line-2"
					role="progressbar"
					aria-valuenow={props.percent}
					aria-valuemin={0}
					aria-valuemax={100}
					aria-label={`Cursusvoortgang ${props.percent} procent`}
				>
					<div
						class="h-full rounded-pill bg-primary transition-[width] duration-300"
						style={{ width: `${props.percent}%` }}
					/>
				</div>
			</div>
		</Show>
	);
}
