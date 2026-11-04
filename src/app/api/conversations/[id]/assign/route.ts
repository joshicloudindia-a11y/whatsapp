import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { pusherServer, PUSHER_EVENTS, orgChannel } from "@/lib/pusher";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) ?? {};
  const agentId = body.agentId ? String(body.agentId) : null;

  const conv = await prisma.conversation.findFirst({ where: { id, organizationId: member.organizationId }, select: { id: true } });
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Only active members of this organization can be assigned.
  if (agentId) {
    const ok = await prisma.organizationMember.findFirst({ where: { organizationId: member.organizationId, userId: agentId, isActive: true }, select: { id: true } });
    if (!ok) return NextResponse.json({ error: "That person isn't a member of your team" }, { status: 400 });
  }

  const conversation = await prisma.conversation.update({
    where: { id },
    data: { assignedAgentId: agentId },
    select: { id: true, assignedAgent: { select: { id: true, name: true, email: true } } },
  });
  await pusherServer.trigger(orgChannel(member.organizationId), PUSHER_EVENTS.CONVERSATION_ASSIGNED, { conversationId: id, agentId });
  return NextResponse.json({ success: true, conversation });
}
