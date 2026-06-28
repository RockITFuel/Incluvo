import { DropdownMenu } from "@kobalte/core/dropdown-menu";
import { useMutation, useQuery, useQueryClient } from "@tanstack/solid-query";
import { Link } from "@tanstack/solid-router";
import { Bell, CheckCheck } from "lucide-solid";
import { type Component, For, Show } from "solid-js";
import { useMe } from "../../lib/auth/use-me";
import { orpc } from "../../lib/orpc";
import { useServerEvent } from "../../lib/sse/use-events";
import { metaFor, relativeTime } from "./notification-meta";

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
	const queryClient = useQueryClient();

	// Recent notifications (newest first) for the dropdown panel.
	const recent = useQuery(() =>
		orpc.notifications.list.queryOptions({
			input: { limit: 8, offset: 0 },
		}),
	);

	const invalidate = () => {
		queryClient.invalidateQueries({
			queryKey: orpc.notifications.key(),
		});
	};

	// Live-update when a notification arrives for me.
	useServerEvent("notification.new", (payload) => {
		const userId = (payload as { userId?: string } | null)?.userId;
		// Only react to events addressed to the current user.
		if (!userId || userId === me.user()?.id) {
			invalidate();
		}
	});

	const markAllRead = useMutation(() =>
		orpc.notifications.markAllRead.mutationOptions({
			onSuccess: invalidate,
		}),
	);

	const markRead = useMutation(() =>
		orpc.notifications.markRead.mutationOptions({
			onSuccess: invalidate,
		}),
	);

	const unread = () => recent.data?.unreadCount ?? 0;

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
								disabled={markAllRead.isPending}
								onClick={() => markAllRead.mutate({})}
							>
								<CheckCheck class="size-4" aria-hidden="true" />
								Alles gelezen
							</button>
						</Show>
					</div>

					<div class="max-h-[24rem] overflow-y-auto py-1">
						<Show when={recent.isLoading}>
							<p class="px-3 py-6 text-center text-small text-muted">
								Laden…
							</p>
						</Show>
						<Show when={recent.error}>
							<p class="px-3 py-6 text-center text-small text-danger">
								Kon notificaties niet laden.
							</p>
						</Show>
						<Show
							when={!recent.isLoading && (recent.data?.items.length ?? 0) === 0}
						>
							<p class="px-3 py-8 text-center text-small text-muted">
								Je bent helemaal bij. Geen nieuwe notificaties.
							</p>
						</Show>

						<For each={recent.data?.items}>
							{(n) => {
								const meta = metaFor(n.type);
								const Icon = meta.icon;
								return (
									<DropdownMenu.Item
										closeOnSelect={false}
										onSelect={() => {
											if (!n.read) markRead.mutate({ id: n.id });
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
													class="truncate text-small font-medium text-ink"
													classList={{ "font-semibold": !n.read }}
												>
													{n.title}
												</span>
												<Show when={!n.read}>
													<span
														class="size-2 shrink-0 rounded-pill bg-accent"
														aria-label="ongelezen"
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
