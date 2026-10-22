/**
 * Production server for the client-rendered SPA: serves the Vite build from
 * dist/ and falls back to index.html for every other GET, so the router can
 * resolve deep links like /plan/abc.
 */

import { stat } from "node:fs/promises";
import { extname, join } from "node:path";

const DIST_DIR = join(import.meta.dir, "dist");
const INDEX = join(DIST_DIR, "index.html");
const PORT = Number(process.env.PORT) || 3000;

/** Hashed assets (e.g. /assets/main-COYbcP4_.js) are immutable. */
const IMMUTABLE_RE = /\/assets\//;

function cacheHeaders(pathname: string): Record<string, string> {
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
		if (req.method !== "GET" && req.method !== "HEAD") {
			return new Response("Method Not Allowed", { status: 405 });
		}

		const filePath = join(DIST_DIR, url.pathname);
		// Prevent directory traversal
		if (filePath.startsWith(DIST_DIR) && filePath !== DIST_DIR) {
			try {
				if ((await stat(filePath)).isFile()) {
					return new Response(Bun.file(filePath), { headers: cacheHeaders(url.pathname) });
				}
			} catch {
				// Not a file: fall through to the SPA shell.
			}
		}

		// A missing asset is a real 404, not the SPA shell.
		if (extname(url.pathname) && url.pathname !== "/index.html") {
			return new Response("Not Found", { status: 404 });
		}
		// The shell must not be cached, so a deploy is picked up on the next load.
		return new Response(Bun.file(INDEX), {
			headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" },
		});
	},
});

console.log(`Server listening on port ${PORT}`);
