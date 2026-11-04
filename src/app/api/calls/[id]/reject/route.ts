import { NextRequest, NextResponse } from "next/server";
import { requireOrgMember } from "@/lib/org-auth";
import { callAction, publicCall, updateCallMessage } from "@/lib/calling";
import { errorResponse, jsonError, loadCallMessage } from "@/lib/calling-access";

export const dynamic = "force-dynamic";

/** POST /api/calls/{messageId}/reject → declines a ringing user-initiated call (action "reject"). */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  const { id } = await params;

  const loaded = await loadCallMessage(member.organizationId, id);
  if (!loaded.call) return loaded.response;
  const { call, message } = loaded;
  if (call.via !== "whatsapp" || call.direction !== "inbound") return jsonError("Only incoming WhatsApp calls can be declined");
  if (call.status !== "ringing") return jsonError(`This call is no longer ringing (${call.status}).`, 409, { call: publicCall(call) });

  try {
    await callAction(message.conversation.whatsappAccount, call.id, "reject");
  } catch (e) {
    return errorResponse(e, "Couldn't decline the call");
  }
  const updated = await updateCallMessage(id, { status: "rejected", endedAt: new Date().toISOString(), durationSec: 0 });
  return NextResponse.json({ ok: true, call: updated ? publicCall(updated.call) : null });
}
