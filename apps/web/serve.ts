/**
 * Production server for TanStack Start SPA.
 *
 * The built server.js only exports a fetch handler (SSR / SPA shell).
 * It does NOT serve static files. This entry wraps it with Bun.serve
 * and serves static assets from dist/client/ before falling back to
 * the TanStack Start handler.
 */

import { stat } from "node:fs/promises";
import { extname, join } from "node:path";
import app from "./dist/server/server.js";

const CLIENT_DIR = join(import.meta.dir, "dist", "client");
const PORT = Number(process.env.PORT) || 3000;

/** Hashed assets (e.g. /assets/main-COYbcP4_.js) are immutable. */
const IMMUTABLE_RE = /\/assets\//;

function cacheHeaders(pathname: string): Record<string, string> {
	// Always re-fetch — clients poll this to detect new deploys.
	if (pathname === "/version.json") {
		return { "Cache-Control": "no-store, must-revalidate" };
	}
	if (IMMUTABLE_RE.test(pathname)) {
		return { "Cache-Control": "public, max-age=31536000, immutable" };
	}
	// Non-hashed static files (favicon, images in /images/, etc.)
	return { "Cache-Control": "public, max-age=3600" };
}

Bun.serve({
	port: PORT,
	async fetch(req) {
		const url = new URL(req.url);

		// Try to serve a static file from dist/client/
		if (req.method === "GET" || req.method === "HEAD") {
			const filePath = join(CLIENT_DIR, url.pathname);

			// Prevent directory traversal
			if (filePath.startsWith(CLIENT_DIR)) {
				try {
					const fileStat = await stat(filePath);
					if (fileStat.isFile()) {
						return new Response(Bun.file(filePath), {
							headers: cacheHeaders(url.pathname),
						});
					}
				} catch {
					// File doesn't exist, fall through to app handler
				}
			}
		}

		// Fall back to TanStack Start handler (SPA shell / SSR)
		return app.fetch(req);
	},
});

console.log(`Server listening on port ${PORT}`);
