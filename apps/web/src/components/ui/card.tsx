import { type VariantProps, cva } from "class-variance-authority";
import { type JSX, splitProps } from "solid-js";
import { cn } from "../../lib/cn";

const cardVariants = cva("rounded-3 border border-line bg-surface", {
	variants: {
		padding: { none: "", sm: "p-4", md: "p-5", lg: "p-6" },
		elevation: { flat: "", low: "shadow-1", lift: "shadow-2" },
	},
	defaultVariants: { padding: "md", elevation: "flat" },
});

export type CardProps = JSX.HTMLAttributes<HTMLDivElement> &
	VariantProps<typeof cardVariants>;

export function Card(props: CardProps) {
	const [local, rest] = splitProps(props, [
		"class",
		"padding",
		"elevation",
		"children",
	]);
	return (
		<div
			class={cn(
				cardVariants({ padding: local.padding, elevation: local.elevation }),
				local.class,
			)}
			{...rest}
		>
			{local.children}
		</div>
	);
}

export function CardHeader(props: JSX.HTMLAttributes<HTMLDivElement>) {
	const [local, rest] = splitProps(props, ["class", "children"]);
	return (
		<div
			class={cn("mb-4 flex items-center justify-between gap-3", local.class)}
			{...rest}
		>
			{local.children}
		</div>
	);
}

export function CardTitle(props: JSX.HTMLAttributes<HTMLHeadingElement>) {
	const [local, rest] = splitProps(props, ["class", "children"]);
	return (
		<h3 class={cn("font-head text-h3 text-ink", local.class)} {...rest}>
			{local.children}
		</h3>
	);
}

export function CardDescription(props: JSX.HTMLAttributes<HTMLParagraphElement>) {
	const [local, rest] = splitProps(props, ["class", "children"]);
	return (
		<p class={cn("text-small text-muted", local.class)} {...rest}>
			{local.children}
		</p>
	);
}
