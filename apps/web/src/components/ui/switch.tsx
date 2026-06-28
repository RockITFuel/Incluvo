import { Switch as KSwitch } from "@kobalte/core/switch";
import { Show, splitProps } from "solid-js";
import { cn } from "../../lib/cn";

export type SwitchProps = {
	checked?: boolean;
	onChange?: (checked: boolean) => void;
	label?: string;
	description?: string;
	disabled?: boolean;
	class?: string;
	"aria-label"?: string;
};

/** Accessible on/off toggle (role=switch) built on Kobalte. */
export function Switch(props: SwitchProps) {
	const [local] = splitProps(props, [
		"checked",
		"onChange",
		"label",
		"description",
		"disabled",
		"class",
		"aria-label",
	]);
	return (
		<KSwitch
			class={cn("flex items-center justify-between gap-3", local.class)}
			checked={local.checked}
			onChange={local.onChange}
			disabled={local.disabled}
			aria-label={local["aria-label"]}
		>
			<Show when={local.label || local.description}>
				<div class="flex flex-col">
					<Show when={local.label}>
						<KSwitch.Label class="text-small font-medium text-ink-2">
							{local.label}
						</KSwitch.Label>
					</Show>
					<Show when={local.description}>
						<KSwitch.Description class="text-micro text-muted">
							{local.description}
						</KSwitch.Description>
					</Show>
				</div>
			</Show>
			<KSwitch.Input class="peer" />
			<KSwitch.Control class="inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-pill bg-line px-0.5 transition-colors duration-fast peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring data-[checked]:bg-primary">
				<KSwitch.Thumb class="size-5 rounded-full bg-white shadow-1 transition-transform duration-fast data-[checked]:translate-x-5" />
			</KSwitch.Control>
		</KSwitch>
	);
}
