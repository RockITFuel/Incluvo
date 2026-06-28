import { Select as KSelect } from "@kobalte/core/select";
import { Check, ChevronDown } from "lucide-solid";
import { Show } from "solid-js";
import { cn } from "../../lib/cn";

export type SelectOption = { value: string; label: string };

export type SelectProps = {
	options: SelectOption[];
	value?: string;
	defaultValue?: string;
	onChange?: (value: string | undefined) => void;
	label?: string;
	placeholder?: string;
	description?: string;
	disabled?: boolean;
	class?: string;
	triggerClass?: string;
	"aria-label"?: string;
};

/**
 * Accessible single-select built on Kobalte. Works with the keyboard
 * (typeahead, arrow keys), renders into a portal, and respects the theme.
 */
export function Select(props: SelectProps) {
	const optionFor = (value: string | undefined) =>
		props.options.find((o) => o.value === value);

	return (
		<KSelect<SelectOption>
			class={cn("flex flex-col gap-1.5", props.class)}
			options={props.options}
			optionValue="value"
			optionTextValue="label"
			value={optionFor(props.value)}
			defaultValue={optionFor(props.defaultValue)}
			onChange={(opt) => props.onChange?.(opt?.value)}
			disabled={props.disabled}
			placeholder={props.placeholder}
			itemComponent={(itemProps) => (
				<KSelect.Item
					item={itemProps.item}
					class="flex cursor-pointer items-center justify-between gap-2 rounded-1 px-3 py-2 text-body text-ink outline-none data-[highlighted]:bg-primary-50 data-[highlighted]:text-primary-700 data-[disabled]:opacity-50"
				>
					<KSelect.ItemLabel>{itemProps.item.rawValue.label}</KSelect.ItemLabel>
					<KSelect.ItemIndicator>
						<Check class="size-4 text-primary" />
					</KSelect.ItemIndicator>
				</KSelect.Item>
			)}
		>
			<Show when={props.label}>
				<KSelect.Label class="text-small font-medium text-ink-2">
					{props.label}
				</KSelect.Label>
			</Show>
			<KSelect.Trigger
				aria-label={props["aria-label"]}
				class={cn(
					"flex w-full items-center justify-between gap-2 rounded-2 border border-line bg-surface px-ctl-x py-ctl-y text-body text-ink transition-colors duration-fast focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50",
					props.triggerClass,
				)}
			>
				<KSelect.Value<SelectOption> class="truncate data-[placeholder-shown]:text-muted-2">
					{(state) => state.selectedOption().label}
				</KSelect.Value>
				<KSelect.Icon>
					<ChevronDown class="size-4 text-muted" />
				</KSelect.Icon>
			</KSelect.Trigger>
			<Show when={props.description}>
				<KSelect.Description class="text-micro text-muted">
					{props.description}
				</KSelect.Description>
			</Show>
			<KSelect.Portal>
				<KSelect.Content class="z-50 overflow-hidden rounded-2 border border-line bg-surface p-1 shadow-3 animate-scale-in">
					<KSelect.Listbox class="max-h-64 overflow-y-auto" />
				</KSelect.Content>
			</KSelect.Portal>
		</KSelect>
	);
}
