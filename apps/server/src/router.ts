import { base } from "./procedures/base";
import { accountRouter } from "./procedures/account";
import { adminRouter } from "./procedures/admin";
import { aiRouter } from "./procedures/ai";
import { chatRouter } from "./procedures/chat";
import { coachplanRouter } from "./procedures/coachplan";
import { coursesRouter } from "./procedures/courses";
import { dashboardRouter } from "./procedures/dashboard";
import { health } from "./procedures/health";
import { itemsRouter } from "./procedures/items";
import { notificationsRouter } from "./procedures/notifications";
import { tasksRouter } from "./procedures/tasks";

/**
 * Root router — composed from per-domain sub-routers.
 *
 * ── How to add a domain (the pattern every epic follows) ───────────────────
 * 1. Create `procedures/<domain>/index.ts`.
 * 2. Build procedures from `protectedProcedure` / `publicProcedure` (see
 *    `procedures/base.ts`). Tenant-scope inside handlers with
 *    `sameTenant(context.actor, row)` after loading rows; use
 *    `.use(withPolicy(policies.x))` for role-only gates.
 * 3. Export a single router: `export const <domain>Router = base.router({ … });`
 *    (nest further with `base.router({ … })` for sub-groups, e.g. account.users).
 * 4. Import it here and register it under a key below.
 *
 * Procedures' `.route(...)` metadata also surfaces them as OpenAPI REST endpoints
 * (`apps/server/src/openapi-handler.ts`); the typed oRPC client consumes the same
 * router via `/rpc` (`apps/web/src/lib/orpc`).
 * ───────────────────────────────────────────────────────────────────────────
 */
export const router = base.router({
	health,
	account: accountRouter,
	items: itemsRouter,
	// Wave 2 domains (each filled in by its epic agent).
	coachplan: coachplanRouter,
	tasks: tasksRouter,
	chat: chatRouter,
	notifications: notificationsRouter,
	// Wave 3 domains.
	courses: coursesRouter,
	dashboard: dashboardRouter,
	admin: adminRouter,
	ai: aiRouter,
});

export type Router = typeof router;
