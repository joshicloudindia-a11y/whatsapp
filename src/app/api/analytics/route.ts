import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function pct(curr: number, prev: number) {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / prev) * 100);
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = session.user.organizationId;
  const { searchParams } = req.nextUrl;
  const range = searchParams.get("range") ?? "7d";
  const days = range === "30d" ? 30 : range === "90d" ? 90 : 7;

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const prevSince = new Date(since.getTime() - days * 24 * 60 * 60 * 1000);

  const [
    openConversations,
    totalConversations,
    resolvedConversations,
    totalContacts,
    newContacts,    prevNewContacts,
    messagesSent,   prevMessagesSent,
    messagesReceived, prevMessagesReceived,
    broadcasts,     prevBroadcasts,
    recentBroadcasts,
    recentConversations,
    convByStatus,
    agentCounts,
  ] = await Promise.all([
    prisma.conversation.count({ where: { organizationId: orgId, status: "OPEN" } }),
    prisma.conversation.count({ where: { organizationId: orgId, createdAt: { gte: since } } }),
    prisma.conversation.count({ where: { organizationId: orgId, status: "RESOLVED", updatedAt: { gte: since } } }),
    prisma.contact.count({ where: { organizationId: orgId } }),

    prisma.contact.count({ where: { organizationId: orgId, createdAt: { gte: since } } }),
    prisma.contact.count({ where: { organizationId: orgId, createdAt: { gte: prevSince, lt: since } } }),

    prisma.message.count({ where: { organizationId: orgId, direction: "OUTBOUND", createdAt: { gte: since } } }),
    prisma.message.count({ where: { organizationId: orgId, direction: "OUTBOUND", createdAt: { gte: prevSince, lt: since } } }),

    prisma.message.count({ where: { organizationId: orgId, direction: "INBOUND", createdAt: { gte: since } } }),
    prisma.message.count({ where: { organizationId: orgId, direction: "INBOUND", createdAt: { gte: prevSince, lt: since } } }),

    prisma.broadcast.count({ where: { organizationId: orgId, createdAt: { gte: since } } }),
    prisma.broadcast.count({ where: { organizationId: orgId, createdAt: { gte: prevSince, lt: since } } }),

    prisma.broadcast.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true, name: true, status: true, totalCount: true,
        sentCount: true, deliveredCount: true, readCount: true, failedCount: true, createdAt: true,
      },
    }),

    prisma.conversation.findMany({
      where: { organizationId: orgId },
      orderBy: { lastMessageAt: "desc" },
      take: 8,
      select: {
        id: true, status: true, isRead: true, lastMessageAt: true, createdAt: true,
        contact: { select: { name: true, phone: true } },
        assignedAgent: { select: { name: true } },
      },
    }),

    prisma.conversation.groupBy({
      by: ["status"],
      where: { organizationId: orgId },
      _count: true,
    }),

    prisma.conversation.groupBy({
      by: ["assignedAgentId"],
      where: { organizationId: orgId, assignedAgentId: { not: null }, createdAt: { gte: since } },
      _count: { assignedAgentId: true },
      orderBy: [{ _count: { assignedAgentId: "desc" } }],
      take: 6,
    }),
  ]);

  // Resolve agent names for leaderboard
  const agentIds = agentCounts.map((a) => a.assignedAgentId!).filter(Boolean);
  const agentUsers = agentIds.length
    ? await prisma.user.findMany({ where: { id: { in: agentIds } }, select: { id: true, name: true } })
    : [];

  const agentLeaderboard = agentCounts.map((a) => ({
    name: agentUsers.find((u) => u.id === a.assignedAgentId)?.name ?? "Unassigned",
    count: a._count.assignedAgentId,
  }));

  // Daily message chart via raw SQL (BigInt safe)
  const rawDaily = await prisma.$queryRaw<any[]>`
    SELECT
      DATE(createdAt) as date,
      SUM(CASE WHEN direction = 'OUTBOUND' THEN 1 ELSE 0 END) as sent,
      SUM(CASE WHEN direction = 'INBOUND'  THEN 1 ELSE 0 END) as received
    FROM Message
    WHERE organizationId = ${orgId} AND createdAt >= ${since}
    GROUP BY DATE(createdAt)
    ORDER BY date ASC
  `;
  const dailyMessages = rawDaily.map((r) => ({
    date: String(r.date).slice(5), // "MM-DD"
    sent: Number(r.sent),
    received: Number(r.received),
  }));

  const statusMap: Record<string, number> = {};
  convByStatus.forEach((s) => { statusMap[s.status] = s._count; });

  return NextResponse.json({
    range,
    overview: {
      openConversations,
      totalConversations,
      resolvedConversations,
      totalContacts,
      newContacts,      newContactsTrend: pct(newContacts, prevNewContacts),
      messagesSent,     messagesSentTrend: pct(messagesSent, prevMessagesSent),
      messagesReceived, messagesReceivedTrend: pct(messagesReceived, prevMessagesReceived),
      broadcasts,       broadcastsTrend: pct(broadcasts, prevBroadcasts),
    },
    convByStatus: statusMap,
    dailyMessages,
    recentBroadcasts,
    recentConversations,
    agentLeaderboard,
  });
}
