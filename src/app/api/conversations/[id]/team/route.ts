import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { pusherServer, PUSHER_EVENTS, orgChannel } from "@/lib/pusher";

/** Routes a conversation to a team. Body: { teamId: string | null } (null clears it). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  const { id } = await params;
  const organizationId = member.organizationId;
  const body = (await req.json().catch(() => null)) ?? {};
  const teamId = body.teamId ? String(body.teamId) : null;

  const conv = await prisma.conversation.findFirst({ where: { id, organizationId }, select: { id: true } });
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (teamId) {
    const team = await prisma.team.findFirst({ where: { id: teamId, organizationId }, select: { id: true } });
    if (!team) return NextResponse.json({ error: "That team doesn't exist in your organization" }, { status: 400 });
  }

  const conversation = await prisma.conversation.update({
    where: { id },
    data: { assignedTeamId: teamId },
    select: { id: true, assignedTeamId: true, assignedTeam: { select: { id: true, name: true } } },
  });
  await pusherServer.trigger(orgChannel(organizationId), PUSHER_EVENTS.CONVERSATION_UPDATED, { conversationId: id, assignedTeamId: teamId });
  return NextResponse.json({ success: true, conversation });
}
