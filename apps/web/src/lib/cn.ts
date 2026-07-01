import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge doesn't know about our custom `fontSize` tokens
 * (`text-h1/h2/h3/body/small/micro` — see tailwind.config.ts). Left unconfigured
 * it mis-classifies e.g. `text-body` as a text *color*, so it collides with
 * `text-primary-fg` / `text-white` and — coming later in the CVA output — WINS
 * and silently drops the real color. Result: primary/accent/danger buttons (and
 * anything pairing a size token with a color) render with default (black) text.
 *
 * Registering the size names under the `font-size` group makes `text-body` a
 * size again, so it no longer conflicts with the color utility and both survive.
 */
const twMerge = extendTailwindMerge({
	extend: {
		classGroups: {
			"font-size": [{ text: ["h1", "h2", "h3", "body", "small", "micro"] }],
		},
	},
});

/**
 * Merge class names with Tailwind-aware conflict resolution.
 * `cn("px-2", condition && "px-4")` → later wins, like in shadcn/ui.
 */
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
