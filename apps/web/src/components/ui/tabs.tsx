import { Tabs as KTabs } from "@kobalte/core/tabs";
import { For, type JSX, splitProps } from "solid-js";
import { cn } from "../../lib/cn";

export type TabItem = {
	value: string;
	label: string;
	content: JSX.Element;
};

export type TabsProps = {
	items: TabItem[];
	value?: string;
	defaultValue?: string;
	onChange?: (value: string) => void;
	class?: string;
	"aria-label"?: string;
};

/**
 * Accessible tabs (roving tabindex, arrow-key navigation, aria-selected) on
 * Kobalte, with an animated indicator that respects reduce-motion.
 */
export function Tabs(props: TabsProps) {
	const [local] = splitProps(props, [
		"items",
		"value",
		"defaultValue",
		"onChange",
		"class",
		"aria-label",
	]);
	return (
		<KTabs
			class={cn("flex flex-col gap-4", local.class)}
			value={local.value}
			defaultValue={local.defaultValue ?? local.items[0]?.value}
			onChange={local.onChange}
		>
			<KTabs.List
				aria-label={local["aria-label"]}
				class="relative flex gap-1 border-line border-b"
			>
				<For each={local.items}>
					{(item) => (
						<KTabs.Trigger
							value={item.value}
							class="relative px-3 py-2 text-small font-medium text-muted outline-none transition-colors duration-fast hover:text-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-[selected]:text-primary-700"
						>
							{item.label}
						</KTabs.Trigger>
					)}
				</For>
				<KTabs.Indicator class="absolute bottom-0 h-0.5 bg-primary transition-all duration-fast" />
			</KTabs.List>
			<For each={local.items}>
				{(item) => (
					<KTabs.Content value={item.value} class="outline-none">
						{item.content}
					</KTabs.Content>
				)}
			</For>
		</KTabs>
	);
}
