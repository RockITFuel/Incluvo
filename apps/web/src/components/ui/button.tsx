import { Button as KButton } from "@kobalte/core/button";
import { type VariantProps, cva } from "class-variance-authority";
import { type JSX, splitProps } from "solid-js";
import { cn } from "../../lib/cn";

export const buttonVariants = cva(
	"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2 font-medium transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50",
	{
		variants: {
			variant: {
				primary: "bg-primary text-primary-fg hover:bg-primary-700",
				accent: "bg-accent-700 text-white hover:bg-accent",
				ink: "bg-ink text-white hover:brightness-110",
				subtle: "bg-primary-50 text-primary-700 hover:bg-primary-100",
				ghost: "border border-line text-ink-2 hover:bg-line-2",
				danger: "bg-danger text-white hover:brightness-110",
			},
			size: {
				sm: "px-3 py-1.5 text-small rounded-2",
				md: "px-ctl-x py-ctl-y text-body",
				lg: "px-5 py-3 text-body rounded-3",
				icon: "h-9 w-9 rounded-2",
			},
		},
		defaultVariants: { variant: "primary", size: "md" },
	},
);

export type ButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> &
	VariantProps<typeof buttonVariants>;

export function Button(props: ButtonProps) {
	const [local, rest] = splitProps(props, ["class", "variant", "size"]);
	return (
		<KButton
			class={cn(
				buttonVariants({ variant: local.variant, size: local.size }),
				local.class,
			)}
			{...rest}
		/>
	);
}
