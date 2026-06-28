import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge class names with Tailwind-aware conflict resolution.
 * `cn("px-2", condition && "px-4")` → later wins, like in shadcn/ui.
 */
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
