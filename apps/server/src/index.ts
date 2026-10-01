import { handleRequest } from "./app";
import { env } from "./env";
import { scheduleTaskDueToday } from "./notifications/daily";
import { scheduleRetention } from "./retention";

const server = Bun.serve({
	port: env.PORT,
	idleTimeout: 120, // long-lived SSE connections
	fetch: handleRequest,
});

scheduleRetention();
scheduleTaskDueToday();

console.log(`[incluvo:server] listening on http://localhost:${server.port}`);
console.log(`[incluvo:server] API docs at ${env.BETTER_AUTH_URL}/api/docs`);
