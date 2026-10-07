import { Tooltip as KTooltip } from "@kobalte/core/tooltip";
import type { JSX } from "solid-js";

export type TooltipProps = {
	/** Short label shown in the bubble. */
	content: string;
	/**
	 * Render the trigger yourself and spread `triggerProps` onto it, so the
	 * trigger can be a `<Link>` or `<button>` instead of a wrapper element.
	 */
	children: (triggerProps: Record<string, unknown>) => JSX.Element;
	placement?: "top" | "bottom" | "left" | "right";
};

/**
 * Small label bubble for icon-only controls, built on Kobalte. Opens on hover
 * and on keyboard focus, closes on Escape (WCAG 1.4.13). The trigger keeps its
 * own `aria-label`: the tooltip is a visual aid, not the accessible name.
 */
export function Tooltip(props: TooltipProps) {
	return (
		<KTooltip
			openDelay={300}
			closeDelay={0}
			placement={props.placement ?? "top"}
			gutter={6}
		>
			<KTooltip.Trigger
				as={(p: Record<string, unknown>) => props.children(p)}
			/>
			<KTooltip.Portal>
				<KTooltip.Content class="z-50 rounded-1 bg-ink px-2 py-1 text-micro font-medium text-white shadow-2 animate-fade-in">
					<KTooltip.Arrow size={8} />
					{props.content}
				</KTooltip.Content>
			</KTooltip.Portal>
		</KTooltip>
	);
}
