import { createFileRoute, useNavigate } from "@tanstack/solid-router";
import { Show, createSignal, onMount } from "solid-js";
import { A11yPanel } from "../components/a11y-panel";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/text-field";
import { authClient } from "../lib/auth/auth-client";

/**
 * Landing page for the link in an invite or "wachtwoord vergeten" mail. The
 * server's /api/auth/reset-password/:token redirects here with `?token=…`, or
 * with `?error=INVALID_TOKEN` when the link is used up or expired.
 */
export const Route = createFileRoute("/wachtwoord-instellen")({
	component: SetPassword,
});

const MIN_LENGTH = 8;

function SetPassword() {
	const navigate = useNavigate();
	const [token, setToken] = createSignal<string | null>(null);
	const [invalid, setInvalid] = createSignal(false);
	const [password, setPassword] = createSignal("");
	const [repeat, setRepeat] = createSignal("");
	const [error, setError] = createSignal<string | null>(null);
	const [busy, setBusy] = createSignal(false);

	onMount(() => {
		const params = new URLSearchParams(window.location.search);
		setToken(params.get("token"));
		setInvalid(!params.get("token") || params.has("error"));
	});

	async function submit(e: Event) {
		e.preventDefault();
		setError(null);
		if (password().length < MIN_LENGTH) {
			setError(`Kies een wachtwoord van minstens ${MIN_LENGTH} tekens.`);
			return;
		}
		if (password() !== repeat()) {
			setError("De twee wachtwoorden zijn niet hetzelfde.");
			return;
		}
		setBusy(true);
		const { error: err } = await authClient.resetPassword({
			newPassword: password(),
			token: token() ?? "",
		});
		setBusy(false);
		if (err) {
			if (err.code === "INVALID_TOKEN") setInvalid(true);
			else setError("Dat lukte niet. Probeer het opnieuw.");
			return;
		}
		navigate({ to: "/login", search: { wachtwoord: "ingesteld" } });
	}

	return (
		<div class="relative flex min-h-screen flex-col bg-bg">
			<div class="absolute top-4 right-4">
				<A11yPanel />
			</div>
			<main class="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
				<h1 class="font-head text-h1 text-ink">Wachtwoord kiezen</h1>
				<Show
					when={!invalid()}
					fallback={
						<>
							<p class="mt-1.5 mb-7 text-body text-muted">
								Deze link werkt niet meer. Hij is al gebruikt of verlopen. Vraag
								een nieuwe aan via "Wachtwoord vergeten?" op de inlogpagina, of
								vraag je school om een nieuwe uitnodiging.
							</p>
							<Button size="lg" onClick={() => navigate({ to: "/login" })}>
								Naar inloggen
							</Button>
						</>
					}
				>
					<p class="mt-1.5 mb-7 text-body text-muted">
						Kies een wachtwoord van minstens {MIN_LENGTH} tekens.
					</p>
					<form onSubmit={submit} class="flex flex-col gap-4">
						<Input
							type="password"
							label="Nieuw wachtwoord"
							required
							value={password()}
							onInput={(e) => setPassword(e.currentTarget.value)}
						/>
						<Input
							type="password"
							label="Herhaal wachtwoord"
							required
							value={repeat()}
							onInput={(e) => setRepeat(e.currentTarget.value)}
						/>
						<Show when={error()}>
							<p class="text-small text-danger" role="alert">
								{error()}
							</p>
						</Show>
						<Button type="submit" size="lg" disabled={busy() || !token()}>
							{busy() ? "Bezig…" : "Wachtwoord opslaan"}
						</Button>
					</form>
				</Show>
			</main>
		</div>
	);
}
