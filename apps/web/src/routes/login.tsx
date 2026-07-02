import { atLeast, type UserRole } from "@incluvo/permissions";
import { createFileRoute, useRouter } from "@tanstack/solid-router";
import { Show, createSignal, onMount } from "solid-js";
import { A11yPanel } from "../components/a11y-panel";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/text-field";
import { authClient } from "../lib/auth/auth-client";
import { clearCachedSession, getCachedSession } from "../lib/auth/session";

/**
 * Login — the front door of Incluvo (the root route redirects here). A calm
 * split-screen: an illustrated brand panel (inline SVG, geen externe assets)
 * naast het inlogformulier. Al ingelogde bezoekers worden doorgestuurd naar
 * hun rol-startpagina. De toegankelijkheidsknop blijft rechtsboven bereikbaar.
 */
export const Route = createFileRoute("/login")({
	component: Login,
});

const roleHome = (role: UserRole) =>
	atLeast(role, "coach") ? "/dashboard" : "/welkom";

function Login() {
	const router = useRouter();
	const [email, setEmail] = createSignal("");
	const [password, setPassword] = createSignal("");
	const [mode, setMode] = createSignal<"sign-in" | "sign-up">("sign-in");
	const [error, setError] = createSignal<string | null>(null);
	const [busy, setBusy] = createSignal(false);
	// Guards against a native GET form submit before the SPA hydrates (which
	// would put the e-mail + password in the URL/history). The button stays
	// disabled in the prerendered shell until `onMount` runs on the client.
	const [ready, setReady] = createSignal(false);

	onMount(async () => {
		setReady(true);
		// Already signed in? Skip the form and go to the role's home.
		try {
			const data = await getCachedSession();
			if (data?.session) {
				const role = ((data.user as { role?: string } | undefined)?.role ??
					"member") as UserRole;
				router.navigate({ to: roleHome(role), replace: true });
			}
		} catch {
			// stay on the form
		}
	});

	async function submit(e: Event) {
		e.preventDefault();
		setBusy(true);
		setError(null);
		const { data, error: err } =
			mode() === "sign-in"
				? await authClient.signIn.email({
						email: email(),
						password: password(),
					})
				: await authClient.signUp.email({
						email: email(),
						password: password(),
						name: email(),
					});
		setBusy(false);
		if (err) {
			setError(err.message ?? "Er ging iets mis");
			return;
		}
		// Drop the 30s session cache: it may hold a pre-login `null`, which the
		// post-login navigate's guard would read as "not signed in" and bounce
		// straight back to /login.
		clearCachedSession();
		const role = ((data?.user as { role?: string } | undefined)?.role ??
			"member") as UserRole;
		router.navigate({ to: roleHome(role) });
	}

	return (
		<div class="grid min-h-screen bg-bg lg:grid-cols-2">
			{/* ── Brand panel (illustratie) ─────────────────────────────────── */}
			<div
				class="relative hidden flex-col justify-between overflow-hidden p-10 text-primary-fg lg:flex"
				style={{
					background:
						"linear-gradient(150deg, rgb(var(--primary)), rgb(var(--primary-700)))",
				}}
				aria-hidden="true"
			>
				{/* Brand */}
				<div class="flex items-center gap-3">
					<span class="relative grid size-9 place-items-center rounded-[10px] bg-white/95 font-head text-lg font-semibold text-primary">
						i
						<span class="absolute -right-1 -bottom-1 size-3 rounded-full border-2 border-primary bg-accent" />
					</span>
					<span class="font-head text-h3 font-semibold tracking-tight">
						Incluvo
					</span>
				</div>

				{/* Illustration: leerroute met mijlpalen (abstract, on-brand) */}
				<div class="relative mx-auto w-full max-w-md">
					<svg
						viewBox="0 0 480 400"
						class="w-full"
						fill="none"
						role="presentation"
					>
						{/* zachte achtergrondvormen */}
						<circle cx="96" cy="86" r="70" fill="rgb(255 255 255 / 0.07)" />
						<circle cx="398" cy="298" r="96" fill="rgb(255 255 255 / 0.06)" />
						<circle cx="420" cy="70" r="38" fill="rgb(255 255 255 / 0.09)" />

						{/* de leerroute: een rustig slingerend pad */}
						<path
							d="M56 330 C 130 300, 120 208, 200 196 S 320 232, 372 156 S 430 84, 432 62"
							stroke="rgb(255 255 255 / 0.55)"
							stroke-width="5"
							stroke-linecap="round"
							stroke-dasharray="1 14"
						/>

						{/* mijlpalen op het pad */}
						<g>
							<circle cx="56" cy="330" r="17" fill="#E8765B" />
							<path
								d="M49 330 l5 5 l9 -10"
								stroke="#fff"
								stroke-width="3.4"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</g>
						<g>
							<circle cx="200" cy="196" r="17" fill="#E4B23C" />
							<path
								d="M200 188.5 l2.3 4.7 5.2 .7 -3.8 3.7 .9 5.1 -4.6 -2.4 -4.6 2.4 .9 -5.1 -3.8 -3.7 5.2 -.7 z"
								fill="#fff"
							/>
						</g>
						<g>
							<circle cx="372" cy="156" r="17" fill="rgb(255 255 255 / 0.28)" />
							<circle cx="372" cy="156" r="7" fill="#fff" />
						</g>
						{/* vlag: het doel */}
						<g>
							<line
								x1="432"
								y1="62"
								x2="432"
								y2="18"
								stroke="#fff"
								stroke-width="4"
								stroke-linecap="round"
							/>
							<path d="M432 20 h34 l-9 10 9 10 h-34 z" fill="#E8765B" />
						</g>

						{/* open boek onder het pad */}
						<g transform="translate(150 268)">
							<path
								d="M0 22 C 24 8, 62 8, 86 22 L 86 74 C 62 60, 24 60, 0 74 Z"
								fill="rgb(255 255 255 / 0.92)"
							/>
							<path
								d="M172 22 C 148 8, 110 8, 86 22 L 86 74 C 110 60, 148 60, 172 74 Z"
								fill="rgb(255 255 255 / 0.78)"
							/>
							<line x1="18" y1="30" x2="70" y2="26" stroke="#0E5E6F" stroke-width="4" stroke-linecap="round" opacity="0.5" />
							<line x1="18" y1="42" x2="70" y2="38" stroke="#0E5E6F" stroke-width="4" stroke-linecap="round" opacity="0.32" />
							<line x1="102" y1="26" x2="154" y2="30" stroke="#0E5E6F" stroke-width="4" stroke-linecap="round" opacity="0.5" />
							<line x1="102" y1="38" x2="154" y2="42" stroke="#0E5E6F" stroke-width="4" stroke-linecap="round" opacity="0.32" />
						</g>
					</svg>

					{/* zwevende product-chips */}
					<div
						class="absolute top-3 -left-2 rounded-pill px-3.5 py-2 font-medium text-small shadow-2"
						style={{
							background: "rgb(255 255 255 / 0.94)",
							color: "rgb(var(--primary-700))",
						}}
					>
						😄 Vandaag: goed bezig!
					</div>
					<div
						class="absolute -right-1 bottom-6 rounded-pill px-3.5 py-2 font-medium text-small shadow-2"
						style={{
							background: "rgb(255 255 255 / 0.94)",
							color: "rgb(var(--accent-700))",
						}}
					>
						🔥 4 dagen op rij
					</div>
				</div>

				{/* Tagline */}
				<div class="max-w-md">
					<h2 class="font-head text-[28px] font-semibold leading-tight">
						Leren op jouw manier.
					</h2>
					<p class="mt-2 text-body" style={{ color: "rgb(255 255 255 / 0.82)" }}>
						Een rustige, toegankelijke leeromgeving — met je eigen plan, je eigen
						tempo en een coach die met je meekijkt.
					</p>
				</div>
			</div>

			{/* ── Formulier ─────────────────────────────────────────────────── */}
			<div class="relative flex flex-col">
				<div class="absolute top-4 right-4">
					<A11yPanel />
				</div>

				<div class="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
					{/* Brand (mobiel, waar het panel verborgen is) */}
					<div class="mb-8 flex items-center gap-2.5 lg:hidden">
						<span class="relative grid size-8 place-items-center rounded-[9px] bg-primary font-head text-base font-semibold text-primary-fg">
							i
							<span class="absolute -right-1 -bottom-1 size-2.5 rounded-full border-2 border-bg bg-accent" />
						</span>
						<span class="font-head text-h3 font-semibold tracking-tight text-ink">
							Incluvo
						</span>
					</div>

					<h1 class="font-head text-h1 text-ink">
						{mode() === "sign-in" ? "Welkom terug" : "Account aanmaken"}
					</h1>
					<p class="mt-1.5 mb-7 text-body text-muted">
						{mode() === "sign-in"
							? "Fijn dat je er bent. Log in om verder te gaan."
							: "Maak een account om te beginnen."}
					</p>

					<form onSubmit={submit} class="flex flex-col gap-4">
						<Input
							type="email"
							label="E-mail"
							required
							value={email()}
							onInput={(e) => setEmail(e.currentTarget.value)}
						/>
						<Input
							type="password"
							label="Wachtwoord"
							required
							value={password()}
							onInput={(e) => setPassword(e.currentTarget.value)}
						/>
						<Show when={error()}>
							<p class="text-small text-danger" role="alert">
								{error()}
							</p>
						</Show>
						<Button type="submit" size="lg" disabled={busy() || !ready()}>
							{busy()
								? "Bezig…"
								: mode() === "sign-in"
									? "Inloggen"
									: "Aanmaken"}
						</Button>
					</form>

					<Button
						type="button"
						variant="ghost"
						size="sm"
						class="mt-4 self-start border-0"
						onClick={() => setMode(mode() === "sign-in" ? "sign-up" : "sign-in")}
					>
						{mode() === "sign-in"
							? "Nog geen account? Aanmaken"
							: "Al een account? Inloggen"}
					</Button>

					<p class="mt-10 text-micro text-muted">
						Ingelogd op een gedeeld apparaat? Log na afloop uit via het menu
						rechtsonder.
					</p>
				</div>
			</div>
		</div>
	);
}
