import { createRootRoute, Link, Outlet } from "@tanstack/solid-router";
import { Toaster } from "../components/ui/toast";
import { RouteAnnouncer } from "../lib/a11y/route-announcer";

/**
 * The root only owns global chrome. Protected routes render the AppShell
 * (routes/_protected.tsx); public routes their own layout. The document
 * itself is index.html: this is a client-rendered SPA.
 */
export const Route = createRootRoute({
	component: () => (
		<>
			<Outlet />
			<Toaster />
			<RouteAnnouncer />
		</>
	),
	notFoundComponent: () => (
		<div class="p-8">
			<h1 class="text-xl font-semibold">404 — niet gevonden</h1>
			<Link to="/" class="text-brand underline">
				Terug naar start
			</Link>
		</div>
	),
});
