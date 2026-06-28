import { useMutation, useQuery, useQueryClient } from "@tanstack/solid-query";
import { createFileRoute } from "@tanstack/solid-router";
import { Bell, CheckCheck } from "lucide-solid";
import { createSignal, For, Show } from "solid-js";
import { metaFor, relativeTime } from "../../../components/notifications";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { toast } from "../../../components/ui/toast";
import { useMe } from "../../../lib/auth/use-me";
import { orpc } from "../../../lib/orpc";
import { useServerEvent } from "../../../lib/sse/use-events";

export const Route = createFileRoute("/_protected/notificaties/")({
	component: NotificationsPage,
});

const PAGE_SIZE = 20;

function NotificationsPage() {
	const me = useMe();
	const queryClient = useQueryClient();
	const [limit, setLimit] = createSignal(PAGE_SIZE);

	const notificationsQuery = useQuery(() =>
		orpc.notifications.list.queryOptions({
			input: { limit: limit(), offset: 0 },
		}),
	);

	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: orpc.notifications.key() });

	// Live-update on a new notification addressed to me.
	useServerEvent("notification.new", (payload) => {
		const userId = (payload as { userId?: string } | null)?.userId;
		if (!userId || userId === me.user()?.id) invalidate();
	});

	const markRead = useMutation(() =>
		orpc.notifications.markRead.mutationOptions({ onSuccess: invalidate }),
	);

	const markAllRead = useMutation(() =>
		orpc.notifications.markAllRead.mutationOptions({
			onSuccess: () => {
				invalidate();
				toast({ title: "Alles gemarkeerd als gelezen", tone: "success" });
			},
		}),
	);

	// Dev-only helper so the page is demoable before other epics emit events.
	const testEmit = useMutation(() =>
		orpc.notifications.testEmit.mutationOptions({
			onSuccess: () => {
				invalidate();
				toast({ title: "Testnotificatie verzonden", tone: "success" });
			},
		}),
	);

	const unread = () => notificationsQuery.data?.unreadCount ?? 0;
	const items = () => notificationsQuery.data?.items ?? [];

	return (
		<section class="flex flex-col gap-6">
			<div class="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h1 class="font-head text-h1 text-ink">Notificaties</h1>
					<p class="mt-1 text-body text-muted">
						<Show
							when={unread() > 0}
							fallback="Je bent helemaal bij — geen ongelezen notificaties."
						>
							Je hebt {unread()} ongelezen notificatie
							{unread() === 1 ? "" : "s"}.
						</Show>
					</p>
				</div>
				<div class="flex items-center gap-2">
					{import.meta.env.DEV ? (
						<Button
							variant="ghost"
							size="sm"
							disabled={testEmit.isPending}
							onClick={() =>
								testEmit.mutate({
									type: "task_new",
									title: "Nieuwe taak toegevoegd",
									body: "Bekijk je takenlijst voor de details.",
								})
							}
						>
							Testnotificatie
						</Button>
					) : null}
					<Show when={unread() > 0}>
						<Button
							variant="subtle"
							size="sm"
							disabled={markAllRead.isPending}
							onClick={() => markAllRead.mutate({})}
						>
							<CheckCheck class="size-4" aria-hidden="true" />
							Alles gelezen
						</Button>
					</Show>
				</div>
			</div>

			<Show when={notificationsQuery.isLoading}>
				<p class="text-muted">Laden…</p>
			</Show>
			<Show when={notificationsQuery.error}>
				<p class="text-danger">Kon notificaties niet laden.</p>
			</Show>

			<Show when={!notificationsQuery.isLoading && items().length === 0}>
				<Card padding="lg" class="flex flex-col items-center gap-2 text-center">
					<span class="grid size-12 place-items-center rounded-pill bg-line-2 text-muted">
						<Bell class="size-6" aria-hidden="true" />
					</span>
					<p class="text-body text-ink">Nog geen notificaties</p>
					<p class="text-small text-muted">
						Zodra er iets gebeurt in jouw leeromgeving — een coachplan, een
						nieuwe taak of activiteit — zie je het hier.
					</p>
				</Card>
			</Show>

			<ul class="flex flex-col gap-2">
				<For each={items()}>
					{(n) => {
						const meta = metaFor(n.type);
						const Icon = meta.icon;
						return (
							<li>
								<Card
									padding="sm"
									class="flex items-start gap-3"
									classList={{
										"border-primary/30 bg-primary-50/40": !n.read,
									}}
								>
									<span
										class={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-2 ${meta.tone}`}
										aria-hidden="true"
									>
										<Icon class="size-4" />
									</span>
									<div class="min-w-0 flex-1">
										<div class="flex items-center gap-2">
											<p
												class="text-body text-ink"
												classList={{ "font-semibold": !n.read }}
											>
												{n.title}
											</p>
											<Show when={!n.read}>
												<span
													class="size-2 shrink-0 rounded-pill bg-accent"
													aria-label="ongelezen"
												/>
											</Show>
										</div>
										<Show when={n.body}>
											<p class="mt-0.5 text-small text-muted">{n.body}</p>
										</Show>
										<p class="mt-1 text-micro text-muted-2">
											{meta.label} · {relativeTime(n.createdAt)}
										</p>
									</div>
									<Show when={!n.read}>
										<Button
											variant="ghost"
											size="sm"
											disabled={markRead.isPending}
											onClick={() => markRead.mutate({ id: n.id })}
										>
											Gelezen
										</Button>
									</Show>
								</Card>
							</li>
						);
					}}
				</For>
			</ul>

			<Show when={notificationsQuery.data?.hasMore}>
				<div class="flex justify-center">
					<Button
						variant="ghost"
						onClick={() => setLimit((l) => l + PAGE_SIZE)}
					>
						Meer laden
					</Button>
				</div>
			</Show>
		</section>
	);
}
