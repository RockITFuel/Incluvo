import { createFileRoute, Link } from "@tanstack/solid-router";
import { PublicLayout } from "../components/shell/public-layout";
import { Button } from "../components/ui/button";
import { Card, CardDescription, CardTitle } from "../components/ui/card";

export const Route = createFileRoute("/")({
	component: Home,
});

function Home() {
	return (
		<PublicLayout>
			<section class="flex flex-col gap-6">
				<div class="flex flex-col gap-2">
					<h1 class="font-head text-h1 text-ink">Welkom bij Incluvo</h1>
					<p class="max-w-2xl text-body text-muted">
						Een rustige, toegankelijke leeromgeving voor afstandsonderwijs. Dit is
						het skeleton: een oRPC-backend met OpenAPI, better-auth,
						Drizzle/PostgreSQL, RBAC, audit-logging en realtime updates via SSE —
						met een SolidStart-frontend.
					</p>
				</div>
				<Card class="max-w-2xl">
					<CardTitle>Aan de slag</CardTitle>
					<CardDescription class="mt-1">
						Bekijk de voorbeeld-vertical-slice of de API-documentatie.
					</CardDescription>
					<div class="mt-4 flex flex-wrap gap-2">
						<Link to="/items">
							<Button>Voorbeeld (Items)</Button>
						</Link>
						<a href="/api/docs">
							<Button variant="ghost">API-documentatie</Button>
						</a>
						<Link to="/login">
							<Button variant="subtle">Inloggen</Button>
						</Link>
					</div>
				</Card>
			</section>
		</PublicLayout>
	);
}
