import { useMutation, useQuery, useQueryClient } from "@tanstack/solid-query";
import { createEffect, createMemo, createSignal, For, on, Show } from "solid-js";
import { Avatar } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { toast } from "../ui/toast";
import { orpc } from "../../lib/orpc";
import { useMe } from "../../lib/auth/use-me";
import { useServerEvent } from "../../lib/sse/use-events";

/**
 * Chat (#5 1:1 coach–leerling, #6 group/forum met coach-supervisie). Two-pane
 * layout: a conversation list on the left, the active thread + composer on the
 * right. Realtime via the `chat.message` SSE event — new messages append live.
 *
 * Role-aware: a coach may start a chat with each assigned leerling and may read
 * along in supervised group chats. Supervised group chats show a clear
 * "coach kan meekijken" indicator (transparantie / AVG).
 */

type Conversation = {
  id: string;
  kind: "direct" | "forum";
  displayName: string;
  subtitle: string | null;
  memberRole: "member" | "supervisor" | "coach";
  supervised: boolean;
  lastMessageBody: string | null;
};

function formatTime(d: Date): string {
  return d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
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
  // Track which deep-link we've already handled, so re-renders don't re-trigger.
  let handledDeepLink: string | null = null;

  const conversationsQuery = useQuery(() => orpc.chat.list.queryOptions());
  const partnersQuery = useQuery(() => orpc.chat.partners.queryOptions());

  const conversations = createMemo(() => conversationsQuery.data ?? []);
  const active = createMemo(() => conversations().find((c) => c.id === activeId()) ?? null);

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
    const existingDirectNames = new Set(
      conversations()
        .filter((c) => c.kind === "direct")
        .map((c) => c.displayName),
    );
    return (partnersQuery.data ?? []).filter((p) => !existingDirectNames.has(p.name));
  });

  return (
    <div class="grid h-[calc(100vh-12rem)] grid-cols-1 overflow-hidden rounded-3 border border-line bg-surface md:grid-cols-[20rem_1fr]">
      {/* Conversation list */}
      <aside class="flex min-h-0 flex-col border-line border-r">
        <div class="border-line border-b px-4 py-4">
          <h2 class="font-head text-h3 text-ink">Chat</h2>
          <p class="mt-1 text-micro text-muted">
            {me.is("coach")
              ? "Gesprekken met je leerlingen en groepschats"
              : "Gesprekken met je coach en klasgenoten"}
          </p>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto">
          <Show when={conversationsQuery.isLoading}>
            <p class="px-4 py-3 text-muted text-small">Laden…</p>
          </Show>

          <Show
            when={conversations().length > 0}
            fallback={
              <Show when={!conversationsQuery.isLoading}>
                <p class="px-4 py-3 text-muted text-small">Nog geen gesprekken.</p>
              </Show>
            }
          >
            <ul>
              <For each={conversations()}>
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
            <div class="border-line border-t px-4 py-3">
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
                        <Avatar
                          name={p.name}
                          size="sm"
                          tone={p.role === "leerling" ? "leerling" : "coach"}
                        />
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
        fallback={<div class="grid place-items-center p-8 text-muted">Selecteer een gesprek</div>}
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
  const tone = () => (c().kind === "forum" ? "coach" : "leerling");
  return (
    <button
      type="button"
      onClick={props.onSelect}
      aria-current={props.active ? "true" : undefined}
      class="flex w-full items-start gap-3 border-primary border-l-[3px] px-4 py-3 text-left hover:bg-bg-2 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
      classList={{
        "bg-primary-50 border-l-primary": props.active,
        "border-l-transparent": !props.active,
      }}
    >
      <Avatar name={c().displayName} size="md" tone={tone()} />
      <div class="min-w-0 flex-1">
        <p class="truncate font-medium text-body text-ink">{c().displayName}</p>
        <Show when={c().lastMessageBody}>
          <p class="truncate text-small text-muted">{c().lastMessageBody}</p>
        </Show>
        <Show when={c().supervised}>
          <span class="mt-1 inline-flex">
            <Badge variant="warning" class="gap-1 text-micro">
              Coach kijkt mee
            </Badge>
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

  const messagesQuery = useQuery(() => ({
    ...orpc.chat.messages.queryOptions({
      input: { conversationId: conversationId() },
    }),
  }));

  const messages = createMemo(() => messagesQuery.data?.messages ?? []);

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
    if (!body) return;
    send.mutate({ conversationId: conversationId(), body });
  };

  return (
    <section class="flex min-h-0 flex-col">
      {/* Header */}
      <header class="flex items-center gap-3 border-line border-b px-5 py-4">
        <Avatar
          name={props.conversation.displayName}
          size="md"
          tone={props.conversation.kind === "forum" ? "coach" : "leerling"}
        />
        <div class="min-w-0">
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
          class="flex items-center gap-2 bg-warning-100 px-5 py-2.5 text-small text-warning"
        >
          <span aria-hidden="true">👁</span>
          <span>Dit is een groepschat van een opdracht. Je coach kan meelezen.</span>
        </div>
      </Show>

      {/* Messages */}
      <div
        ref={scrollEl}
        class="min-h-0 flex-1 overflow-y-auto bg-bg px-6 py-5"
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
          <ul class="flex flex-col gap-2.5">
            <For each={messages()}>
              {(m) => {
                const mine = () => m.senderId === me.user()?.id;
                return (
                  <li
                    class="max-w-[72%]"
                    classList={{
                      "self-end": mine(),
                      "self-start": !mine(),
                    }}
                  >
                    <Show when={!mine()}>
                      <p class="mb-0.5 px-1 text-micro text-muted">{m.senderName}</p>
                    </Show>
                    <div
                      class="rounded-3 px-3.5 py-2.5 text-body leading-snug"
                      classList={{
                        "bg-primary text-primary-fg": mine(),
                        "border border-line bg-surface text-ink": !mine(),
                      }}
                    >
                      {m.body}
                    </div>
                    <p
                      class="mt-1 px-1 text-micro text-muted"
                      classList={{
                        "text-right": mine(),
                        "text-left": !mine(),
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
          <div class="border-line border-t px-5 py-4 text-muted text-small">
            Je kijkt mee als coach en kunt in deze groepschat niet meeschrijven.
          </div>
        }
      >
        <form
          class="flex items-end gap-2 border-line border-t px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label class="sr-only" for="chat-composer">
            Schrijf een bericht
          </label>
          <textarea
            id="chat-composer"
            class="min-h-[2.75rem] flex-1 resize-none rounded-2 border border-line bg-surface px-ctl-x py-ctl-y text-body text-ink placeholder:text-muted-2 focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
          <Button type="submit" disabled={send.isPending || !draft().trim()}>
            Verstuur
          </Button>
        </form>
      </Show>
    </section>
  );
}
