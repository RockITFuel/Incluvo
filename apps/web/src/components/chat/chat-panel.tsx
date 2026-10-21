import { coachesLeerlingen } from "@incluvo/permissions";
import { useRouter } from "@tanstack/solid-router";
import {
	ClipboardList,
	Download,
	Eye,
	FileText,
	Paperclip,
	Plus,
	Search,
	Send,
	Users,
	X,
} from "../../lib/icons";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { createAction } from "../../lib/action";
import { friendlyError } from "../../lib/errors";
import { createLoad } from "../../lib/load";
import { client } from "../../lib/orpc";
import { refresh } from "../../lib/refresh";
import { uploadFile } from "../courses/upload";
import { Dialog } from "../ui/dialog";
import { Tooltip } from "../ui/tooltip";
import { useMe } from "../../lib/auth/use-me";
import { useServerEvent } from "../../lib/sse/use-events";
import { toast } from "../ui/toast";
import { ErrorState } from "../../components/ui/error-state";

/**
 * Chat (#5 1:1 coach–leerling, #6 group/forum met coach-supervisie). A 1:1
 * port of the approved "Chat" prototype: a 320px conversation list next to
 * the active thread + composer, inside one bordered pane. Realtime via the
 * `chat.message` SSE event — new messages append live.
 *
 * Self-contained: it loads its own conversations and messages (createLoad), so
 * it can sit on /chat and inside the coach's leerling page without either
 * route loading chat data for it.
 *
 * Role-aware: a coach may start a chat with each assigned leerling and may
 * read along in supervised group/forum chats (memberRole "coach" = read-along
 * only, no posting). Supervised chats show the "Coach kijkt mee" indicator
 * (transparantie / AVG) both in the list and as a banner in the thread.
 *
 * Files can be sent with a message (INC-8; uploaded with scope "chat", read
 * back through `chat.attachmentUrl`). The prototype's calling buttons and
 * "online" dot are left out: there is no calling or presence in the app. The
 * task card only renders if a message actually carries `taskTitle`
 * (chat.messages doesn't select the message table's task columns yet — #7).
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
	attachment: { name: string; contentType: string } | null;
	createdAt: string | Date;
	taskTitle?: string | null;
};

/** File types the server accepts for an upload (courses/storage.ts). */
const ACCEPT =
	"image/png,image/jpeg,image/webp,application/pdf,.doc,.docx,.ppt,.pptx,.xlsx,audio/mpeg,audio/webm,video/mp4,video/webm";
const MAX_BYTES = 50 * 1024 * 1024;

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
	const router = useRouter();
	const [query, setQuery] = createSignal("");
	const [newOpen, setNewOpen] = createSignal(false);
	const [partnerQuery, setPartnerQuery] = createSignal("");

	const conversationsLoad = createLoad(
		() => ({}),
		(_, signal) => client.chat.list(undefined, { signal }),
	);
	const partnersLoad = createLoad(
		() => ({}),
		(_, signal) => client.chat.partners(undefined, { signal }),
	);
	const listLoading = () => conversationsLoad.data() === undefined && !conversationsLoad.error();
	const partners = () => partnersLoad.data() ?? [];

	const conversations = createMemo((): Conversation[] => conversationsLoad.data() ?? []);

	/** Reload the list here and every page that shows chat data. */
	const reloadList = () => {
		conversationsLoad.reload();
		void refresh(router, "chat");
	};

	// The thread you picked. A new `?conversationId=` deep link (e.g. from a
	// notification while already on /chat) clears the pick, so the link wins.
	const [chosenId, setChosenId] = createSignal<string | null>(
		() => (props.conversationId, null),
	);
	// Shown thread: your pick, else the deep-linked one, else the first.
	const activeId = createMemo(() => {
		const chosen = chosenId();
		if (chosen) return chosen;
		const list = conversations();
		if (props.conversationId && list.some((c) => c.id === props.conversationId)) {
			return props.conversationId;
		}
		return list[0]?.id ?? null;
	});
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

	// Start (or open existing) a direct chat with a partner.
	const ensureDirect = createAction(
		async (otherUserId: string) => {
			const res = await client.chat.ensureDirect({ otherUserId });
			setChosenId(res.id);
			reloadList();
		},
		{ error: "Kon gesprek niet starten" },
	);

	// Deep link `?otherUserId=` (#42 snelactie): once the list has loaded and no
	// `?conversationId=` is given, ensure the 1:1 chat with that user and open it.
	let handledUser: string | null = null;
	createEffect(
		() => ({
			user: props.conversationId ? undefined : props.otherUserId,
			loaded: conversationsLoad.data() !== undefined,
		}),
		({ user, loaded }) => {
			if (!user || !loaded || handledUser === user) return;
			handledUser = user;
			// The action writes signals: run it outside the effect.
			queueMicrotask(() => void ensureDirect.run(user));
		},
	);

	// A message anywhere changes the list's latest-message previews.
	useServerEvent("chat.message", () => reloadList());

	// Conversations the actor doesn't have a thread with yet (start-new list).
	const partnersWithoutChat = createMemo(() => {
		const existing = new Set(
			conversations()
				.filter((c) => c.kind === "direct" && c.otherUserId)
				.map((c) => c.otherUserId),
		);
		return partners().filter((p) => !existing.has(p.id));
	});

	/** Open the chat with a partner: the existing one, or start it. */
	const openChatWith = (partnerId: string) => {
		setNewOpen(false);
		setPartnerQuery("");
		const existing = conversations().find(
			(c) => c.kind === "direct" && c.otherUserId === partnerId,
		);
		if (existing) setChosenId(existing.id);
		else void ensureDirect.run(partnerId);
	};
	const shownPartners = createMemo(() => {
		const q = partnerQuery().trim().toLowerCase();
		const all = partners();
		return q ? all.filter((p) => p.name.toLowerCase().includes(q)) : all;
	});
	const coaching = () => coachesLeerlingen(me.role());

	return (
		<div class="grid h-[calc(100vh-12rem)] grid-cols-1 overflow-hidden rounded-3 border border-line bg-surface md:grid-cols-[20rem_1fr]">
			<Dialog
				open={newOpen()}
				onOpenChange={setNewOpen}
				title="Nieuw gesprek"
				description={coaching() ? "Kies een leerling." : "Kies je coach."}
			>
				<div class="flex flex-col gap-2">
					<Show when={partners().length > 6}>
						<label class="flex items-center gap-2 rounded-2 border border-line px-3 py-2">
							<Search size={14} class="text-muted" aria-hidden="true" />
							<input
								class="w-full bg-transparent text-small outline-none"
								placeholder="Zoek op naam…"
								aria-label="Zoek op naam"
								value={partnerQuery()}
								onInput={(e) => setPartnerQuery(e.currentTarget.value)}
							/>
						</label>
					</Show>
					<ul class="flex max-h-80 flex-col gap-1 overflow-y-auto">
						<For
							each={shownPartners()}
							fallback={<li class="px-2 py-2 text-small text-muted">Niemand gevonden.</li>}
						>
							{(p) => (
								<li>
									<button
										type="button"
										class="flex w-full items-center gap-2 rounded-2 px-2 py-2 text-left text-body text-ink hover:bg-bg-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
										disabled={ensureDirect.pending()}
										onClick={() => openChatWith(p.id)}
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
			</Dialog>
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
						<h1 class="font-head text-ink" style={{ "font-size": "1.0625rem" }}>
							Chat
						</h1>
						{/* Hidden when there is nobody to chat with (INC-8 AC3). */}
						<Show when={partners().length > 0}>
							<Tooltip content="Nieuw gesprek">
								{(trigger) => (
									<button
										{...trigger}
										type="button"
										class="icon-btn"
										style={{ width: "30px", height: "30px" }}
										aria-label="Nieuw gesprek"
										onClick={() => setNewOpen(true)}
									>
										<Plus size={14} aria-hidden="true" />
									</button>
								)}
							</Tooltip>
						</Show>
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
					<Show when={listLoading()}>
						<p class="px-4 py-3 text-muted text-small">Laden…</p>
					</Show>
					<Show when={conversationsLoad.error()}>
						{(error) => (
							<ErrorState
								class="m-3"
								error={error()}
								what="je gesprekken"
								onRetry={() => conversationsLoad.reload()}
							/>
						)}
					</Show>

					<Show
						when={filteredConversations().length > 0}
						fallback={
							<Show when={!listLoading() && !conversationsLoad.error()}>
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
											onSelect={() => setChosenId(c.id)}
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
								{coaching() ? "Start met leerling" : "Start met coach"}
							</p>
							<ul class="flex flex-col gap-1">
								<For each={partnersWithoutChat()}>
									{(p) => (
										<li>
											<button
												type="button"
												class="flex w-full items-center gap-2 rounded-2 px-2 py-2 text-left text-body text-ink hover:bg-bg-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
												disabled={ensureDirect.pending()}
												onClick={() => void ensureDirect.run(p.id)}
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
				{(conv) => <ChatThread conversation={conv()} onChanged={reloadList} />}
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
			class={[
				"flex w-full items-start gap-3 border-l-[3px] px-4 py-3 text-left hover:bg-bg-2 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
				{
					"bg-primary-50 border-l-primary": props.active,
					"border-l-transparent": !props.active,
				},
			]}
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

function ChatThread(props: { conversation: Conversation; onChanged: () => void }) {
	const me = useMe();
	let scrollEl: HTMLDivElement | undefined;
	let fileInput: HTMLInputElement | undefined;

	const conversationId = createMemo(() => props.conversation.id);
	const isGroup = () => props.conversation.kind === "forum";

	// Clear the composer and the picked file when switching conversations, so a
	// half-typed draft can't be sent to the wrong person (ChatThread isn't
	// remounted across selections): writable memos reset on a new id.
	const [draft, setDraft] = createSignal(() => (conversationId(), ""));
	const [file, setFile] = createSignal<File | null>(() => (conversationId(), null));

	const messagesLoad = createLoad(
		() => conversationId(),
		async (id, signal) => ({ id, ...(await client.chat.messages({ conversationId: id }, { signal })) }),
	);
	// Only this conversation's messages: the previous thread's stay out while
	// the new one loads.
	const loaded = () => {
		const data = messagesLoad.data();
		return data?.id === conversationId() ? data : undefined;
	};
	const messagesLoading = () => !loaded() && !messagesLoad.error();
	const messages = createMemo((): ChatMessage[] => loaded()?.messages ?? []);

	const scrollToBottom = () => {
		queueMicrotask(() => {
			if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
		});
	};

	// Scroll to bottom on conversation change / new messages.
	createEffect(
		() => messages(),
		() => scrollToBottom(),
	);

	// Live append: when a chat.message SSE frame arrives for this conversation,
	// reload this thread (ChatPanel reloads the list).
	useServerEvent("chat.message", (payload) => {
		const p = payload as { conversationId?: string } | null;
		if (p?.conversationId === conversationId()) messagesLoad.reload();
	});

	const pickFile = (f: File | undefined) => {
		if (!f) return;
		if (f.size > MAX_BYTES) {
			toast({ title: "Bestand is te groot", description: "Maximaal 50 MB.", tone: "danger" });
			return;
		}
		setFile(f);
	};

	// A supervising coach reads along but cannot post into a forum they don't
	// belong to (memberRole "coach" = read-along only).
	const canPost = () => props.conversation.memberRole !== "coach";

	// Draft and file stay when sending fails, so nothing has to be redone.
	const send = createAction(
		async (body: string, attach: File | null) => {
			const attachmentStorageKey = attach ? await uploadFile(attach, "chat") : undefined;
			await client.chat.send({ conversationId: conversationId(), body, attachmentStorageKey });
			setDraft("");
			setFile(null);
			messagesLoad.reload();
			props.onChanged();
		},
		{ error: "Bericht niet verzonden" },
	);
	const sending = send.pending;

	const submit = () => {
		const body = draft().trim();
		const attach = file();
		if (!body && !attach) return;
		void send.run(body, attach);
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
				<Show when={messagesLoading()}>
					<p class="text-muted text-small">Berichten laden…</p>
				</Show>
				<Show when={messagesLoad.error()}>
					{(error) => (
						<ErrorState
							error={error()}
							what="de berichten"
							onRetry={() => messagesLoad.reload()}
						/>
					)}
				</Show>
				<Show
					when={messages().length > 0}
					fallback={
						<Show when={!messagesLoading()}>
							<p class="text-muted text-small">Nog geen berichten. Stuur het eerste bericht.</p>
						</Show>
					}
				>
					<ul style={{ display: "flex", "flex-direction": "column", gap: "10px" }}>
						<For each={messages()}>
							{(m) => {
								const mine = () => m.senderId === me.user().id;
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
											<Show when={m.body}>
												<p style={{ margin: "0", "white-space": "pre-wrap" }}>{m.body}</p>
											</Show>
											<Show when={m.attachment}>
												{(a) => <Attachment messageId={m.id} attachment={a()} mine={mine()} />}
											</Show>
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
						void submit();
					}}
				>
					<input
						ref={fileInput}
						type="file"
						accept={ACCEPT}
						class="sr-only"
						tabindex={-1}
						aria-hidden="true"
						onChange={(e) => {
							pickFile(e.currentTarget.files?.[0]);
							e.currentTarget.value = "";
						}}
					/>
					<Tooltip content="Bestand toevoegen">
						{(trigger) => (
							<button
								{...trigger}
								type="button"
								class="icon-btn"
								style={{ width: "42px", height: "42px", "flex-shrink": "0" }}
								aria-label="Bestand toevoegen"
								disabled={sending()}
								onClick={() => fileInput?.click()}
							>
								<Paperclip size={15} aria-hidden="true" />
							</button>
						)}
					</Tooltip>
					<div style={{ flex: "1", display: "flex", "flex-direction": "column", gap: "6px" }}>
						<Show when={file()}>
							{(f) => (
								<div
									class="chip"
									style={{ "align-self": "flex-start", gap: "6px", "max-width": "100%" }}
								>
									<FileText size={13} aria-hidden="true" />
									<span class="truncate">{f().name}</span>
									<button
										type="button"
										aria-label={`${f().name} weghalen`}
										onClick={() => setFile(null)}
										class="rounded-full p-0.5 hover:bg-line-2"
									>
										<X size={12} aria-hidden="true" />
									</button>
								</div>
							)}
						</Show>
					<label class="sr-only" for="chat-composer">
						Schrijf een bericht
					</label>
					<textarea
						id="chat-composer"
						class="textarea"
						style={{ "min-height": "42px", padding: "10px 12px", width: "100%" }}
						placeholder="Schrijf een bericht…"
						rows={1}
						value={draft()}
						onInput={(e) => setDraft(e.currentTarget.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && !e.shiftKey) {
								e.preventDefault();
								void submit();
							}
						}}
					/>
					</div>
					<button
						type="submit"
						class="btn primary"
						disabled={sending() || (!draft().trim() && !file())}
						aria-label="Verstuur bericht"
					>
						<Send size={14} aria-hidden="true" />
					</button>
				</form>
			</Show>
		</section>
	);
}

/**
 * A file in a message. Images show inline; other files as a chip that opens
 * them. The URL is fetched only when needed and only for readers of the chat.
 */
function Attachment(props: {
	messageId: string;
	attachment: { name: string; contentType: string };
	mine: boolean;
}) {
	const isImage = () => props.attachment.contentType.startsWith("image/");
	const image = createLoad(
		() => isImage() && props.messageId,
		(messageId, signal) => client.chat.attachmentUrl({ messageId }, { signal }),
	);

	const open = async () => {
		try {
			const { url, name } = await client.chat.attachmentUrl({ messageId: props.messageId });
			const a = document.createElement("a");
			a.href = url;
			a.download = name;
			a.target = "_blank";
			a.rel = "noopener";
			a.click();
		} catch (err) {
			toast({ title: "Bestand openen lukte niet", description: friendlyError(err), tone: "danger" });
		}
	};

	return (
		<Show
			when={isImage() && image.data()}
			fallback={
				<button
					type="button"
					onClick={() => void open()}
					style={{
						display: "flex",
						"align-items": "center",
						gap: "8px",
						"margin-top": "6px",
						padding: "8px 10px",
						"border-radius": "10px",
						background: props.mine ? "rgb(255 255 255 / 0.15)" : "rgb(var(--bg-2))",
						color: "inherit",
						"font-size": "0.8125rem",
						"text-align": "left",
					}}
					aria-label={`${props.attachment.name} openen`}
				>
					<FileText size={16} aria-hidden="true" />
					<span class="truncate" style={{ "max-width": "16rem" }}>
						{props.attachment.name}
					</span>
					<Download size={14} aria-hidden="true" />
				</button>
			}
		>
			<button
				type="button"
				onClick={() => void open()}
				aria-label={`${props.attachment.name} openen`}
				style={{ display: "block", "margin-top": "6px" }}
			>
				<img
					src={image.data()?.url}
					alt={props.attachment.name}
					style={{ "max-width": "240px", "max-height": "240px", "border-radius": "10px" }}
				/>
			</button>
		</Show>
	);
}
