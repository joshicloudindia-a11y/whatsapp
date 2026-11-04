import { NextRequest, NextResponse } from "next/server";
import { requireOrgMember } from "@/lib/org-auth";
import { publicCall } from "@/lib/calling";
import { loadCallMessage } from "@/lib/calling-access";

export const dynamic = "force-dynamic";

/**
 * GET /api/calls/{messageId} → live state of one call for the browser that owns it.
 * Includes the SDP answer (business-initiated) once Meta's `connect` webhook delivered it.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  const { id } = await params;
  const loaded = await loadCallMessage(member.organizationId, id);
  if (!loaded.call) return loaded.response;
  const { call, message } = loaded;
  return NextResponse.json(
    {
      messageId: message.id,
      conversationId: message.conversationId,
      call: publicCall(call),
      // Only the agent who placed the call needs the answer SDP.
      answerSdp: call.direction === "outbound" && call.startedByUserId === member.userId ? call.answerSdp ?? null : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
