import { RPCHandler } from "@orpc/server/fetch";
import { auth } from "./auth";
import { createContext } from "./context";
import { env } from "./env";
import { openAPIHandler } from "./openapi-handler";
import { router } from "./router";
import { sseResponse } from "./sse";

const rpcHandler = new RPCHandler(router);

function corsHeaders(request: Request): Record<string, string> {
	const origin = request.headers.get("origin") ?? "";
	const allowed = env.CORS_ORIGINS.includes(origin) ? origin : env.CORS_ORIGINS[0] ?? "";
	return {
		"access-control-allow-origin": allowed,
		"access-control-allow-credentials": "true",
		"access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
		"access-control-allow-headers": "content-type,authorization",
		vary: "origin",
	};
}

/**
 * Strict baseline Content-Security-Policy for any HTML this server emits
 * (currently only the Scalar `/api/docs` page). Scalar inlines its own
 * styles/scripts and fetches the spec from `'self'`, so `'unsafe-inline'` is
 * permitted for style/script on the docs route only; the JSON API and SSE
 * responses are not HTML and are covered by `nosniff` instead. (H1)
 */
const DOCS_CSP =
	"default-src 'self'; img-src 'self' data: https:; font-src 'self' https: data:; " +
	"style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; " +
	"media-src 'self' data: blob:; frame-src https://www.youtube-nocookie.com; " +
	"connect-src 'self'; object-src 'none'; base-uri 'none'";

const server = Bun.serve({
	port: env.PORT,
	idleTimeout: 120, // long-lived SSE connections
	async fetch(request) {
		const url = new URL(request.url);
		const cors = corsHeaders(request);

		if (request.method === "OPTIONS") {
			return new Response(null, { status: 204, headers: cors });
		}

		// --- better-auth: /api/auth/* ---
		if (url.pathname.startsWith("/api/auth")) {
			const res = await auth.handler(request);
			for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
			return res;
		}

		// --- Server-Sent Events (authenticated; per-user fan-out) ---
		if (url.pathname === "/sse/events") {
			const ctx = await createContext(request);
			const userId = ctx.session?.user?.id;
			if (!userId) {
				return new Response("Unauthorized", { status: 401, headers: cors });
			}
			return sseResponse(userId, cors);
		}

		// --- oRPC RPC transport (used by the typed client): /rpc/* ---
		if (url.pathname.startsWith("/rpc")) {
			const { matched, response } = await rpcHandler.handle(request, {
				prefix: "/rpc",
				context: await createContext(request),
			});
			if (matched) {
				for (const [k, v] of Object.entries(cors)) response.headers.set(k, v);
				return response;
			}
		}

		// --- OpenAPI REST + Scalar docs: /api/* ---
		if (url.pathname === "/api" || url.pathname === "/api/") {
			return Response.redirect("/api/docs", 302);
		}
		if (url.pathname.startsWith("/api")) {
			if (
				(url.pathname === "/api/docs" || url.pathname === "/api/spec.json") &&
				!env.ENABLE_API_DOCS
			) {
				return new Response("Not found", { status: 404, headers: cors });
			}
			const { matched, response } = await openAPIHandler.handle(request, {
				prefix: "/api",
				context: await createContext(request),
			});
			if (matched) {
				for (const [k, v] of Object.entries(cors)) response.headers.set(k, v);
				// Harden the HTML docs page and JSON spec against content-type
				// confusion / inline-script execution (H1). The Scalar UI is the only
				// HTML this server returns, so scope the CSP to /api/docs.
				response.headers.set("x-content-type-options", "nosniff");
				if (url.pathname === "/api/docs") {
					response.headers.set("content-security-policy", DOCS_CSP);
				}
				return response;
			}
		}

		return new Response("Not found", { status: 404, headers: cors });
	},
});

console.log(`[incluvo:server] listening on http://localhost:${server.port}`);
console.log(`[incluvo:server] API docs at ${env.BETTER_AUTH_URL}/api/docs`);
