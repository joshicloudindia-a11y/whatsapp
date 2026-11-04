import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { readCall } from "@/lib/calling";

export const dynamic = "force-dynamic";

// Meta ends unanswered user-initiated calls after ~30–60 s.
const RING_WINDOW_MS = 75_000;

/**
 * GET /api/calls/pending → incoming WhatsApp calls in the org that are still ringing.
 * Polled by <IncomingCallListener> (every ~2 s when Pusher is off). Includes the SDP offer needed to answer.
 */
export async function GET() {
  const { member, response } = await requireOrgMember();
  if (!member) return response;

  const rows = await prisma.message.findMany({
    where: {
      organizationId: member.organizationId,
      type: "SYSTEM",
      direction: "INBOUND",
      createdAt: { gte: new Date(Date.now() - RING_WINDOW_MS) },
      templateData: { path: "$.call.status", equals: "ringing" },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { conversation: { select: { id: true, contact: { select: { id: true, name: true, phone: true } } } } },
  });

  const calls = rows.flatMap((m) => {
    const call = readCall(m.templateData);
    if (!call || call.status !== "ringing" || call.via !== "whatsapp" || !call.offerSdp) return [];
    return [{
      messageId: m.id,
      callId: call.id,
      conversationId: m.conversationId,
      contact: m.conversation.contact,
      startedAt: call.startedAt,
      offerSdp: call.offerSdp,
    }];
  });
  return NextResponse.json({ calls }, { headers: { "Cache-Control": "no-store" } });
}
