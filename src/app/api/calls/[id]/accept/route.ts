import { NextRequest, NextResponse } from "next/server";
import { requireOrgMember } from "@/lib/org-auth";
import { callAction, CallingError, publicCall, updateCallMessage } from "@/lib/calling";
import { contactGuard, errorResponse, jsonError, loadCallMessage, parseSdp } from "@/lib/calling-access";

export const dynamic = "force-dynamic";

/**
 * POST /api/calls/{messageId}/accept { sdp }
 * Answers a user-initiated call: pre_accept (early media setup) then accept, both with the browser's SDP answer.
 * The first agent to accept claims the call; others get 409.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) ?? {};

  const loaded = await loadCallMessage(member.organizationId, id);
  if (!loaded.call) return loaded.response;
  const { call, message } = loaded;
  const conv = message.conversation;
  if (call.via !== "whatsapp" || call.direction !== "inbound") return jsonError("Only incoming WhatsApp calls can be accepted");

  // Customers who called in themselves may be answered even if they opted out of marketing messages.
  const blocked = contactGuard(conv, { allowOptedOut: true });
  if (blocked) return blocked;

  const sdp = parseSdp(body.sdp);
  if (!sdp) return jsonError("A valid SDP answer with an audio track is required");

  // Claim the call atomically (row lock in updateCallMessage).
  let claimed = false;
  const claim = await updateCallMessage(id, (c) => {
    if (c.status !== "ringing" || c.acceptedByUserId) return null;
    claimed = true;
    return { acceptedByUserId: member.userId, answerSdp: sdp };
  });
  if (!claim) return jsonError("Call not found", 404);
  if (!claimed) {
    const c = claim.call;
    return jsonError(c.acceptedByUserId && c.acceptedByUserId !== member.userId ? "Another agent already answered this call." : `This call is no longer ringing (${c.status}).`, 409, { call: publicCall(c) });
  }

  try {
    await callAction(conv.whatsappAccount, call.id, "pre_accept", sdp);
    await callAction(conv.whatsappAccount, call.id, "accept", sdp);
  } catch (e) {
    // Release the claim so the call is shown as failed rather than stuck.
    await updateCallMessage(id, { status: "failed", endedAt: new Date().toISOString(), error: e instanceof Error ? e.message : "Accept failed" }).catch(() => undefined);
    return errorResponse(e instanceof CallingError ? e : new CallingError("Couldn't answer the call", 502));
  }

  const updated = await updateCallMessage(id, (c) => (c.status === "ringing" ? { status: "connected", connectedAt: new Date().toISOString() } : null));
  return NextResponse.json({ ok: true, call: updated ? publicCall(updated.call) : null });
}
