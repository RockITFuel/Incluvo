import { handleRequest } from "./app";
import { env } from "./env";
import { scheduleRetention } from "./retention";

const server = Bun.serve({
	port: env.PORT,
	idleTimeout: 120, // long-lived SSE connections
	fetch: handleRequest,
});

scheduleRetention();

console.log(`[incluvo:server] listening on http://localhost:${server.port}`);
console.log(`[incluvo:server] API docs at ${env.BETTER_AUTH_URL}/api/docs`);
