import { NextResponse, after } from "next/server";
import type { Prisma, MessageType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { emitMessageSent } from "@/lib/outgoing-webhooks";
import { pusherServer, PUSHER_EVENTS, conversationChannel, orgChannel } from "@/lib/pusher";
import { messagePreview, type ReplyContext } from "@/components/inbox/message-extras";

/** [chat] Shared outbound plumbing for the inbox send routes (messages, forward, reactions). */

export const sentByUserSelect = { id: true, name: true, avatar: true } as const;

export function loadConversation(id: string, organizationId: string) {
  return prisma.conversation.findFirst({
    where: { id, organizationId },
    include: { contact: true, whatsappAccount: true },
  });
}
export type LoadedConversation = NonNullable<Awaited<ReturnType<typeof loadConversation>>>;

export const bad = (error: string, status = 400, code?: string) => NextResponse.json({ error, ...(code && { code }) }, { status });

export const isWindowOpen = (c: { sessionExpiresAt: Date | null }) => !!c.sessionExpiresAt && c.sessionExpiresAt > new Date();

/**
 * Compliance checks every outbound send must pass. Returns an error response or null.
 * `freeForm` = anything except an approved template (needs the 24h customer-service window).
 */
export function guardSend(c: LoadedConversation, freeForm: boolean): NextResponse | null {
  if (!c.whatsappAccount.isActive) return bad("This WhatsApp number is disabled. Enable it in Settings → WhatsApp.", 400, "ACCOUNT_DISABLED");
  // [compliance] Contact replied STOP – nothing may be sent until they reply START.
  if (c.contact.optedOut) return bad("This contact unsubscribed (STOP). They must message START to receive messages again.", 400, "OPTED_OUT");
  if (c.contact.isBlocked) return bad("This contact is blocked. Unblock them from the chat menu to send messages.", 400, "BLOCKED");
  if (freeForm && !isWindowOpen(c)) {
    return bad("The 24-hour reply window has closed. Send an approved template to restart the conversation.", 400, "WINDOW_CLOSED");
  }
  return null;
}

/** Resolves a reply target (must be in the same conversation and have a wamid). */
export async function resolveReplyContext(conversationId: string, organizationId: string, replyToId: unknown): Promise<ReplyContext | null | "invalid"> {
  if (replyToId == null || replyToId === "") return null;
  if (typeof replyToId !== "string" || replyToId.length > 64) return "invalid";
  const target = await prisma.message.findFirst({
    where: { id: replyToId, conversationId, organizationId },
    select: { id: true, wamid: true, type: true, direction: true, content: true, mediaCaption: true, templateName: true, interactive: true },
  });
  if (!target?.wamid) return "invalid";
  return { wamid: target.wamid, messageId: target.id, preview: messagePreview(target), type: target.type, direction: target.direction };
}

/**
 * Stores a sent outbound message and runs the standard side effects: conversation
 * lastMessageAt/isRead/reopen/auto-assign, Pusher events, usage log and the [webhooks] emit.
 */
export async function storeOutbound(c: LoadedConversation, userId: string, data: {
  wamid?: string; type: MessageType; content?: string | null; mediaUrl?: string | null; mediaType?: string | null;
  mediaCaption?: string | null; templateName?: string | null; interactive?: Prisma.InputJsonValue;
}) {
  const message = await prisma.message.create({
    data: {
      conversationId: c.id,
      organizationId: c.organizationId,
      direction: "OUTBOUND",
      status: "SENT",
      sentByUserId: userId,
      ...data,
    },
    include: { sentByUser: { select: sentByUserSelect } },
  });

  await prisma.conversation.update({
    where: { id: c.id },
    data: {
      lastMessageAt: new Date(),
      isRead: true,
      // Replying re-opens a resolved chat and claims it if nobody owns it yet.
      ...(c.status !== "OPEN" && { status: "OPEN" }),
      ...(!c.assignedAgentId && { assignedAgentId: userId }),
    },
  });

  await pusherServer.trigger(conversationChannel(c.id), PUSHER_EVENTS.NEW_MESSAGE, { message });
  await pusherServer.trigger(orgChannel(c.organizationId), PUSHER_EVENTS.CONVERSATION_UPDATED, { conversationId: c.id });
  await prisma.usageLog.create({ data: { organizationId: c.organizationId, type: "MESSAGE_SENT" } }).catch(() => undefined);
  after(() => emitMessageSent(message.id)); // [webhooks]
  return message;
}

/** Notifies open inboxes that a message's extras (reactions/stars/…) changed. */
export async function notifyMessageChanged(conversationId: string, messageId: string) {
  await pusherServer.trigger(conversationChannel(conversationId), PUSHER_EVENTS.MESSAGE_STATUS_UPDATE, { messageId });
}

export const errMessage = (e: unknown, fallback = "Failed to send") => (e instanceof Error ? e.message : fallback);
