import { Show } from "solid-js";

/**
 * Voortgangsbalk (#24): percentage of progress-counting blocks completed, styled
 * as the prototype's progress strip. Hidden entirely when the coach has closed
 * the "oogje" (progressBarHidden).
 */
export function CourseProgressBar(props: {
	percent: number;
	done: number;
	total: number;
	hidden?: boolean;
}) {
	return (
		<Show when={!props.hidden}>
			<div class="ds-col" style={{ gap: "6px" }}>
				<div
					class="ds-row ds-between"
					style={{ "font-size": "13px" }}
				>
					<span>Voortgang</span>
					<span style={{ color: "rgb(var(--muted))" }} aria-hidden="true">
						{props.done} van {props.total} klaar · {props.percent}%
					</span>
				</div>
				<div
					class="progress success"
					role="progressbar"
					aria-valuenow={props.percent}
					aria-valuemin={0}
					aria-valuemax={100}
					aria-label={`Cursusvoortgang ${props.percent} procent`}
				>
					<span style={{ width: `${props.percent}%` }} />
				</div>
			</div>
		</Show>
	);
}
