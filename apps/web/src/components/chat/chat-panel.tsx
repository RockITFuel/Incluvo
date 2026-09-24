import { useMutation, useQuery, useQueryClient } from "@tanstack/solid-query";
import {
	ClipboardList,
	Eye,
	Paperclip,
	Phone,
	Plus,
	Search,
	Send,
	Users,
	Video,
} from "lucide-solid";
import { createEffect, createMemo, createSignal, For, on, Show } from "solid-js";
import { orpc } from "../../lib/orpc";
import { useMe } from "../../lib/auth/use-me";
import { useServerEvent } from "../../lib/sse/use-events";
import { toast } from "../ui/toast";

/**
 * Chat (#5 1:1 coach–leerling, #6 group/forum met coach-supervisie). A 1:1
 * port of the approved "Chat" prototype: a 320px conversation list next to
 * the active thread + composer, inside one bordered pane. Realtime via the
 * `chat.message` SSE event — new messages append live.
 *
 * Role-aware: a coach may start a chat with each assigned leerling and may
 * read along in supervised group/forum chats (memberRole "coach" = read-along
 * only, no posting). Supervised chats show the "Coach kijkt mee" indicator
 * (transparantie / AVG) both in the list and as a banner in the thread.
 *
 * The prototype's "online" dot, calling and per-message task cards have no
 * backend support: there is no presence concept in the API at all (so the
 * dot is never fabricated — simply omitted), phone/video render as
 * decorative buttons, and the task card only renders if a message actually
 * carries `taskTitle` (chat.messages doesn't select the message table's task
 * columns yet, so today it never does — see #7).
 */

type Conversation = {
	id: string;
	kind: "direct" | "forum";
	displayName: string;
	subtitle: string | null;
	memberRole: "member" | "supervisor" | "coach";
	supervised: boolean;
	lastMessageBody: string | null;
	lastMessageAt: string | Date | null;
	otherUserId: string | null;
};

// `taskTitle` is forward-looking only: the `message` table has task-link
// columns (#7, post-MVP) but chat.messages doesn't select them yet, so this
// stays optional and — today — always undefined. Never fabricated.
type ChatMessage = {
	id: string;
	senderId: string;
	senderName: string;
	body: string;
	createdAt: string | Date;
	taskTitle?: string | null;
};

function initials(name: string): string {
	return name
		.split(/\s+/)
		.map((s) => s[0])
		.filter(Boolean)
		.slice(0, 2)
		.join("")
		.toUpperCase();
}

function formatTime(d: Date): string {
	return d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
}

// Relative label for the list row, echoing the prototype's "1u" / "2m" /
// "gisteren" tokens — derived from the real `lastMessageAt`, never fabricated.
function formatRelative(value: string | Date | null): string {
	if (!value) return "";
	const date = value instanceof Date ? value : new Date(value);
	const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);
	if (diffMin < 1) return "nu";
	if (diffMin < 60) return `${diffMin}m`;
	const diffH = Math.floor(diffMin / 60);
	if (diffH < 24) return `${diffH}u`;
	const diffD = Math.floor(diffH / 24);
	if (diffD === 1) return "gisteren";
	if (diffD < 7) return `${diffD}d`;
	return date.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

export function ChatPanel(props: {
	/** Deep-link: preselect this conversation once the list has loaded (#42). */
	conversationId?: string;
	/** Deep-link fallback: ensure & select a 1:1 chat with this user (#42). */
	otherUserId?: string;
}) {
	const me = useMe();
	const queryClient = useQueryClient();
	const [activeId, setActiveId] = createSignal<string | null>(null);
	const [query, setQuery] = createSignal("");
	// Track which deep-link we've already handled, so re-renders don't re-trigger.
	let handledDeepLink: string | null = null;

	const conversationsQuery = useQuery(() => orpc.chat.list.queryOptions());
	const partnersQuery = useQuery(() => orpc.chat.partners.queryOptions());

	const conversations = createMemo(() => conversationsQuery.data ?? []);
	const active = createMemo(() => conversations().find((c) => c.id === activeId()) ?? null);

	// Client-side filter over the real list — matches the prototype's search
	// box without needing a dedicated search endpoint.
	const filteredConversations = createMemo(() => {
		const q = query().trim().toLowerCase();
		if (!q) return conversations();
		return conversations().filter(
			(c) =>
				c.displayName.toLowerCase().includes(q) ||
				(c.lastMessageBody ?? "").toLowerCase().includes(q),
		);
	});

	const refetchList = () => queryClient.invalidateQueries({ queryKey: orpc.chat.list.key() });

	// Start (or open existing) a direct chat with a partner.
	const ensureDirect = useMutation(() =>
		orpc.chat.ensureDirect.mutationOptions({
			onSuccess: (res) => {
				refetchList();
				setActiveId(res.id);
			},
			onError: () => toast({ title: "Kon gesprek niet starten", tone: "danger" }),
		}),
	);

	// Deep-link handling (#42 snelactie): once conversations have loaded, honour
	// `?conversationId=` (preselect) or, failing that, `?otherUserId=` (ensure a
	// 1:1 chat then select it). Falls back to auto-selecting the first thread.
	createEffect(() => {
		if (conversationsQuery.isLoading) return;

		const wantConvo = props.conversationId;
		const wantUser = props.otherUserId;
		const linkKey = wantConvo ?? (wantUser ? `user:${wantUser}` : null);

		if (linkKey && handledDeepLink !== linkKey) {
			handledDeepLink = linkKey;
			if (wantConvo && conversations().some((c) => c.id === wantConvo)) {
				setActiveId(wantConvo);
				return;
			}
			if (wantUser) {
				ensureDirect.mutate({ otherUserId: wantUser });
				return;
			}
		}

		// Auto-select the first conversation once loaded (no deep-link in play).
		if (!activeId() && conversations().length > 0) {
			setActiveId(conversations()[0]?.id ?? null);
		}
	});

	// Conversations the actor doesn't have a thread with yet (start-new list).
	const partnersWithoutChat = createMemo(() => {
		const existing = new Set(
			conversations()
				.filter((c) => c.kind === "direct" && c.otherUserId)
				.map((c) => c.otherUserId),
		);
		return (partnersQuery.data ?? []).filter((p) => !existing.has(p.id));
	});

	return (
		<div class="grid h-[calc(100vh-12rem)] grid-cols-1 overflow-hidden rounded-3 border border-line bg-surface md:grid-cols-[20rem_1fr]">
			{/* Conversation list */}
			<aside class="flex min-h-0 flex-col border-line border-r">
				<div style={{ padding: "14px 16px", "border-bottom": "1px solid rgb(var(--line))" }}>
					<div
						style={{
							display: "flex",
							"align-items": "center",
							"justify-content": "space-between",
							"margin-bottom": "10px",
						}}
					>
						<h2 class="font-head text-ink" style={{ "font-size": "1.0625rem" }}>
							Chat
						</h2>
						{/* Decorative — starting a new chat happens via the list below. */}
						<button
							type="button"
							class="icon-btn"
							style={{ width: "30px", height: "30px" }}
							tabIndex={-1}
							aria-hidden="true"
						>
							<Plus size={14} />
						</button>
					</div>
					<div
						style={{
							display: "flex",
							"align-items": "center",
							gap: "8px",
							padding: "8px 12px",
							background: "rgb(var(--bg))",
							"border-radius": "10px",
						}}
					>
						<Search size={14} class="shrink-0 text-muted-2" aria-hidden="true" />
						<label class="sr-only" for="chat-search">
							Zoek in berichten
						</label>
						<input
							id="chat-search"
							type="text"
							class="text-ink placeholder:text-muted-2"
							style={{
								border: "0",
								background: "transparent",
								outline: "none",
								flex: "1",
								"font-size": "0.8125rem",
							}}
							placeholder="Zoek in berichten…"
							value={query()}
							onInput={(e) => setQuery(e.currentTarget.value)}
						/>
					</div>
				</div>

				<div class="min-h-0 flex-1 overflow-y-auto">
					<Show when={conversationsQuery.isLoading}>
						<p class="px-4 py-3 text-muted text-small">Laden…</p>
					</Show>

					<Show
						when={filteredConversations().length > 0}
						fallback={
							<Show when={!conversationsQuery.isLoading}>
								<p class="px-4 py-3 text-muted text-small">
									{query() ? "Geen gesprekken gevonden." : "Nog geen gesprekken."}
								</p>
							</Show>
						}
					>
						<ul>
							<For each={filteredConversations()}>
								{(c) => (
									<li>
										<ConversationButton
											conversation={c}
											active={c.id === activeId()}
											onSelect={() => setActiveId(c.id)}
										/>
									</li>
								)}
							</For>
						</ul>
					</Show>

					{/* Start a new direct chat with an available partner. */}
					<Show when={partnersWithoutChat().length > 0}>
						<div style={{ "border-top": "1px solid rgb(var(--line))", padding: "12px 16px" }}>
							<p class="mb-2 font-medium text-micro text-muted uppercase tracking-wide">
								{me.is("coach") ? "Start met leerling" : "Start met coach"}
							</p>
							<ul class="flex flex-col gap-1">
								<For each={partnersWithoutChat()}>
									{(p) => (
										<li>
											<button
												type="button"
												class="flex w-full items-center gap-2 rounded-2 px-2 py-2 text-left text-body text-ink hover:bg-bg-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
												disabled={ensureDirect.isPending}
												onClick={() => ensureDirect.mutate({ otherUserId: p.id })}
											>
												<div
													class="avatar shrink-0"
													style={{ width: "28px", height: "28px", "font-size": "0.6875rem" }}
												>
													{initials(p.name)}
												</div>
												<span class="truncate">{p.name}</span>
											</button>
										</li>
									)}
								</For>
							</ul>
						</div>
					</Show>
				</div>
			</aside>

			{/* Active thread */}
			<Show
				when={active()}
				fallback={
					<div style={{ padding: "32px", color: "rgb(var(--muted))" }}>Selecteer een gesprek</div>
				}
			>
				{(conv) => <ChatThread conversation={conv()} />}
			</Show>
		</div>
	);
}

function ConversationButton(props: {
	conversation: Conversation;
	active: boolean;
	onSelect: () => void;
}) {
	const c = () => props.conversation;
	// The API only distinguishes "direct" (1:1) vs "forum" (any multi-member
	// thread — group chat or course forum); it doesn't carry a coach/peer flag
	// for direct chats, so the tan "group" treatment is used for every forum
	// kind and the default (blue) gradient for every direct chat.
	const isGroup = () => c().kind === "forum";

	return (
		<button
			type="button"
			onClick={props.onSelect}
			aria-current={props.active ? "true" : undefined}
			class="flex w-full items-start gap-3 border-l-[3px] px-4 py-3 text-left hover:bg-bg-2 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
			classList={{
				"bg-primary-50 border-l-primary": props.active,
				"border-l-transparent": !props.active,
			}}
		>
			<div
				class="avatar shrink-0"
				style={{
					width: "40px",
					height: "40px",
					"font-size": "0.875rem",
					background: isGroup() ? "linear-gradient(135deg, #E0D6C5, #B8AB94)" : undefined,
				}}
			>
				<Show when={isGroup()} fallback={initials(c().displayName)}>
					<Users size={16} aria-hidden="true" />
				</Show>
			</div>
			<div class="min-w-0 flex-1">
				<div class="flex items-center justify-between gap-2">
					<p class="truncate font-medium text-body text-ink">{c().displayName}</p>
					<span class="shrink-0 text-micro text-muted">{formatRelative(c().lastMessageAt)}</span>
				</div>
				<Show when={c().lastMessageBody}>
					<p class="truncate text-small text-muted" style={{ "margin-top": "2px" }}>
						{c().lastMessageBody}
					</p>
				</Show>
				<Show when={c().supervised}>
					<span
						class="chip"
						style={{ "margin-top": "4px", "font-size": "0.625rem", padding: "2px 6px" }}
					>
						<Eye size={10} aria-hidden="true" /> Coach kijkt mee
					</span>
				</Show>
			</div>
		</button>
	);
}

function ChatThread(props: { conversation: Conversation }) {
	const me = useMe();
	const queryClient = useQueryClient();
	const [draft, setDraft] = createSignal("");
	let scrollEl: HTMLDivElement | undefined;

	const conversationId = createMemo(() => props.conversation.id);
	const isGroup = () => props.conversation.kind === "forum";

	// Clear the composer when switching conversations so a half-typed draft can't
	// be sent to the wrong person (ChatThread isn't remounted across selections).
	createEffect(on(conversationId, () => setDraft(""), { defer: true }));

	const messagesQuery = useQuery(() => ({
		...orpc.chat.messages.queryOptions({
			input: { conversationId: conversationId() },
		}),
	}));

	const messages = createMemo<ChatMessage[]>(() => messagesQuery.data?.messages ?? []);

	const messagesKey = () => orpc.chat.messages.key({ input: { conversationId: conversationId() } });

	const scrollToBottom = () => {
		queueMicrotask(() => {
			if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
		});
	};

	// Scroll to bottom on conversation change / new messages.
	createEffect(on(messages, () => scrollToBottom()));

	// Live append: when a chat.message SSE frame arrives for this conversation,
	// refetch this thread (and the list, for the latest-message preview).
	useServerEvent("chat.message", (payload) => {
		const p = payload as { conversationId?: string } | null;
		if (p?.conversationId === conversationId()) {
			queryClient.invalidateQueries({ queryKey: messagesKey() });
		}
		queryClient.invalidateQueries({ queryKey: orpc.chat.list.key() });
	});

	const send = useMutation(() =>
		orpc.chat.send.mutationOptions({
			onSuccess: () => {
				setDraft("");
				queryClient.invalidateQueries({ queryKey: messagesKey() });
				queryClient.invalidateQueries({ queryKey: orpc.chat.list.key() });
			},
			onError: () => toast({ title: "Bericht niet verzonden", tone: "danger" }),
		}),
	);

	// A supervising coach reads along but cannot post into a forum they don't
	// belong to (memberRole "coach" = read-along only).
	const canPost = () => props.conversation.memberRole !== "coach";

	const submit = () => {
		const body = draft().trim();
		if (!body || send.isPending) return;
		send.mutate({ conversationId: conversationId(), body });
	};

	return (
		<section class="flex min-h-0 flex-col">
			{/* Header */}
			<header
				style={{
					padding: "14px 20px",
					"border-bottom": "1px solid rgb(var(--line))",
					display: "flex",
					"align-items": "center",
					gap: "12px",
				}}
			>
				<div
					class="avatar shrink-0"
					style={{
						width: "36px",
						height: "36px",
						"font-size": "0.8125rem",
						background: isGroup() ? "linear-gradient(135deg, #E0D6C5, #B8AB94)" : undefined,
					}}
				>
					<Show when={isGroup()} fallback={initials(props.conversation.displayName)}>
						<Users size={16} aria-hidden="true" />
					</Show>
				</div>
				<div class="min-w-0 flex-1">
					<p class="truncate font-semibold text-body text-ink">{props.conversation.displayName}</p>
					<Show when={props.conversation.subtitle}>
						<p class="truncate text-small text-muted">{props.conversation.subtitle}</p>
					</Show>
				</div>
				{/* Decorative — calling isn't wired up. */}
				<button type="button" class="icon-btn" tabIndex={-1} aria-hidden="true">
					<Phone size={15} />
				</button>
				<button type="button" class="icon-btn" tabIndex={-1} aria-hidden="true">
					<Video size={15} />
				</button>
			</header>

			{/* Coach-meekijk transparency banner (#6 / AVG) */}
			<Show when={props.conversation.supervised}>
				<div
					role="note"
					style={{
						padding: "10px 20px",
						background: "rgb(var(--warning-100))",
						color: "rgb(var(--warning))",
						"font-size": "0.7812rem",
						display: "flex",
						"align-items": "center",
						gap: "8px",
					}}
				>
					<Eye size={14} aria-hidden="true" />
					<span>Dit is een groepschat van een opdracht. Je coach kan meelezen.</span>
				</div>
			</Show>

			{/* Messages */}
			<div
				ref={scrollEl}
				style={{
					flex: "1",
					"overflow-y": "auto",
					padding: "20px 24px",
					background: "rgb(var(--bg))",
				}}
				aria-live="polite"
			>
				<Show when={messagesQuery.isLoading}>
					<p class="text-muted text-small">Berichten laden…</p>
				</Show>
				<Show
					when={messages().length > 0}
					fallback={
						<Show when={!messagesQuery.isLoading}>
							<p class="text-muted text-small">Nog geen berichten. Stuur het eerste bericht.</p>
						</Show>
					}
				>
					<ul style={{ display: "flex", "flex-direction": "column", gap: "10px" }}>
						<For each={messages()}>
							{(m) => {
								const mine = () => m.senderId === me.user()?.id;
								return (
									<li style={{ "align-self": mine() ? "flex-end" : "flex-start", "max-width": "70%" }}>
										<Show when={!mine()}>
											<p style={{ margin: "0 0 2px 2px", "font-size": "0.6875rem", color: "rgb(var(--muted))" }}>
												{m.senderName}
											</p>
										</Show>
										<div
											style={{
												padding: "10px 14px",
												"border-radius": "14px",
												background: mine() ? "rgb(var(--primary))" : "rgb(var(--surface))",
												color: mine() ? "#fff" : "rgb(var(--ink))",
												border: mine() ? "none" : "1px solid rgb(var(--line))",
												"font-size": "0.875rem",
												"line-height": "1.4",
											}}
										>
											{m.body}
										</div>
										{/* Only rendered once/if chat.messages starts exposing a task link. */}
										<Show when={m.taskTitle}>
											<div
												style={{
													"margin-top": "6px",
													padding: "10px 12px",
													background: "rgb(var(--surface))",
													border: "1px solid rgb(var(--line))",
													"border-left": "3px solid rgb(var(--accent))",
													"border-radius": "10px",
													"font-size": "0.8125rem",
													display: "flex",
													"align-items": "center",
													gap: "10px",
												}}
											>
												<ClipboardList size={15} aria-hidden="true" />
												<div class="min-w-0 flex-1">
													<div style={{ "font-weight": "500" }}>Taak: {m.taskTitle}</div>
												</div>
												<button type="button" class="btn subtle sm">
													Bekijk
												</button>
											</div>
										</Show>
										<p
											style={{
												"font-size": "0.6875rem",
												color: "rgb(var(--muted))",
												"margin-top": "4px",
												"text-align": mine() ? "right" : "left",
											}}
										>
											{formatTime(new Date(m.createdAt))}
										</p>
									</li>
								);
							}}
						</For>
					</ul>
				</Show>
			</div>

			{/* Composer */}
			<Show
				when={canPost()}
				fallback={
					<div
						style={{ "border-top": "1px solid rgb(var(--line))", padding: "12px 20px" }}
						class="text-muted text-small"
					>
						Je kijkt mee als coach en kunt in deze groepschat niet meeschrijven.
					</div>
				}
			>
				<form
					style={{
						padding: "12px 16px",
						"border-top": "1px solid rgb(var(--line))",
						display: "flex",
						gap: "8px",
						"align-items": "flex-end",
					}}
					onSubmit={(e) => {
						e.preventDefault();
						submit();
					}}
				>
					{/* Decorative — attachments aren't wired up. */}
					<button type="button" class="icon-btn" tabIndex={-1} aria-hidden="true">
						<Paperclip size={15} />
					</button>
					<label class="sr-only" for="chat-composer">
						Schrijf een bericht
					</label>
					<textarea
						id="chat-composer"
						class="textarea"
						style={{ "min-height": "42px", padding: "10px 12px", flex: "1" }}
						placeholder="Schrijf een bericht…"
						rows={1}
						value={draft()}
						onInput={(e) => setDraft(e.currentTarget.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && !e.shiftKey) {
								e.preventDefault();
								submit();
							}
						}}
					/>
					<button
						type="submit"
						class="btn primary"
						disabled={send.isPending || !draft().trim()}
						aria-label="Verstuur bericht"
					>
						<Send size={14} aria-hidden="true" />
					</button>
				</form>
			</Show>
		</section>
	);
}
