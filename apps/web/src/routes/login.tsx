import { atLeast, type UserRole } from "@incluvo/permissions";
import { createFileRoute, useRouter } from "@tanstack/solid-router";
import { Show, createSignal, onMount } from "solid-js";
import { PublicLayout } from "../components/shell/public-layout";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/text-field";
import { authClient } from "../lib/auth/auth-client";

export const Route = createFileRoute("/login")({
	component: Login,
});

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
	onMount(() => setReady(true));

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
		// Land on the role's real home, not the demo `/items` route. coach+ get
		// the dashboard; everyone else their task list.
		const role = ((data?.user as { role?: string } | undefined)?.role ??
			"member") as UserRole;
		router.navigate({ to: atLeast(role, "coach") ? "/dashboard" : "/taken" });
	}

	return (
		<PublicLayout>
			<section class="mx-auto max-w-sm">
				<Card padding="lg" elevation="lift">
					<h1 class="mb-4 font-head text-h2 text-ink">
						{mode() === "sign-in" ? "Inloggen" : "Account aanmaken"}
					</h1>
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
						<Button type="submit" disabled={busy() || !ready()}>
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
						class="mt-3 border-0"
						onClick={() => setMode(mode() === "sign-in" ? "sign-up" : "sign-in")}
					>
						{mode() === "sign-in"
							? "Nog geen account? Aanmaken"
							: "Al een account? Inloggen"}
					</Button>
				</Card>
			</section>
		</PublicLayout>
	);
}
