import { coachesLeerlingen, type UserRole } from "@incluvo/permissions";
import { useNavigate } from "@tanstack/solid-router";
import { createEffect, type JSX, Show } from "solid-js";
import { roleHome } from "./role-home";
import { useMe } from "./use-me";

/**
 * Client-side role gate for hard loads: `beforeLoad` is baked at prerender and
 * does not re-run on hydration, so role-gated pages must also gate at render.
 * `coaching` limits the page to roles that work with leerlingen (coach,
 * keyuser), which keeps the superadmin out of pupil pages.
 */
export function RequireRole(props: {
	min: UserRole;
	coaching?: boolean;
	/** Only these roles (on top of `min`). */
	only?: UserRole[];
	redirectTo?: string;
	children: JSX.Element;
}) {
	const me = useMe();
	const navigate = useNavigate();
	const allowed = () => {
		const role = me.role();
		return (
			role !== null &&
			me.hasAtLeast(props.min) &&
			(!props.coaching || coachesLeerlingen(role)) &&
			(!props.only || props.only.includes(role))
		);
	};
	// Redirect once: navigating re-runs this effect while the route is still
	// transitioning, and navigating again from there loops forever.
	let redirected = false;
	createEffect(() => {
		const role = me.role();
		if (!redirected && me.query.isSuccess && role !== null && !allowed()) {
			redirected = true;
			navigate({ to: props.redirectTo ?? roleHome(role), replace: true });
		}
	});
	return (
		<Show
			when={me.query.isSuccess && allowed()}
			fallback={<p class="text-muted">Bezig met laden…</p>}
		>
			{props.children}
		</Show>
	);
}
