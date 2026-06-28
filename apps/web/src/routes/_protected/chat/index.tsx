import { createFileRoute } from "@tanstack/solid-router";
import { ChatPanel } from "../../../components/chat/chat-panel";

/**
 * Chat (#5 1:1 coach–leerling, #6 group/forum met coach-supervisie). The page
 * is a thin wrapper around <ChatPanel/>, which owns the list/thread/composer and
 * the realtime SSE wiring. Available to any authenticated user; the server
 * tenant- and membership-scopes every conversation.
 *
 * Deep-link (#42 snelactie): `?conversationId=` preselects that thread; if it is
 * absent but `?otherUserId=` is given, the panel calls `chat.ensureDirect` and
 * selects the resulting 1:1 conversation.
 */
type ChatSearch = {
  conversationId?: string;
  otherUserId?: string;
};

export const Route = createFileRoute("/_protected/chat/")({
  validateSearch: (search: Record<string, unknown>): ChatSearch => ({
    conversationId:
      typeof search.conversationId === "string"
        ? search.conversationId
        : undefined,
    otherUserId:
      typeof search.otherUserId === "string" ? search.otherUserId : undefined,
  }),
  component: ChatPage,
});

function ChatPage() {
  const search = Route.useSearch();
  return (
    <ChatPanel
      conversationId={search().conversationId}
      otherUserId={search().otherUserId}
    />
  );
}
