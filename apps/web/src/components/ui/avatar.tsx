import { type VariantProps, cva } from "class-variance-authority";
import { Show, createSignal, splitProps } from "solid-js";
import { cn } from "../../lib/cn";

const avatarVariants = cva(
	"inline-grid place-items-center overflow-hidden rounded-full font-semibold leading-none",
	{
		variants: {
			size: {
				sm: "size-7 text-micro",
				md: "size-9 text-small",
				lg: "size-12 text-body",
			},
			tone: {
				leerling: "bg-gradient-to-br from-[#C7DDE2] to-[#94BCC4] text-primary-700",
				coach: "bg-gradient-to-br from-[#F8D7C8] to-[#ECA084] text-[#7A2F1A]",
			},
		},
		defaultVariants: { size: "md", tone: "leerling" },
	},
);

export type AvatarProps = VariantProps<typeof avatarVariants> & {
	/** Image URL; falls back to initials when missing or it fails to load. */
	src?: string;
	/** Full name used for initials and the accessible label. */
	name: string;
	class?: string;
};

function initials(name: string) {
	return name
		.split(/\s+/)
		.map((p) => p[0])
		.filter(Boolean)
		.slice(0, 2)
		.join("")
		.toUpperCase();
}

export function Avatar(props: AvatarProps) {
	const [local] = splitProps(props, ["src", "name", "size", "tone", "class"]);
	const [failed, setFailed] = createSignal(false);
	const showImg = () => !!local.src && !failed();
	return (
		<span
			class={cn(
				avatarVariants({ size: local.size, tone: local.tone }),
				local.class,
			)}
			role="img"
			aria-label={local.name}
			title={local.name}
		>
			<Show when={showImg()} fallback={initials(local.name)}>
				<img
					src={local.src}
					alt=""
					class="size-full object-cover"
					onError={() => setFailed(true)}
				/>
			</Show>
		</span>
	);
}
