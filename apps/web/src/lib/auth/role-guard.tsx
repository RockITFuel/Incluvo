import { type UserRole } from "@incluvo/permissions";
import { useNavigate } from "@tanstack/solid-router";
import { createEffect, type JSX, Show } from "solid-js";
import { useMe } from "./use-me";

/**
 * Client-side role gate for hard loads: `beforeLoad` is baked at prerender and
 * does not re-run on hydration, so role-gated pages must also gate at render.
 */
export function RequireRole(props: { min: UserRole; redirectTo?: string; children: JSX.Element }) {
	const me = useMe();
	const navigate = useNavigate();
	createEffect(() => {
		if (me.query.isSuccess && !me.hasAtLeast(props.min)) {
			navigate({ to: props.redirectTo ?? "/", replace: true });
		}
	});
	return (
		<Show
			when={me.query.isSuccess && me.hasAtLeast(props.min)}
			fallback={<p class="text-muted">Bezig met laden…</p>}
		>
			{props.children}
		</Show>
	);
}
