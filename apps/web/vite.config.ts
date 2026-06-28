import { tanstackStart } from "@tanstack/solid-start/plugin/vite";
import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";
import tsConfigPaths from "vite-tsconfig-paths";

const orpcServerUrl = process.env.ORPC_SERVER_URL ?? "http://localhost:3210";

// Proxy the API surface to the oRPC server so the browser talks to a single
// origin (no CORS in dev, cookies "just work").
const proxy = {
	"/rpc": { target: orpcServerUrl, changeOrigin: true },
	"/api": { target: orpcServerUrl, changeOrigin: true },
	"/sse": { target: orpcServerUrl, changeOrigin: true },
};

export default defineConfig({
	plugins: [
		tsConfigPaths(),
		tanstackStart({ spa: { enabled: true } }),
		solidPlugin({ ssr: true }),
	],
	server: { proxy },
});
