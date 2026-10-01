import type { LucideProps } from "lucide-solid";
import type { JSX } from "solid-js";

/** KPI tile for the dashboards: label, big value, subline and a tinted icon. */
export function KPI(props: {
	label: string;
	value: string;
	sub: string;
	tone: "primary" | "accent" | "warning" | "success";
	icon: (p: LucideProps) => JSX.Element;
}) {
	const bg = () =>
		props.tone === "primary"
			? "rgb(var(--primary-100))"
			: props.tone === "accent"
				? "rgb(var(--accent-100))"
				: props.tone === "warning"
					? "rgb(var(--warning-100))"
					: "rgb(var(--success-100))";
	const fg = () =>
		props.tone === "primary"
			? "rgb(var(--primary-700))"
			: props.tone === "accent"
				? "rgb(var(--accent-700))"
				: props.tone === "warning"
					? "rgb(var(--warning))"
					: "rgb(var(--success))";
	return (
		<div class="card" style={{ padding: "18px" }}>
			<div class="ds-row ds-between" style={{ "margin-bottom": "8px" }}>
				<div
					style={{
						"font-size": "0.75rem",
						color: "rgb(var(--muted))",
						"font-weight": "600",
						"text-transform": "uppercase",
						"letter-spacing": "0.06em",
					}}
				>
					{props.label}
				</div>
				<div
					style={{
						width: "30px",
						height: "30px",
						"border-radius": "9px",
						background: bg(),
						color: fg(),
						display: "grid",
						"place-items": "center",
						"flex-shrink": "0",
					}}
				>
					<props.icon class="size-4" aria-hidden="true" />
				</div>
			</div>
			<div
				style={{
					"font-family": "var(--font-head)",
					"font-size": "1.75rem",
					"font-weight": "600",
					"line-height": "1",
				}}
			>
				{props.value}
			</div>
			<div
				style={{
					"font-size": "0.75rem",
					color: "rgb(var(--muted))",
					"margin-top": "6px",
				}}
			>
				{props.sub}
			</div>
		</div>
	);
}
