import { createRouter } from "@tanstack/solid-router";
import { RouteError, RoutePending } from "./components/ui/route-state";
import { installTargetedReload } from "./lib/refresh";
import { routeTree } from "./routeTree.gen";

export const router = createRouter({
	routeTree,
	defaultPendingMs: 0,
	defaultPendingMinMs: 0,
	defaultPendingComponent: RoutePending,
	defaultErrorComponent: RouteError,
	defaultPreload: "intent",
	// No defaultStaleTime: a revisit shows the cached page and reloads it. A
	// hover preload stays good long enough for the click that usually follows.
	defaultPreloadStaleTime: 30_000,
	scrollRestoration: true,
});

// Targeted refreshes (lib/refresh.ts) reload only the matches they invalidate.
installTargetedReload(router.routesById);

router.subscribe("onBeforeNavigate", () => {
	// A cold deep link needs loading feedback. Once a page is on screen, keep it
	// until the next one is ready instead of flashing a loading screen.
	router.update({
		...router.options,
		defaultPendingMs: router.state.resolvedLocation ? Infinity : 0,
	});
});

declare module "@tanstack/solid-router" {
	interface Register {
		router: typeof router;
	}
}
