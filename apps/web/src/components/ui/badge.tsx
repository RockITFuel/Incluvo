import { type VariantProps, cva } from "class-variance-authority";
import { type JSX, splitProps } from "solid-js";
import { cn } from "../../lib/cn";

export const badgeVariants = cva(
	"inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-micro font-medium",
	{
		variants: {
			variant: {
				neutral: "bg-line-2 text-ink-2",
				primary: "bg-primary-100 text-primary-700",
				accent: "bg-accent-100 text-accent-700",
				success: "bg-success-100 text-success",
				warning: "bg-warning-100 text-warning",
				danger: "bg-danger-100 text-danger",
				outline: "border border-line text-ink-2",
			},
		},
		defaultVariants: { variant: "neutral" },
	},
);

export type BadgeProps = JSX.HTMLAttributes<HTMLSpanElement> &
	VariantProps<typeof badgeVariants>;

export function Badge(props: BadgeProps) {
	const [local, rest] = splitProps(props, ["class", "variant", "children"]);
	return (
		<span
			class={cn(badgeVariants({ variant: local.variant }), local.class)}
			{...rest}
		>
			{local.children}
		</span>
	);
}
