import { createFileRoute, useNavigate, useRouter } from "@tanstack/solid-router";
import { For, Show } from "solid-js";
import { metaFor, relativeTime } from "../../../components/notifications";
import { Button } from "../../../components/ui/button";
import { cn } from "../../../lib/cn";
import { Card } from "../../../components/ui/card";
import { RouteDataView } from "../../../components/ui/route-data-view";
import { toast } from "../../../components/ui/toast";
import { createAction } from "../../../lib/action";
import { useMe } from "../../../lib/auth/use-me";
import { Bell, CheckCheck } from "../../../lib/icons";
import { client, type Output } from "../../../lib/orpc";
import { refresh } from "../../../lib/refresh";
import { loadRouteData } from "../../../lib/route-data";
import { useServerEvent } from "../../../lib/sse/use-events";

const PAGE_SIZE = 20;

type NotificationsSearch = { limit?: number };
type NotificationList = Output<typeof client.notifications.list>;

export const Route = createFileRoute("/_protected/notificaties/")({
	// "Meer laden" grows the page in the URL, so a reload keeps what you saw.
	validateSearch: (search: Record<string, unknown>): NotificationsSearch => {
		const limit = Number(search.limit);
		return Number.isInteger(limit) && limit > PAGE_SIZE ? { limit } : {};
	},
	loaderDeps: ({ search }) => ({ limit: search.limit ?? PAGE_SIZE }),
	loader: async ({ deps, abortController }) => ({
		notifications: await loadRouteData(abortController.signal, (s) =>
			client.notifications.list({ limit: deps.limit, offset: 0 }, { signal: s }),
		),
	}),
	component: NotificationsPage,
});

function NotificationsPage() {
	const me = useMe();
	const router = useRouter();
	const navigate = useNavigate();
	const search = Route.useSearch();
	const data = Route.useLoaderData();
	const limit = () => search().limit ?? PAGE_SIZE;

	// Live-update on a new notification addressed to me.
	useServerEvent("notification.new", (payload) => {
		const userId = (payload as { userId?: string } | null)?.userId;
		if (!userId || userId === me.user().id) void refresh(router, "notifications");
	});

	const markRead = createAction(
		async (input: { id: string }) => {
			await client.notifications.markRead(input);
			await refresh(router, "notifications");
		},
		{ error: "Markeren lukte niet" },
	);

	// A chat notification deep-links to its conversation; opening it also marks
	// it read (#3/#5).
	const openNotification = (n: {
		id: string;
		read: boolean;
		entityType: string | null;
		entityId: string | null;
	}) => {
		if (!n.read) void markRead.run({ id: n.id });
		if (n.entityType === "conversation" && n.entityId) {
			void navigate({ to: "/chat", search: { conversationId: n.entityId } });
		}
	};

	const markAllRead = createAction(
		async () => {
			await client.notifications.markAllRead({});
			await refresh(router, "notifications");
			toast({ title: "Alles gemarkeerd als gelezen", tone: "success" });
		},
		{ error: "Markeren lukte niet" },
	);

	// Dev-only helper so the page is demoable before other epics emit events.
	const testEmit = createAction(
		async (input: Parameters<typeof client.notifications.testEmit>[0]) => {
			await client.notifications.testEmit(input);
			await refresh(router, "notifications");
			toast({ title: "Testnotificatie verzonden", tone: "success" });
		},
		{ error: "Versturen lukte niet" },
	);

	const list = (): NotificationList | undefined => {
		const r = data().notifications;
		return r.access === "granted" ? r.value : undefined;
	};
	const unread = () => list()?.unreadCount ?? 0;

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
							disabled={testEmit.pending()}
							onClick={() =>
								void testEmit.run({
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
							disabled={markAllRead.pending()}
							onClick={() => void markAllRead.run()}
						>
							<CheckCheck class="size-4" aria-hidden="true" />
							Alles gelezen
						</Button>
					</Show>
				</div>
			</div>

			<RouteDataView
				data={data().notifications}
				what="de notificaties"
				onRetry={() => void refresh(router, "notifications")}
			>
				{(page) => (
					<>
						<Show when={page().items.length === 0}>
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
							<For each={page().items}>
								{(n) => {
									const meta = metaFor(n.type);
									const Icon = meta.icon;
									const isChat = () =>
										n.entityType === "conversation" && Boolean(n.entityId);
									return (
										<li>
											<Card
												padding="sm"
												class={cn("flex items-start gap-3", {
													"border-primary/30 bg-primary-50/40": !n.read,
													"cursor-pointer hover:border-primary": isChat(),
												})}
												{...(isChat()
													? {
															role: "button",
															tabindex: 0,
															onClick: () => openNotification(n),
															onKeyDown: (e: KeyboardEvent) => {
																if (e.key === "Enter" || e.key === " ") {
																	e.preventDefault();
																	openNotification(n);
																}
															},
														}
													: {})}
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
															class={["text-body text-ink", { "font-semibold": !n.read }]}
														>
															{n.title}
														</p>
														<Show when={!n.read}>
															<span
																class="size-2 shrink-0 rounded-pill bg-accent" role="img" aria-label="ongelezen"
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
														disabled={markRead.pending()}
														onClick={(e) => {
															// Don't let the row's deep-link fire; just mark read.
															e.stopPropagation();
															void markRead.run({ id: n.id });
														}}
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

						<Show when={page().hasMore}>
							<div class="flex justify-center">
								<Button
									variant="ghost"
									onClick={() =>
										void navigate({
											to: ".",
											search: { limit: limit() + PAGE_SIZE },
											replace: true,
											resetScroll: false,
										})
									}
								>
									Meer laden
								</Button>
							</div>
						</Show>
					</>
				)}
			</RouteDataView>
		</section>
	);
}
