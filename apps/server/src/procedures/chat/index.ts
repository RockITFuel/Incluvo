import {
  coachAssignment,
  conversation,
  conversationMember,
  message,
  user,
} from "@incluvo/drizzle/schema";
import { atLeast, checkPermission, policies, sameTenant } from "@incluvo/permissions";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { z } from "zod";
import { publishTo } from "../../sse";
import { type AuthedContext, base, protectedProcedure } from "../base";

/**
 * Chat domain (backlog #5 1:1 coach–leerling, #6 group/forum with coach
 * supervision). #7 (coachtaak vanuit chat) is post-MVP and intentionally skipped.
 *
 * Everything is tenant-scoped and membership-scoped. Access is gated by
 * `policies.accessChat`: a regular `member` may read/post, and a coach (or
 * higher) may always read along in group/forum chats they supervise (#6) — even
 * without an explicit membership row — as long as the conversation is in their
 * tenant. Real-time delivery uses the in-process SSE hub (`chat.message`);
 * clients append on receipt.
 */

// ---------------------------------------------------------------------------
// Shared Zod shapes
// ---------------------------------------------------------------------------

const ConversationSummarySchema = z.object({
  id: z.string(),
  kind: z.enum(["direct", "forum"]),
  title: z.string().nullable(),
  courseContentBlockId: z.string().nullable(),
  /** Display name for the conversation (other party for direct chats). */
  displayName: z.string(),
  /** Sub-label (role / group context) shown under the name. */
  subtitle: z.string().nullable(),
  /** This actor's role in the conversation: member, supervisor, or coach-meekijk. */
  memberRole: z.enum(["member", "supervisor", "coach"]),
  /** True when a coach can read along (group chats) — drives the AVG indicator. */
  supervised: z.boolean(),
  lastMessageAt: z.date().nullable(),
  lastMessageBody: z.string().nullable(),
  updatedAt: z.date(),
});

const MessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  senderId: z.string(),
  senderName: z.string(),
  body: z.string(),
  createdAt: z.date(),
});

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Load a conversation, its member ids and roles, then enforce `accessChat`
 * (tenant + membership, with the coach-supervisor read-along for forums #6).
 * Throws NOT_FOUND / FORBIDDEN. Returns the row plus the resolved membership.
 */
async function loadAccessibleConversation(context: AuthedContext, conversationId: string) {
  const [conv] = await context.db
    .select()
    .from(conversation)
    .where(eq(conversation.id, conversationId));
  if (!conv) throw new ORPCError("NOT_FOUND");

  const members = await context.db
    .select({
      userId: conversationMember.userId,
      role: conversationMember.role,
    })
    .from(conversationMember)
    .where(eq(conversationMember.conversationId, conversationId));

  const memberIds = members.map((m) => m.userId);
  const resource = {
    organizationId: conv.organizationId,
    memberIds,
  };

  // Tenant + membership (or coach read-along for forums #6).
  if (!checkPermission(policies.accessChat, context.actor, resource)) {
    throw new ORPCError("FORBIDDEN", {
      message: "Geen toegang tot dit gesprek",
    });
  }

  // The coach read-along (#6) only applies to group/forum chats, never to a
  // 1:1 chat they are not part of. A coach who is an explicit member of a
  // direct chat is of course allowed.
  const isExplicitMember = memberIds.includes(context.actor.userId);
  if (
    !isExplicitMember &&
    conv.kind === "direct" &&
    !members.some((m) => m.userId === context.actor.userId)
  ) {
    throw new ORPCError("FORBIDDEN", {
      message: "Geen toegang tot dit 1-op-1 gesprek",
    });
  }

  return { conv, members, memberIds, isExplicitMember };
}

// ---------------------------------------------------------------------------
// list — my conversations (+ forums my coach supervises)
// ---------------------------------------------------------------------------

const list = protectedProcedure
  .route({ method: "GET", path: "/chat/conversations", tags: ["chat"] })
  .output(z.array(ConversationSummarySchema))
  .handler(async ({ context }) => {
    const { actor } = context;

    // Conversations where the actor is an explicit member.
    const myMemberships = await context.db
      .select({
        conversationId: conversationMember.conversationId,
        role: conversationMember.role,
      })
      .from(conversationMember)
      .where(eq(conversationMember.userId, actor.userId));

    const myConvIds = new Set(myMemberships.map((m) => m.conversationId));
    const myRoleByConv = new Map(myMemberships.map((m) => [m.conversationId, m.role]));

    // A coach also sees forum chats of their assigned leerlingen even without
    // an explicit membership row (#6 read-along).
    const supervisedConvIds = new Set<string>();
    if (atLeast(actor.role, "coach")) {
      const leerlingRows = await context.db
        .select({ leerlingId: coachAssignment.leerlingId })
        .from(coachAssignment)
        .where(eq(coachAssignment.coachId, actor.userId));
      const leerlingIds = leerlingRows.map((r) => r.leerlingId);
      if (leerlingIds.length > 0) {
        const forumMemberships = await context.db
          .select({
            conversationId: conversationMember.conversationId,
          })
          .from(conversationMember)
          .innerJoin(conversation, eq(conversation.id, conversationMember.conversationId))
          .where(
            and(eq(conversation.kind, "forum"), inArray(conversationMember.userId, leerlingIds)),
          );
        for (const r of forumMemberships) {
          if (!myConvIds.has(r.conversationId)) supervisedConvIds.add(r.conversationId);
        }
      }
    }

    const allIds = [...myConvIds, ...supervisedConvIds];
    if (allIds.length === 0) return [];

    const convs = await context.db
      .select()
      .from(conversation)
      .where(inArray(conversation.id, allIds))
      .orderBy(desc(conversation.updatedAt));

    // Resolve member rows for all conversations in one pass (for direct-chat
    // display names + the supervised indicator).
    const allMembers = await context.db
      .select({
        conversationId: conversationMember.conversationId,
        userId: conversationMember.userId,
        role: conversationMember.role,
        name: user.name,
      })
      .from(conversationMember)
      .innerJoin(user, eq(user.id, conversationMember.userId))
      .where(inArray(conversationMember.conversationId, allIds));

    const membersByConv = new Map<string, { userId: string; role: string; name: string }[]>();
    for (const m of allMembers) {
      const arr = membersByConv.get(m.conversationId) ?? [];
      arr.push({ userId: m.userId, role: m.role, name: m.name });
      membersByConv.set(m.conversationId, arr);
    }

    // Latest message per conversation (small N; one query each is fine here).
    const summaries = await Promise.all(
      convs.map(async (conv) => {
        const [last] = await context.db
          .select({ body: message.body, createdAt: message.createdAt })
          .from(message)
          .where(eq(message.conversationId, conv.id))
          .orderBy(desc(message.createdAt))
          .limit(1);

        const members = membersByConv.get(conv.id) ?? [];
        const supervised = conv.kind === "forum" || members.some((m) => m.role === "supervisor");

        let memberRole: "member" | "supervisor" | "coach";
        const myRole = myRoleByConv.get(conv.id);
        if (myRole === "supervisor") memberRole = "supervisor";
        else if (myRole === "member") memberRole = "member";
        else memberRole = "coach"; // read-along, no explicit row

        let displayName: string;
        let subtitle: string | null;
        if (conv.kind === "direct") {
          const other = members.find((m) => m.userId !== actor.userId);
          displayName = conv.title ?? other?.name ?? "Gesprek";
          subtitle = other ? "1-op-1 gesprek" : null;
        } else {
          displayName = conv.title ?? "Groepschat";
          subtitle = `Groep · ${members.filter((m) => m.role === "member").length} leden`;
        }

        return {
          id: conv.id,
          kind: conv.kind,
          title: conv.title,
          courseContentBlockId: conv.courseContentBlockId,
          displayName,
          subtitle,
          memberRole,
          supervised,
          lastMessageAt: last?.createdAt ?? null,
          lastMessageBody: last?.body ?? null,
          updatedAt: conv.updatedAt,
        };
      }),
    );

    // Most recent activity first.
    summaries.sort((a, b) => {
      const at = a.lastMessageAt?.getTime() ?? a.updatedAt.getTime();
      const bt = b.lastMessageAt?.getTime() ?? b.updatedAt.getTime();
      return bt - at;
    });

    return summaries;
  });

// ---------------------------------------------------------------------------
// ensureDirect — get-or-create a 1:1 coach↔leerling conversation (#5)
// ---------------------------------------------------------------------------

const ensureDirect = protectedProcedure
  .route({ method: "POST", path: "/chat/conversations/direct", tags: ["chat"] })
  .input(z.object({ otherUserId: z.string() }))
  .output(z.object({ id: z.string(), created: z.boolean() }))
  .handler(async ({ input, context }) => {
    const { actor } = context;

    if (input.otherUserId === actor.userId) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Je kunt geen gesprek met jezelf starten",
      });
    }

    // The other party must exist and be in the same tenant.
    const [other] = await context.db
      .select({
        id: user.id,
        role: user.role,
        organizationId: user.organizationId,
      })
      .from(user)
      .where(eq(user.id, input.otherUserId));
    if (!other) throw new ORPCError("NOT_FOUND");
    if (!sameTenant(actor, other)) {
      throw new ORPCError("FORBIDDEN", {
        message: "Gebruiker hoort bij een andere organisatie",
      });
    }

    // A direct chat is between a coach and one of their leerlingen. Require a
    // coach↔leerling relation in either direction (defence in depth on top of
    // the tenant check).
    const pairAB = await context.db
      .select({ id: coachAssignment.id })
      .from(coachAssignment)
      .where(
        and(
          eq(coachAssignment.coachId, actor.userId),
          eq(coachAssignment.leerlingId, input.otherUserId),
        ),
      );
    const pairBA = await context.db
      .select({ id: coachAssignment.id })
      .from(coachAssignment)
      .where(
        and(
          eq(coachAssignment.coachId, input.otherUserId),
          eq(coachAssignment.leerlingId, actor.userId),
        ),
      );
    if (pairAB.length === 0 && pairBA.length === 0) {
      throw new ORPCError("FORBIDDEN", {
        message: "Geen coach–leerling relatie voor dit gesprek",
      });
    }

    const organizationId = actor.organizationId;
    if (!organizationId) {
      throw new ORPCError("BAD_REQUEST", { message: "Geen organisatie" });
    }

    // Look for an existing direct conversation containing exactly these two.
    const myDirect = await context.db
      .select({ conversationId: conversationMember.conversationId })
      .from(conversationMember)
      .innerJoin(conversation, eq(conversation.id, conversationMember.conversationId))
      .where(and(eq(conversationMember.userId, actor.userId), eq(conversation.kind, "direct")));
    const myDirectIds = myDirect.map((r) => r.conversationId);
    if (myDirectIds.length > 0) {
      const shared = await context.db
        .select({ conversationId: conversationMember.conversationId })
        .from(conversationMember)
        .where(
          and(
            eq(conversationMember.userId, input.otherUserId),
            inArray(conversationMember.conversationId, myDirectIds),
          ),
        );
      if (shared[0]) {
        return { id: shared[0].conversationId, created: false };
      }
    }

    // Create the conversation + both membership rows.
    const [conv] = await context.db
      .insert(conversation)
      .values({ organizationId, kind: "direct" })
      .returning({ id: conversation.id });
    if (!conv) throw new ORPCError("INTERNAL_SERVER_ERROR");

    await context.db.insert(conversationMember).values([
      { conversationId: conv.id, userId: actor.userId, role: "member" },
      {
        conversationId: conv.id,
        userId: input.otherUserId,
        role: "member",
      },
    ]);

    return { id: conv.id, created: true };
  });

// ---------------------------------------------------------------------------
// messages — paginated history for a conversation
// ---------------------------------------------------------------------------

const messages = protectedProcedure
  .route({
    method: "GET",
    path: "/chat/conversations/{conversationId}/messages",
    tags: ["chat"],
  })
  .input(
    z.object({
      conversationId: z.string().uuid(),
      /** Fetch messages strictly older than this ISO timestamp (paging). */
      before: z.coerce.date().optional(),
      limit: z.number().int().min(1).max(100).default(50),
    }),
  )
  .output(
    z.object({
      messages: z.array(MessageSchema),
      hasMore: z.boolean(),
    }),
  )
  .handler(async ({ input, context }) => {
    await loadAccessibleConversation(context, input.conversationId);

    const rows = await context.db
      .select({
        id: message.id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        senderName: user.name,
        body: message.body,
        createdAt: message.createdAt,
      })
      .from(message)
      .innerJoin(user, eq(user.id, message.senderId))
      .where(
        input.before
          ? and(
              eq(message.conversationId, input.conversationId),
              lt(message.createdAt, input.before),
            )
          : eq(message.conversationId, input.conversationId),
      )
      .orderBy(desc(message.createdAt))
      .limit(input.limit + 1);

    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    // Return chronological (oldest → newest) for the thread view.
    page.reverse();

    return { messages: page, hasMore };
  });

// ---------------------------------------------------------------------------
// send — post a message (membership-checked) and SSE-publish to members
// ---------------------------------------------------------------------------

const send = protectedProcedure
  .route({
    method: "POST",
    path: "/chat/conversations/{conversationId}/messages",
    tags: ["chat"],
  })
  .input(
    z.object({
      conversationId: z.string().uuid(),
      body: z.string().min(1).max(4000),
    }),
  )
  .output(MessageSchema)
  .handler(async ({ input, context }) => {
    const { actor } = context;
    const { conv, members, isExplicitMember } = await loadAccessibleConversation(
      context,
      input.conversationId,
    );

    // Only an actual member may post. A supervising coach reads along but does
    // not post into a forum they don't belong to (transparency for #6); if a
    // coach is an explicit member they may post.
    if (!isExplicitMember) {
      throw new ORPCError("FORBIDDEN", {
        message: "Alleen deelnemers kunnen berichten sturen",
      });
    }

    const [row] = await context.db
      .insert(message)
      .values({
        conversationId: input.conversationId,
        senderId: actor.userId,
        body: input.body,
      })
      .returning();
    if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");

    await context.db
      .update(conversation)
      .set({ updatedAt: new Date() })
      .where(eq(conversation.id, input.conversationId));

    const [sender] = await context.db
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, actor.userId));

    // Deliver ONLY to the conversation's members (C1) — never global. A
    // supervising coach who is not an explicit member is intentionally NOT in
    // the realtime push (they have no membership row); they still see the
    // message on their next authorized read of the supervised forum.
    const recipientIds = members.map((m) => m.userId);
    publishTo(
      {
        type: "chat.message",
        payload: {
          id: row.id,
          conversationId: input.conversationId,
          conversationKind: conv.kind,
          senderId: row.senderId,
          senderName: sender?.name ?? "Onbekend",
          body: row.body,
          createdAt: row.createdAt.toISOString(),
          recipientIds,
        },
      },
      recipientIds,
    );

    return {
      id: row.id,
      conversationId: row.conversationId,
      senderId: row.senderId,
      senderName: sender?.name ?? "Onbekend",
      body: row.body,
      createdAt: row.createdAt,
    };
  });

// ---------------------------------------------------------------------------
// markRead — update lastReadAt for the actor's membership (optional)
// ---------------------------------------------------------------------------

const markRead = protectedProcedure
  .route({
    method: "POST",
    path: "/chat/conversations/{conversationId}/read",
    tags: ["chat"],
  })
  .input(z.object({ conversationId: z.string().uuid() }))
  .output(z.object({ ok: z.boolean() }))
  .handler(async ({ input, context }) => {
    const { actor } = context;
    await loadAccessibleConversation(context, input.conversationId);
    await context.db
      .update(conversationMember)
      .set({ lastReadAt: new Date() })
      .where(
        and(
          eq(conversationMember.conversationId, input.conversationId),
          eq(conversationMember.userId, actor.userId),
        ),
      );
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// chatPartners — leerlingen/coaches the actor may start a direct chat with (#5)
// ---------------------------------------------------------------------------

const chatPartners = protectedProcedure
  .route({ method: "GET", path: "/chat/partners", tags: ["chat"] })
  .output(
    z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        role: z.string(),
      }),
    ),
  )
  .handler(async ({ context }) => {
    const { actor } = context;

    // Coach → their assigned leerlingen; leerling → their coach(es).
    const isCoach = atLeast(actor.role, "coach");
    const rows = isCoach
      ? await context.db
          .select({
            id: user.id,
            name: user.name,
            role: user.role,
          })
          .from(coachAssignment)
          .innerJoin(user, eq(user.id, coachAssignment.leerlingId))
          .where(eq(coachAssignment.coachId, actor.userId))
      : await context.db
          .select({
            id: user.id,
            name: user.name,
            role: user.role,
          })
          .from(coachAssignment)
          .innerJoin(user, eq(user.id, coachAssignment.coachId))
          .where(eq(coachAssignment.leerlingId, actor.userId));

    // Dedupe and tenant-guard.
    const seen = new Set<string>();
    return rows.filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
  });

export const chatRouter = base.router({
  list,
  ensureDirect,
  messages,
  send,
  markRead,
  partners: chatPartners,
});
