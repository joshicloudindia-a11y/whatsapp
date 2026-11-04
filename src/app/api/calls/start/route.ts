import { NextRequest, NextResponse } from "next/server";
import { requireOrgMember } from "@/lib/org-auth";
import { createCallMessage, getCallingStatus, initiateCall } from "@/lib/calling";
import { contactGuard, errorResponse, jsonError, loadConversation, parseSdp } from "@/lib/calling-access";

export const dynamic = "force-dynamic";

/**
 * POST /api/calls/start { conversationId, sdp }
 * Business-initiated WhatsApp call: sends the browser's SDP offer with action "connect".
 * The SDP answer arrives later in the `calls` webhook; the browser polls GET /api/calls/{messageId} for it.
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

  const sdp = parseSdp(body.sdp);
  if (!sdp) return jsonError("A valid SDP offer with an audio track is required");

  const status = await getCallingStatus(conv.whatsappAccount);
  if (!status.enabled) {
    return jsonError(`WhatsApp calling isn't enabled for this number. ${status.reason ?? ""}`.trim(), 400, { code: status.code ?? "CALLING_DISABLED", docsUrl: status.docsUrl });
  }
  if (!status.businessInitiatedAllowed) {
    return jsonError("Business-initiated calls are restricted for this number by Meta.", 400, { code: "BUSINESS_INITIATED_RESTRICTED", restrictions: status.restrictions });
  }

  try {
    const waCallId = await initiateCall(conv.whatsappAccount, conv.contact.phone, sdp, `chatflow:${conv.id}`);
    const message = await createCallMessage({
      organizationId: member.organizationId,
      conversationId: conv.id,
      sentByUserId: member.userId,
      call: {
        id: waCallId,
        direction: "outbound",
        status: "ringing",
        via: "whatsapp",
        startedAt: new Date().toISOString(),
        startedByUserId: member.userId,
        offerSdp: sdp,
      },
    });
    return NextResponse.json({ messageId: message.id, callId: waCallId });
  } catch (e) {
    return errorResponse(e, "Couldn't start the call");
  }
}
