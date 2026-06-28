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
// Importing the store creates it and starts the effect that mirrors the
// persisted a11y settings onto <html data-*> for the whole app.
import "../lib/a11y/store";
import { OrpcQueryProvider } from "../lib/orpc/query-provider";
import "../app.css";

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
					</OrpcQueryProvider>
				</div>
				<Scripts />
			</body>
		</html>
	);
}
