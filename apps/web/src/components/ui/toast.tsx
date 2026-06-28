import { Toast as KToast, toaster } from "@kobalte/core/toast";
import { CheckCircle2, Info, TriangleAlert, X, XCircle } from "lucide-solid";
import { type JSX, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import { cn } from "../../lib/cn";

type ToastTone = "neutral" | "success" | "warning" | "danger";

const toneStyles: Record<ToastTone, { ring: string; icon: () => JSX.Element }> = {
	neutral: { ring: "border-line", icon: () => <Info class="size-5 text-primary" /> },
	success: {
		ring: "border-success/40",
		icon: () => <CheckCircle2 class="size-5 text-success" />,
	},
	warning: {
		ring: "border-warning/40",
		icon: () => <TriangleAlert class="size-5 text-warning" />,
	},
	danger: {
		ring: "border-danger/40",
		icon: () => <XCircle class="size-5 text-danger" />,
	},
};

export type ToastOptions = {
	title: string;
	description?: string;
	tone?: ToastTone;
	/** Auto-dismiss after ms; default 5000. Set 0 to keep until dismissed. */
	duration?: number;
};

/** Imperatively show a toast from anywhere: `toast({ title: "Opgeslagen" })`. */
export function toast(opts: ToastOptions) {
	const tone = opts.tone ?? "neutral";
	return toaster.show((p) => (
		<KToast
			toastId={p.toastId}
			duration={opts.duration ?? 5000}
			class={cn(
				"flex items-start gap-3 rounded-3 border bg-surface p-4 shadow-3 animate-slide-in-right data-[closed]:animate-fade-in",
				toneStyles[tone].ring,
			)}
		>
			<Dynamic component={toneStyles[tone].icon} />
			<div class="flex-1">
				<KToast.Title class="font-medium text-body text-ink">
					{opts.title}
				</KToast.Title>
				<Show when={opts.description}>
					<KToast.Description class="mt-0.5 text-small text-muted">
						{opts.description}
					</KToast.Description>
				</Show>
			</div>
			<KToast.CloseButton
				aria-label="Melding sluiten"
				class="grid size-6 place-items-center rounded-1 text-muted hover:bg-line-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
			>
				<X class="size-4" />
			</KToast.CloseButton>
		</KToast>
	));
}

/**
 * Mount once near the app root. Renders the live region that announces toasts
 * to assistive technology and stacks them bottom-right.
 */
export function Toaster() {
	return (
		<KToast.Region aria-label="Meldingen">
			<KToast.List class="fixed right-4 bottom-4 z-[100] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 outline-none" />
		</KToast.Region>
	);
}
