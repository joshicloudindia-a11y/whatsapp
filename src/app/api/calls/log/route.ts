import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { createCallMessage, localCallId, publicCall, readCall } from "@/lib/calling";
import { contactGuard, jsonError, loadConversation } from "@/lib/calling-access";

export const dynamic = "force-dynamic";

/** GET /api/calls/log?conversationId=… → the conversation's call log (newest first, max 100). */
export async function GET(req: NextRequest) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  const loaded = await loadConversation(member.organizationId, req.nextUrl.searchParams.get("conversationId"));
  if (!loaded.conversation) return loaded.response;

  const rows = await prisma.message.findMany({
    where: { conversationId: loaded.conversation.id, organizationId: member.organizationId, type: "SYSTEM" },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { sentByUser: { select: { id: true, name: true } } },
  });
  const calls = rows
    .flatMap((m) => {
      const c = readCall(m.templateData);
      return c ? [{ messageId: m.id, createdAt: m.createdAt, content: m.content, sentByUser: m.sentByUser, call: publicCall(c) }] : [];
    })
    .slice(0, 100);
  return NextResponse.json({ calls });
}

/**
 * POST /api/calls/log { conversationId, via: "phone" }
 * Logs a "Call by phone" (tel: link opened on the agent's device). The outcome isn't known to us.
 */
export async function POST(req: NextRequest) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  const body = (await req.json().catch(() => null)) ?? {};
  if (body.via !== "phone") return jsonError("via must be \"phone\" (WhatsApp and video calls are logged by their own endpoints)");

  const loaded = await loadConversation(member.organizationId, body.conversationId);
  if (!loaded.conversation) return loaded.response;
  const blocked = contactGuard(loaded.conversation);
  if (blocked) return blocked;

  const now = new Date().toISOString();
  const message = await createCallMessage({
    organizationId: member.organizationId,
    conversationId: loaded.conversation.id,
    sentByUserId: member.userId,
    call: { id: localCallId("tel"), direction: "outbound", status: "ended", via: "phone", startedAt: now, endedAt: null, durationSec: null, startedByUserId: member.userId },
  });
  return NextResponse.json({ message });
}
