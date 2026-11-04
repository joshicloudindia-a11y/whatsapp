import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { sendRichMessage } from "@/lib/whatsapp";
import { createCallMessage, localCallId } from "@/lib/calling";
import { bad, errMessage, guardSend, loadConversation, storeOutbound } from "@/app/api/conversations/[id]/_lib/outbound";
import { agentUrl, guestUrl, isRoomLive, isValidCode, noStore } from "@/lib/meetings";

export const dynamic = "force-dynamic";

/**
 * POST /api/meetings/{code}/send-link { conversationId?, text? } (org member)
 * Sends the guest link to the conversation's customer as a WhatsApp text through the standard outbound pipeline
 * (24 h window, opted-out, blocked and account checks; stored Message + events), then logs a call bubble
 * (SYSTEM Message, templateData.call.via = "video_link"). Window closed → 400 { code: "WINDOW_CLOSED", guestUrl }.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  const { code } = await params;
  if (!isValidCode(code)) return bad("Meeting not found", 404, "NOT_FOUND");
  const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;

  const room = await prisma.meetingRoom.findFirst({ where: { code, organizationId: member.organizationId } });
  if (!room) return bad("Meeting not found", 404, "NOT_FOUND");
  if (!isRoomLive(room)) return bad("This meeting has ended. Start a new one.", 410, "ENDED");

  const conversationId = room.conversationId ?? (typeof body.conversationId === "string" && body.conversationId.length <= 64 ? body.conversationId : null);
  if (!conversationId) return bad("This meeting isn't linked to a conversation");
  const conversation = await loadConversation(conversationId, member.organizationId);
  if (!conversation) return bad("Conversation not found", 404);

  const link = guestUrl(room, req.nextUrl.origin);
  const blocked = guardSend(conversation, true);
  if (blocked) {
    // Let the UI fall back to "copy link" with the link at hand.
    const data = await blocked.json();
    return NextResponse.json({ ...data, guestUrl: link }, { status: blocked.status, headers: noStore });
  }

  const intro = typeof body.text === "string" && body.text.trim() ? body.text.trim().slice(0, 600) : "Join our video call here (opens in your browser, no app needed):";
  const text = `${intro}\n${link}`;

  try {
    const { whatsappAccount, contact } = conversation;
    const res = await sendRichMessage({
      to: contact.phone, accessToken: whatsappAccount.accessToken, phoneNumberId: whatsappAccount.phoneNumberId,
      type: "text", content: { preview_url: true, body: text },
    });
    const message = await storeOutbound(conversation, member.userId, { wamid: res.messages?.[0]?.id, type: "TEXT", content: text });

    // Call-log bubble in the thread; its link opens the agent room (the guest link is in the text above).
    const log = await createCallMessage({
      organizationId: member.organizationId,
      conversationId: conversation.id,
      sentByUserId: member.userId,
      call: {
        id: localCallId("vid"), direction: "outbound", status: "ended", via: "video_link",
        startedAt: new Date().toISOString(), url: agentUrl(room, req.nextUrl.origin), startedByUserId: member.userId,
      },
    }).catch((e) => {
      console.warn("[meetings] call log failed:", errMessage(e));
      return null;
    });
    return NextResponse.json({ message, log, guestUrl: link }, { headers: noStore });
  } catch (e) {
    console.error("[meetings] send-link failed:", e);
    return bad(errMessage(e, "Couldn't send the meeting link"), 502, "SEND_FAILED");
  }
}
