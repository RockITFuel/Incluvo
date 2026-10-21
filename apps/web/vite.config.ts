import solid from "@solidjs/vite-plugin";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { defineConfig } from "vite";

const orpcServerUrl = process.env.ORPC_SERVER_URL ?? "http://localhost:3210";

// Proxy the API surface to the oRPC server so the browser talks to a single
// origin (no CORS in dev, cookies "just work").
const proxy = {
	"/rpc": { target: orpcServerUrl, changeOrigin: true },
	"/api": { target: orpcServerUrl, changeOrigin: true },
	"/sse": { target: orpcServerUrl, changeOrigin: true },
};

// A plain client-rendered SPA (no SSR, no prerender, so no hydration): index.html
// loads src/entry-spa.tsx and serve.ts falls back to index.html in production.
export default defineConfig({
	plugins: [
		tanstackRouter({
			target: "solid",
			routesDirectory: "./src/routes",
			generatedRouteTree: "./src/routeTree.gen.ts",
			autoCodeSplitting: true,
		}),
		solid(),
	],
	// Two Solid runtimes in one bundle break reactivity silently; the root
	// package.json `overrides` pins one version, this keeps Vite to one copy.
	resolve: { dedupe: ["solid-js", "@solidjs/web"] },
	server: { port: 3200, proxy },
	preview: { port: 3200, proxy },
});
