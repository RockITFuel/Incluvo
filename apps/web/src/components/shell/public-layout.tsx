import { Link } from "@tanstack/solid-router";
import type { JSX } from "solid-js";
import { A11yPanel } from "../a11y-panel";

/**
 * Lightweight chrome for public pages (home, login): just a slim header with
 * the brand and the accessibility panel, plus a centered content column.
 */
export function PublicLayout(props: { children: JSX.Element }) {
	return (
		<div class="flex min-h-screen flex-col bg-bg">
			<header class="flex items-center gap-4 border-line border-b bg-bg-2 px-6 py-3">
				<Link
					to="/"
					class="flex items-center gap-2.5 rounded-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
				>
					<span class="relative grid size-7 place-items-center rounded-[8px] bg-primary font-head text-base font-semibold text-primary-fg">
						i
						<span class="absolute -right-1 -bottom-1 size-2.5 rounded-full border-2 border-bg-2 bg-accent" />
					</span>
					<span class="font-head text-h3 font-semibold tracking-tight text-ink">
						Incluvo
					</span>
				</Link>
				<div class="flex-1" />
				<A11yPanel />
			</header>
			<main class="mx-auto w-full max-w-4xl flex-1 p-6">{props.children}</main>
		</div>
	);
}
