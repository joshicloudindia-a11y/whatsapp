import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { getCallingStatus, sendCallPermissionRequest } from "@/lib/calling";
import { pusherServer, PUSHER_EVENTS, conversationChannel, orgChannel } from "@/lib/pusher";
import { contactGuard, errorResponse, jsonError, loadConversation, windowIsOpen } from "@/lib/calling-access";

export const dynamic = "force-dynamic";

const DEFAULT_TEXT = "We'd like to call you on WhatsApp to help with your request. Is that okay?";

/**
 * POST /api/calls/permission { conversationId, text? }
 * Sends the free-form interactive `call_permission_request` (only inside the 24 h window).
 * The customer's answer arrives as an inbound interactive message (type call_permission_reply).
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
    return jsonError("The 24-hour window is closed. Outside it, call permission must be requested with an approved call_permission_request template.", 400, { code: "WINDOW_CLOSED" });
  }

  const status = await getCallingStatus(conv.whatsappAccount);
  if (!status.enabled) return jsonError(`WhatsApp calling isn't enabled for this number. ${status.reason ?? ""}`.trim(), 400, { code: status.code ?? "CALLING_DISABLED", docsUrl: status.docsUrl });

  const text = typeof body.text === "string" && body.text.trim() ? body.text.trim().slice(0, 1024) : DEFAULT_TEXT;
  try {
    const res = await sendCallPermissionRequest(conv.whatsappAccount, conv.contact.phone, text);
    const message = await prisma.message.create({
      data: {
        conversationId: conv.id,
        organizationId: member.organizationId,
        wamid: res?.messages?.[0]?.id,
        direction: "OUTBOUND",
        type: "INTERACTIVE",
        status: "SENT",
        content: `${text}\n\n[Call permission request]`,
        interactive: { type: "call_permission_request" },
        sentByUserId: member.userId,
      },
      include: { sentByUser: { select: { id: true, name: true, avatar: true } } },
    });
    await prisma.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: new Date(), isRead: true } });
    await prisma.usageLog.create({ data: { organizationId: member.organizationId, type: "MESSAGE_SENT" } }).catch(() => undefined);
    await pusherServer.trigger(conversationChannel(conv.id), PUSHER_EVENTS.NEW_MESSAGE, { message });
    await pusherServer.trigger(orgChannel(member.organizationId), PUSHER_EVENTS.CONVERSATION_UPDATED, { conversationId: conv.id });
    return NextResponse.json({ message });
  } catch (e) {
    return errorResponse(e, "Couldn't send the call permission request");
  }
}
