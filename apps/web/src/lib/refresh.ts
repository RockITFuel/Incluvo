import type { AnyRouter } from "@tanstack/solid-router";
import type { FileRoutesById } from "../routeTree.gen";

/**
 * Targeted refreshes after a change: rerun only the loaders whose data the
 * change affects, instead of `router.invalidate()` rerunning every loader on
 * screen. Copied from project-alpha (features/operations/lib/refresh.ts).
 *
 * - Matches on screen reload only when `AFFECTS` says they read the entity.
 * - Matches off screen (route cache, hover preloads) are always marked invalid:
 *   free now, and a dependency missing from the map can't surface later as
 *   stale data.
 * - While a targeted refresh runs, `reloadOnlyInvalid` (installed on every
 *   route) keeps the valid matches that stay on screen from reloading too.
 *
 * Kept global (`router.invalidate()`): sign in/out, role switch, a lost session.
 */

export type RouteId = keyof FileRoutesById;

/** Entity -> the routes whose loader reads it. Add a route when it starts reading one. */
const AFFECTS = {
	/** Taken (task board, vandaag-badge in the menu). */
	tasks: [
		"/_protected",
		"/_protected/taken/",
		"/_protected/taken/$leerlingId",
		"/_protected/welkom/",
		"/_protected/dashboard/",
		"/_protected/dashboard/$leerlingId",
	],
	/** Coachplannen, inzendingen, de coach-inbox (badge in the menu) and templates. */
	coachplan: [
		"/_protected",
		"/_protected/plan/",
		"/_protected/plan/$submissionId",
		"/_protected/plan/beheer/",
		"/_protected/welkom/",
		"/_protected/dashboard/",
		"/_protected/dashboard/$leerlingId",
	],
	/** Cursussen, hun inhoud, toewijzingen en inleveringen. */
	courses: [
		"/_protected/cursussen/",
		"/_protected/cursussen/$courseId",
		"/_protected/beheer/cursussen/",
		"/_protected/welkom/",
		"/_protected/dashboard/",
		"/_protected/dashboard/$leerlingId",
	],
	/** Gesprekken en berichten. */
	chat: ["/_protected/chat/", "/_protected/welkom/", "/_protected/dashboard/$leerlingId"],
	/** Leerlingen, coaches en koppelingen. */
	people: [
		"/_protected/leerlingen/",
		"/_protected/coaches/",
		"/_protected/dashboard/",
		"/_protected/dashboard/$leerlingId",
		"/_protected/beheer/",
		"/_protected/beheer/scholen/$organizationId",
	],
	/** Scholen, gebruikers en rollen (superadmin/keyuser beheer). */
	admin: [
		"/_protected/beheer/",
		"/_protected/beheer/scholen/$organizationId",
		"/_protected/beheer/cursussen/",
		"/_protected/leerlingen/",
		"/_protected/coaches/",
	],
	/** Notificaties (bell in the menu and the page). */
	notifications: ["/_protected", "/_protected/notificaties/"],
	/** Mood check-ins. */
	mood: ["/_protected/welkom/", "/_protected/dashboard/", "/_protected/dashboard/$leerlingId"],
	/** Eigen profiel. */
	profile: ["/_protected", "/_protected/profiel/"],
} satisfies Record<string, RouteId[]>;

export type Entity = keyof typeof AFFECTS;

interface MatchLike {
	id: string;
	routeId: string;
}

let targeted = 0;

/**
 * Invalidates the matches that read any of `entities` and reloads the ones on
 * screen; resolves once they loaded.
 *
 *   await client.tasks.create(input);
 *   await refresh(router, "tasks");
 */
export async function refresh(router: AnyRouter, ...entities: Entity[]): Promise<void> {
	const affected = new Set<string>(entities.flatMap((entity) => AFFECTS[entity]));
	const shown = new Set(router.state.matches.map((match: MatchLike) => match.id));
	targeted += 1;
	try {
		await router.invalidate({
			filter: (match: MatchLike) => !shown.has(match.id) || affected.has(match.routeId),
		});
	} finally {
		targeted -= 1;
	}
}

/**
 * Route `shouldReload`: during a targeted refresh a match that stays reloads
 * only when invalid; otherwise (undefined) the router decides as usual.
 */
const reloadOnlyInvalid = (context: { cause: string }) =>
	targeted > 0 && context.cause === "stay" ? false : undefined;

/** Installs `reloadOnlyInvalid` on every route that has no `shouldReload` of its own. */
export function installTargetedReload(routesById: object): void {
	for (const route of Object.values(routesById) as { options: { shouldReload?: unknown } }[]) {
		route.options.shouldReload ??= reloadOnlyInvalid;
	}
}
