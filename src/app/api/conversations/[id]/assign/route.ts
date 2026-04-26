import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { pusherServer, PUSHER_EVENTS, orgChannel } from "@/lib/pusher";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { agentId, teamId } = await req.json();

  const conversation = await prisma.conversation.update({
    where: { id, organizationId: session.user.organizationId },
    data: {
      assignedAgentId: agentId ?? null,
      assignedTeamId: teamId ?? null,
    },
  });

  await pusherServer.trigger(orgChannel(session.user.organizationId), PUSHER_EVENTS.CONVERSATION_ASSIGNED, {
    conversationId: conversation.id,
    agentId,
    teamId,
  });

  return NextResponse.json({ success: true, conversation });
}
