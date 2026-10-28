/**
 * Text colours a course text may use (INC-25). A short list instead of a free
 * picker: each meets WCAG AA on a white background and follows the contrast
 * settings (they are design tokens). The leerling's view only accepts these
 * exact values, so a text can't carry other styling.
 */
export const TEXT_COLORS = [
	{ label: "Blauw", value: "rgb(var(--primary-700))", class: "text-primary-700" },
	{ label: "Oranjerood", value: "rgb(var(--accent-700))", class: "text-accent-700" },
	{ label: "Rood", value: "rgb(var(--danger))", class: "text-danger" },
	{ label: "Groen", value: "rgb(var(--success))", class: "text-success" },
] as const;

/** The colour of the list with this exact value, or undefined. */
export function textColor(value: unknown) {
	return TEXT_COLORS.find((c) => c.value === value);
}

export function textColorClass(value: unknown): string | undefined {
	return TEXT_COLORS.find((c) => c.value === value)?.class;
}

/** Text alignment a course text may use (INC-25). */
export function alignClass(value: unknown): string | undefined {
	if (value === "center") return "text-center";
	if (value === "right") return "text-right";
	return undefined;
}
