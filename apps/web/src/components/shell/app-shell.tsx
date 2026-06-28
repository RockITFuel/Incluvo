import { Link } from "@tanstack/solid-router";
import { Menu, Search, X } from "lucide-solid";
import { NotificationsBell } from "../notifications";
import { For, type JSX, Show, createSignal } from "solid-js";
import { Dynamic } from "solid-js/web";
import { cn } from "../../lib/cn";
import { A11yPanel } from "../a11y-panel";
import { UserMenu, type ShellUser } from "./user-menu";

export type NavItem = {
	label: string;
	href: string;
	icon: (props: { class?: string }) => JSX.Element;
	badge?: string | number;
};

export type NavSection = {
	label?: string;
	items: NavItem[];
};

export type Crumb = { label: string; href?: string };

export type AppShellProps = {
	user: ShellUser;
	nav: NavSection[];
	crumbs?: Crumb[];
	children: JSX.Element;
};

function Brand() {
	return (
		<Link
			to="/"
			class="flex items-center gap-3 rounded-2 px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
		>
			<span class="relative grid size-8 place-items-center rounded-[9px] bg-primary font-head text-lg font-semibold text-primary-fg">
				i
				<span class="absolute -right-1 -bottom-1 size-3 rounded-full border-2 border-bg-2 bg-accent" />
			</span>
			<span class="font-head text-h3 font-semibold tracking-tight text-ink">
				Incluvo
			</span>
		</Link>
	);
}

function SidebarNav(props: { nav: NavSection[]; onNavigate?: () => void }) {
	return (
		<nav class="flex flex-col gap-5" aria-label="Hoofdnavigatie">
			<For each={props.nav}>
				{(section) => (
					<div class="flex flex-col gap-0.5">
						<Show when={section.label}>
							<div class="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-2">
								{section.label}
							</div>
						</Show>
						<For each={section.items}>
							{(item) => (
								<Link
									to={item.href}
									onClick={() => props.onNavigate?.()}
									class="flex items-center gap-3 rounded-2 px-3 py-2 text-small font-medium text-ink-2 transition-colors duration-fast hover:bg-line-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-[current=page]:bg-primary aria-[current=page]:text-primary-fg"
									activeProps={{ "aria-current": "page" }}
								>
									<Dynamic component={item.icon} class="size-[18px] shrink-0" />
									<span class="flex-1 truncate">{item.label}</span>
									<Show when={item.badge}>
										<span class="rounded-pill bg-accent-100 px-2 py-0.5 text-[11px] font-semibold text-accent-700">
											{item.badge}
										</span>
									</Show>
								</Link>
							)}
						</For>
					</div>
				)}
			</For>
		</nav>
	);
}

function Sidebar(props: {
	nav: NavSection[];
	user: ShellUser;
	onNavigate?: () => void;
}) {
	return (
		<div class="flex h-full flex-col gap-5 overflow-y-auto border-line border-r bg-bg-2 p-4">
			<Brand />
			<SidebarNav nav={props.nav} onNavigate={props.onNavigate} />
			<div class="mt-auto flex items-center gap-2.5 rounded-2 border border-line bg-surface p-2.5">
				<UserMenu user={props.user} />
			</div>
		</div>
	);
}

function Crumbs(props: { crumbs?: Crumb[] }) {
	return (
		<Show when={props.crumbs?.length}>
			<nav aria-label="Kruimelpad" class="hidden items-center gap-1.5 text-small text-muted sm:flex">
				<For each={props.crumbs}>
					{(c, i) => (
						<>
							<Show when={i() > 0}>
								<span class="text-muted-2">/</span>
							</Show>
							<Show
								when={i() === (props.crumbs?.length ?? 0) - 1}
								fallback={
									<Show when={c.href} fallback={<span>{c.label}</span>}>
										<Link to={c.href!} class="hover:text-ink">
											{c.label}
										</Link>
									</Show>
								}
							>
								<strong class="font-semibold text-ink">{c.label}</strong>
							</Show>
						</>
					)}
				</For>
			</nav>
		</Show>
	);
}

/**
 * Protected app shell: sticky sidebar + topbar (breadcrumbs, search,
 * notifications, accessibility panel, user menu) with a slide-in drawer on
 * mobile. Calm, spacious layout intended for pupils aged 8–20.
 */
export function AppShell(props: AppShellProps) {
	const [menuOpen, setMenuOpen] = createSignal(false);
	return (
		<div class="grid min-h-screen grid-cols-1 md:grid-cols-[248px_1fr]">
			<a
				href="#main"
				class="sr-only not-sr-only-focus focus:fixed focus:left-4 focus:top-4 focus:z-[120] focus:rounded-2 focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-fg"
			>
				Ga naar inhoud
			</a>

			{/* Desktop sidebar */}
			<aside class="sticky top-0 hidden h-screen md:block">
				<Sidebar nav={props.nav} user={props.user} />
			</aside>

			{/* Mobile drawer */}
			<Show when={menuOpen()}>
				<div
					class="fixed inset-0 z-40 bg-ink/40 md:hidden"
					onClick={() => setMenuOpen(false)}
					aria-hidden="true"
				/>
				<aside class="fixed inset-y-0 left-0 z-50 w-70 max-w-[80vw] shadow-3 md:hidden">
					<div class="absolute right-2 top-2 z-10">
						<button
							type="button"
							aria-label="Menu sluiten"
							onClick={() => setMenuOpen(false)}
							class="grid size-9 place-items-center rounded-2 text-ink-2 hover:bg-line-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
						>
							<X class="size-5" />
						</button>
					</div>
					<Sidebar
						nav={props.nav}
						user={props.user}
						onNavigate={() => setMenuOpen(false)}
					/>
				</aside>
			</Show>

			<div class="flex min-w-0 flex-col">
				<header class="sticky top-0 z-20 flex items-center gap-4 border-line border-b bg-bg/85 px-4 py-3 backdrop-blur md:px-7">
					<button
						type="button"
						aria-label="Menu openen"
						onClick={() => setMenuOpen(true)}
						class="grid size-9 place-items-center rounded-2 border border-line bg-surface text-ink-2 hover:bg-line-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:hidden"
					>
						<Menu class="size-5" />
					</button>
					<Crumbs crumbs={props.crumbs} />
					<div class="flex-1" />
					<div class="flex items-center gap-2">
						<button
							type="button"
							aria-label="Zoeken"
							class="hidden size-9 place-items-center rounded-2 border border-line bg-surface text-ink-2 hover:bg-line-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:grid"
						>
							<Search class="size-5" />
						</button>
						<NotificationsBell />
						<A11yPanel />
					</div>
				</header>

				<main id="main" class={cn("flex-1 p-4 md:p-7")} tabindex="-1">
					{props.children}
				</main>
			</div>
		</div>
	);
}
