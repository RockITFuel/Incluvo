import { Dialog as KDialog } from "@kobalte/core/dialog";
import { X } from "lucide-solid";
import { type JSX, Show, splitProps } from "solid-js";
import { cn } from "../../lib/cn";

export type DialogProps = {
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	/** Optional trigger element; omit to control `open` yourself. */
	trigger?: JSX.Element;
	title?: string;
	description?: string;
	children?: JSX.Element;
	footer?: JSX.Element;
	class?: string;
	/** Hide the default close (×) button in the corner. */
	hideClose?: boolean;
};

/**
 * Accessible modal dialog (focus trap, Esc to close, scroll lock, labelled by
 * title/description) built on Kobalte. Use either as controlled (`open` +
 * `onOpenChange`) or uncontrolled with a `trigger`.
 */
export function Dialog(props: DialogProps) {
	const [local] = splitProps(props, [
		"open",
		"onOpenChange",
		"trigger",
		"title",
		"description",
		"children",
		"footer",
		"class",
		"hideClose",
	]);
	return (
		<KDialog open={local.open} onOpenChange={local.onOpenChange}>
			<Show when={local.trigger}>
				<KDialog.Trigger as="div">{local.trigger}</KDialog.Trigger>
			</Show>
			<KDialog.Portal>
				<KDialog.Overlay class="fixed inset-0 z-50 bg-ink/40 animate-fade-in" />
				<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
					<KDialog.Content
						class={cn(
							"w-full max-w-lg rounded-4 border border-line bg-surface p-6 shadow-3 animate-scale-in",
							local.class,
						)}
					>
						<div class="mb-4 flex items-start justify-between gap-4">
							<div class="flex flex-col gap-1">
								<Show when={local.title}>
									<KDialog.Title class="font-head text-h3 text-ink">
										{local.title}
									</KDialog.Title>
								</Show>
								<Show when={local.description}>
									<KDialog.Description class="text-small text-muted">
										{local.description}
									</KDialog.Description>
								</Show>
							</div>
							<Show when={!local.hideClose}>
								<KDialog.CloseButton
									aria-label="Sluiten"
									class="-mr-1 -mt-1 grid size-8 place-items-center rounded-2 text-muted hover:bg-line-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
								>
									<X class="size-4" />
								</KDialog.CloseButton>
							</Show>
						</div>
						<div class="text-body text-ink-2">{local.children}</div>
						<Show when={local.footer}>
							<div class="mt-6 flex justify-end gap-2">{local.footer}</div>
						</Show>
					</KDialog.Content>
				</div>
			</KDialog.Portal>
		</KDialog>
	);
}
