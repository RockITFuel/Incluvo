import { DropdownMenu } from "@kobalte/core/dropdown-menu";
import { Link, useLoaderData, useRouter } from "@tanstack/solid-router";
import { Bell, CheckCheck } from "../../lib/icons";
import { type Component, For, Show } from "solid-js";
import { useMe } from "../../lib/auth/use-me";
import { createAction } from "../../lib/action";
import { client } from "../../lib/orpc";
import { refresh } from "../../lib/refresh";
import { useServerEvent } from "../../lib/sse/use-events";
import { metaFor, relativeTime } from "./notification-meta";
import { opensSomething, useOpenNotification } from "./notification-target";

/**
 * Self-contained notifications bell for the shell topbar (backlog #3).
 *
 * - Shows an unread-count badge.
 * - Opens an accessible dropdown panel (Kobalte) listing recent notifications.
 * - Subscribes to the SSE `notification.new` event and live-updates the moment
 *   a notification arrives for the *current* user (the hub broadcasts to all
 *   clients, so we filter on `userId` from `useMe()`).
 *
 * Role-agnostic: every authenticated user (leerling, coach, …) gets one bell.
 *
 * The orchestrator mounts this in the topbar (see "ORCHESTRATOR TODO").
 */
export const NotificationsBell: Component = () => {
	const me = useMe();
	const router = useRouter();
	const open = useOpenNotification();
	// Recent notifications (newest first), loaded by the /_protected layout.
	const shell = useLoaderData({ from: "/_protected" });
	const recent = () => shell().notifications;
	const data = () => {
		const r = recent();
		return r.access === "granted" ? r.value : undefined;
	};

	// Live-update when a notification arrives for me.
	useServerEvent("notification.new", (payload) => {
		const userId = (payload as { userId?: string } | null)?.userId;
		// React to events that aren't user-scoped or that are addressed to the
		// current user.
		if (!userId || userId === me.user().id) void refresh(router, "notifications");
	});

	const markAllRead = createAction(
		async () => {
			await client.notifications.markAllRead({});
			await refresh(router, "notifications");
		},
		{ error: "Markeren lukte niet" },
	);

	const markRead = createAction(
		async (input: { id: string }) => {
			await client.notifications.markRead(input);
			await refresh(router, "notifications");
		},
		{ error: "Markeren lukte niet" },
	);

	const unread = () => data()?.unreadCount ?? 0;

	return (
		<DropdownMenu placement="bottom-end" gutter={8}>
			<DropdownMenu.Trigger
				class="relative grid size-9 place-items-center rounded-2 border border-line bg-surface text-ink-2 transition-colors duration-fast hover:bg-line-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
				aria-label={
					unread() > 0
						? `Notificaties, ${unread()} ongelezen`
						: "Notificaties"
				}
			>
				<Bell class="size-5" aria-hidden="true" />
				<Show when={unread() > 0}>
					<span
						class="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-pill bg-accent-700 px-1 text-micro font-semibold text-white"
						aria-hidden="true"
					>
						{unread() > 99 ? "99+" : unread()}
					</span>
				</Show>
			</DropdownMenu.Trigger>

			<DropdownMenu.Portal>
				<DropdownMenu.Content class="z-[90] flex w-[22rem] max-w-[calc(100vw-1.5rem)] flex-col rounded-2 border border-line bg-surface shadow-3 outline-none animate-scale-in">
					<div class="flex items-center justify-between gap-2 border-line-2 border-b px-3 py-2.5">
						<h2 class="font-head text-h3 text-ink">Notificaties</h2>
						<Show when={unread() > 0}>
							<button
								type="button"
								class="inline-flex items-center gap-1 rounded-1 px-2 py-1 text-micro text-primary-700 hover:bg-primary-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:opacity-50"
								disabled={markAllRead.pending()}
								onClick={() => void markAllRead.run()}
							>
								<CheckCheck class="size-4" aria-hidden="true" />
								Alles gelezen
							</button>
						</Show>
					</div>

					<div class="max-h-[24rem] overflow-y-auto py-1">
						<Show when={recent().access !== "granted"}>
							<p class="px-3 py-6 text-center text-small text-danger">
								Kon notificaties niet laden.
							</p>
						</Show>
						<Show
							when={data()?.items.length === 0}
						>
							<p class="px-3 py-8 text-center text-small text-muted">
								Je bent helemaal bij. Geen nieuwe notificaties.
							</p>
						</Show>

						<For each={data()?.items}>
							{(n) => {
								const meta = metaFor(n.type);
								const Icon = meta.icon;
								// INC-30: a notification opens what it is about; one
								// about nothing (a general message) is only marked read
								// and keeps the panel open.
								const opens = opensSomething(n);
								return (
									<DropdownMenu.Item
										closeOnSelect={opens}
										onSelect={() => {
											if (opens) void open.run(n.id);
											else if (!n.read) void markRead.run({ id: n.id });
										}}
										class="flex cursor-pointer items-start gap-3 px-3 py-2.5 outline-none data-[highlighted]:bg-line-2"
									>
										<span
											class={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-2 ${meta.tone}`}
											aria-hidden="true"
										>
											<Icon class="size-4" />
										</span>
										<span class="min-w-0 flex-1">
											<span class="flex items-center gap-2">
												<span
													class={["truncate text-small font-medium text-ink", { "font-semibold": !n.read }]}
												>
													{n.title}
												</span>
												<Show when={!n.read}>
													<span
														class="size-2 shrink-0 rounded-pill bg-accent" role="img" aria-label="ongelezen"
													/>
												</Show>
											</span>
											<Show when={n.body}>
												<span class="mt-0.5 block truncate text-micro text-muted">
													{n.body}
												</span>
											</Show>
											<span class="mt-0.5 block text-micro text-muted-2">
												{meta.label} · {relativeTime(n.createdAt)}
											</span>
										</span>
									</DropdownMenu.Item>
								);
							}}
						</For>
					</div>

					<div class="border-line-2 border-t px-3 py-2">
						<DropdownMenu.Item
							as={Link}
							to="/notificaties"
							closeOnSelect
							class="block rounded-1 px-2 py-1.5 text-center text-small font-medium text-primary-700 outline-none hover:bg-primary-50 data-[highlighted]:bg-primary-50"
						>
							Alle notificaties bekijken
						</DropdownMenu.Item>
					</div>
				</DropdownMenu.Content>
			</DropdownMenu.Portal>
		</DropdownMenu>
	);
};
