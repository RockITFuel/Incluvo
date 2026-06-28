import { ToggleGroup } from "@kobalte/core/toggle-group";
import { For, splitProps } from "solid-js";
import { cn } from "../../lib/cn";

export type SegmentOption<T extends string> = { value: T; label: string };

export type SegmentedControlProps<T extends string> = {
	options: SegmentOption<T>[];
	value: T;
	onChange: (value: T) => void;
	class?: string;
	"aria-label"?: string;
};

/**
 * Single-select segmented control (the demo's `.seg`), built on Kobalte's
 * ToggleGroup for roving-tabindex keyboard navigation and aria-pressed state.
 * Always keeps a value selected.
 */
export function SegmentedControl<T extends string>(
	props: SegmentedControlProps<T>,
) {
	const [local] = splitProps(props, [
		"options",
		"value",
		"onChange",
		"class",
		"aria-label",
	]);
	return (
		<ToggleGroup
			class={cn(
				"inline-flex gap-0.5 rounded-2 border border-line bg-bg p-0.5",
				local.class,
			)}
			value={local.value}
			aria-label={local["aria-label"]}
			onChange={(v) => {
				if (typeof v === "string") local.onChange(v as T);
			}}
		>
			<For each={local.options}>
				{(opt) => (
					<ToggleGroup.Item
						value={opt.value}
						class="rounded-1 px-2.5 py-1 text-micro font-medium text-muted outline-none transition-colors duration-fast hover:text-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-[pressed]:bg-surface data-[pressed]:text-ink data-[pressed]:shadow-1"
					>
						{opt.label}
					</ToggleGroup.Item>
				)}
			</For>
		</ToggleGroup>
	);
}
