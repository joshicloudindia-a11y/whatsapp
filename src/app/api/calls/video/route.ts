import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { sendTextMessage } from "@/lib/whatsapp";
import { emitMessageSent } from "@/lib/outgoing-webhooks";
import { pusherServer, PUSHER_EVENTS, conversationChannel, orgChannel } from "@/lib/pusher";
import { createCallMessage, localCallId } from "@/lib/calling";
import { contactGuard, jsonError, loadConversation, windowIsOpen } from "@/lib/calling-access";

export const dynamic = "force-dynamic";

function parseMeetingUrl(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 500) return null;
  try {
    const u = new URL(v.trim());
    if (u.protocol !== "https:" || !u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * POST /api/calls/video { conversationId, url, text? }
 * Sends the customer a video meeting link as a WhatsApp text (24 h window only) and logs a call with via "video_link".
 */
export async function POST(req: NextRequest) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  const body = (await req.json().catch(() => null)) ?? {};

  const loaded = await loadConversation(member.organizationId, body.conversationId);
  if (!loaded.conversation) return loaded.response;
  const conv = loaded.conversation;
  const blocked = contactGuard(conv);
  if (blocked) return blocked;
  if (!windowIsOpen(conv)) {
    return jsonError("The 24-hour reply window has closed. Send an approved template first, then share the meeting link.", 400, { code: "WINDOW_CLOSED" });
  }

  const url = parseMeetingUrl(body.url);
  if (!url) return jsonError("A valid https:// meeting link is required");
  const intro = typeof body.text === "string" && body.text.trim() ? body.text.trim().slice(0, 600) : "Let's continue on a video call. Join here:";
  const text = intro.includes(url) ? intro : `${intro}\n${url}`;

  let wamid: string | undefined;
  try {
    const res = await sendTextMessage({ to: conv.contact.phone, text, accessToken: conv.whatsappAccount.accessToken, phoneNumberId: conv.whatsappAccount.phoneNumberId });
    wamid = res.messages?.[0]?.id;
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Couldn't send the meeting link", 502);
  }

  const message = await prisma.message.create({
    data: {
      conversationId: conv.id, organizationId: member.organizationId, wamid,
      direction: "OUTBOUND", type: "TEXT", status: "SENT", content: text, sentByUserId: member.userId,
    },
    include: { sentByUser: { select: { id: true, name: true, avatar: true } } },
  });
  await prisma.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: new Date(), isRead: true } });
  await prisma.usageLog.create({ data: { organizationId: member.organizationId, type: "MESSAGE_SENT" } }).catch(() => undefined);
  await pusherServer.trigger(conversationChannel(conv.id), PUSHER_EVENTS.NEW_MESSAGE, { message });
  await pusherServer.trigger(orgChannel(member.organizationId), PUSHER_EVENTS.CONVERSATION_UPDATED, { conversationId: conv.id });
  after(() => emitMessageSent(message.id));

  const now = new Date().toISOString();
  const log = await createCallMessage({
    organizationId: member.organizationId,
    conversationId: conv.id,
    sentByUserId: member.userId,
    call: { id: localCallId("vid"), direction: "outbound", status: "ended", via: "video_link", startedAt: now, url, startedByUserId: member.userId },
  });
  return NextResponse.json({ message, log, url });
}
