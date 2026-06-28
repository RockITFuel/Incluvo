import typography from "@tailwindcss/typography";
import type { Config } from "tailwindcss";

/**
 * Tailwind maps its utilities onto the CSS variables defined in src/app.css.
 * Colours are stored as raw `R G B` triplets so the `<alpha-value>` slot keeps
 * working (e.g. `bg-primary/20`). Because everything resolves through the
 * variables, the accessibility settings (contrast / size / density) restyle the
 * whole UI at runtime without any component needing to know about them.
 */
function rgb(name: string) {
	return `rgb(var(--${name}) / <alpha-value>)`;
}

export default {
	content: ["./index.html", "./src/**/*.{ts,tsx}"],
	theme: {
		extend: {
			colors: {
				ink: { DEFAULT: rgb("ink"), 2: rgb("ink-2") },
				muted: { DEFAULT: rgb("muted"), 2: rgb("muted-2") },
				line: { DEFAULT: rgb("line"), 2: rgb("line-2") },
				bg: { DEFAULT: rgb("bg"), 2: rgb("bg-2") },
				surface: rgb("surface"),
				primary: {
					DEFAULT: rgb("primary"),
					700: rgb("primary-700"),
					100: rgb("primary-100"),
					50: rgb("primary-50"),
					fg: rgb("primary-fg"),
				},
				accent: {
					DEFAULT: rgb("accent"),
					700: rgb("accent-700"),
					100: rgb("accent-100"),
				},
				success: { DEFAULT: rgb("success"), 100: rgb("success-100") },
				warning: { DEFAULT: rgb("warning"), 100: rgb("warning-100") },
				danger: { DEFAULT: rgb("danger"), 100: rgb("danger-100") },
				ring: rgb("ring"),
				// keep the old `brand` alias working for any not-yet-migrated code
				brand: { DEFAULT: rgb("primary"), fg: rgb("primary-fg") },
			},
			borderRadius: {
				1: "var(--r-1)",
				2: "var(--r-2)",
				3: "var(--r-3)",
				4: "var(--r-4)",
				5: "var(--r-5)",
				pill: "var(--r-pill)",
			},
			fontFamily: {
				head: "var(--font-head)",
				body: "var(--font-body)",
			},
			fontSize: {
				display: ["var(--t-display)", { lineHeight: "1.1" }],
				h1: ["var(--t-h1)", { lineHeight: "1.15" }],
				h2: ["var(--t-h2)", { lineHeight: "1.2" }],
				h3: ["var(--t-h3)", { lineHeight: "1.25" }],
				body: ["var(--t-body)", { lineHeight: "1.55" }],
				small: ["var(--t-small)", { lineHeight: "1.5" }],
				micro: ["var(--t-micro)", { lineHeight: "1.4" }],
			},
			boxShadow: {
				1: "var(--shadow-1)",
				2: "var(--shadow-2)",
				3: "var(--shadow-3)",
			},
			spacing: {
				// density-aware control padding
				"ctl-y": "var(--density-y)",
				"ctl-x": "var(--density-x)",
			},
			transitionDuration: {
				DEFAULT: "var(--motion)",
				fast: "var(--motion-fast)",
			},
			keyframes: {
				"fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
				"scale-in": {
					from: { opacity: "0", transform: "scale(0.97)" },
					to: { opacity: "1", transform: "scale(1)" },
				},
				"slide-in-right": {
					from: { opacity: "0", transform: "translateX(8px)" },
					to: { opacity: "1", transform: "translateX(0)" },
				},
			},
			animation: {
				"fade-in": "fade-in var(--motion-fast) ease-out",
				"scale-in": "scale-in var(--motion-fast) ease-out",
				"slide-in-right": "slide-in-right var(--motion) ease-out",
			},
		},
	},
	plugins: [typography],
} satisfies Config;
