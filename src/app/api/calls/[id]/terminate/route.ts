import { NextRequest, NextResponse } from "next/server";
import { requireOrgMember } from "@/lib/org-auth";
import { callAction, CallingError, isFinalStatus, publicCall, updateCallMessage } from "@/lib/calling";
import { errorResponse, jsonError, loadCallMessage } from "@/lib/calling-access";

export const dynamic = "force-dynamic";

/**
 * POST /api/calls/{messageId}/terminate → hangs up (action "terminate").
 * Meta asks businesses to always send terminate, even after an RTCP BYE, so billing is accurate.
 * Also accepts navigator.sendBeacon() on tab close (no JSON body needed).
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  const { id } = await params;

  const loaded = await loadCallMessage(member.organizationId, id);
  if (!loaded.call) return loaded.response;
  const { call, message } = loaded;
  if (call.via !== "whatsapp") return jsonError("Only WhatsApp calls can be ended here");
  if (isFinalStatus(call.status)) return NextResponse.json({ ok: true, call: publicCall(call) });

  let metaError: string | null = null;
  try {
    await callAction(message.conversation.whatsappAccount, call.id, "terminate");
  } catch (e) {
    // Typical: the customer already hung up. We still close the call locally; the terminate webhook has the final word.
    metaError = e instanceof CallingError ? e.message : "Terminate failed";
    if (!(e instanceof CallingError)) return errorResponse(e);
  }

  const now = new Date().toISOString();
  const updated = await updateCallMessage(id, (c) => {
    if (isFinalStatus(c.status)) return null;
    if (c.status === "connected") {
      const durationSec = c.connectedAt ? Math.max(0, Math.round((Date.parse(now) - Date.parse(c.connectedAt)) / 1000)) : 0;
      return { status: "ended", endedAt: now, durationSec };
    }
    // Hung up before the customer answered.
    return { status: c.direction === "outbound" ? "missed" : "rejected", endedAt: now, durationSec: 0 };
  });
  return NextResponse.json({ ok: true, metaError, call: updated ? publicCall(updated.call) : null });
}
