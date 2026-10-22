import type { AnyRouter } from "@tanstack/solid-router";
import { authClient } from "./auth-client";
import { clearMe } from "./me";

/**
 * Signs out and drops every cached page, so the next account on a shared
 * device never sees the previous user's data.
 */
export async function signOut(router: AnyRouter): Promise<void> {
	await authClient.signOut();
	clearMe();
	router.clearCache();
	await router.navigate({ to: "/login" });
}
