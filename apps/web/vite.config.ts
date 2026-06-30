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
	preview: {
		// Explicit IPv4 loopback — the SPA prerender step starts a Vite preview
		// server and fetches from it. In Docker with Bun, "localhost" can resolve
		// to ::1 (IPv6) on one side and 127.0.0.1 (IPv4) on the other, causing
		// ConnectionRefused ("Unable to connect") during the build. Pinning to
		// 127.0.0.1 avoids the mismatch. (Same fix as clp.)
		host: "127.0.0.1",
	},
	server: { proxy },
});
