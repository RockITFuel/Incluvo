import {
	createRootRoute,
	HeadContent,
	Link,
	Outlet,
	Scripts,
} from "@tanstack/solid-router";
import { Suspense } from "solid-js";
import { HydrationScript } from "solid-js/web";
import { Toaster } from "../components/ui/toast";
import { RouteAnnouncer } from "../lib/a11y/route-announcer";
// Importing the store creates it and starts the effect that mirrors the
// persisted a11y settings onto <html data-*> for the whole app.
import "../lib/a11y/store";
import { OrpcQueryProvider } from "../lib/orpc/query-provider";
import "../app.css";
import "../design-system.css";

export const Route = createRootRoute({
	component: RootComponent,
	notFoundComponent: () => (
		<div class="p-8">
			<h1 class="text-xl font-semibold">404 — niet gevonden</h1>
			<Link to="/" class="text-brand underline">
				Terug naar start
			</Link>
		</div>
	),
});

function RootComponent() {
	return (
		<html lang="nl">
			<head>
				<meta charset="utf-8" />
				<meta content="width=device-width, initial-scale=1" name="viewport" />
				<link href="/favicon.ico" rel="icon" />
				<link href="https://fonts.googleapis.com" rel="preconnect" />
				<link
					crossorigin="anonymous"
					href="https://fonts.gstatic.com"
					rel="preconnect"
				/>
				<link
					href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700&family=Inter:wght@400;500;600;700&family=Atkinson+Hyperlegible:wght@400;700&display=swap"
					rel="stylesheet"
				/>
				<title>Incluvo</title>
				<HydrationScript />
				<HeadContent />
			</head>
			<body>
				<div id="app">
					<OrpcQueryProvider>
						{/*
						 * The root only owns global providers. Protected routes render
						 * the full AppShell (see routes/_protected.tsx); public routes
						 * use the lightweight PublicLayout. Each Outlet child decides
						 * its own chrome so we don't double-wrap layouts.
						 */}
						<Suspense>
							<Outlet />
						</Suspense>
						<Toaster />
						<RouteAnnouncer />
					</OrpcQueryProvider>
				</div>
				<Scripts />
			</body>
		</html>
	);
}
