import { NextRequest, NextResponse } from "next/server";
import type { ConversationStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";

const STATUSES: ConversationStatus[] = ["OPEN", "PENDING", "RESOLVED", "SNOOZED"];

export async function GET(req: NextRequest) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  const organizationId = member.organizationId;

  const sp = req.nextUrl.searchParams;
  const status = (STATUSES.includes(sp.get("status") as ConversationStatus) ? sp.get("status") : "OPEN") as ConversationStatus;
  const assignedTo = sp.get("assignedTo");
  const labelId = sp.get("labelId");
  const search = (sp.get("search") ?? "").trim().slice(0, 100);
  const unreadOnly = sp.get("unread") === "1";
  const page = Math.max(1, parseInt(sp.get("page") ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") ?? "30") || 30));

  // Filters shared by the list and the status counters.
  const base: Prisma.ConversationWhereInput = { organizationId };
  if (assignedTo === "me") base.assignedAgentId = member.userId;
  if (assignedTo === "unassigned") base.assignedAgentId = null;
  if (labelId) base.labels = { some: { labelId } };
  if (search) {
    base.contact = { OR: [{ name: { contains: search } }, { phone: { contains: search } }, { email: { contains: search } }] };
  }
  const where: Prisma.ConversationWhereInput = { ...base, status, ...(unreadOnly && { isRead: false }) };

  const [conversations, total, grouped, unread] = await Promise.all([
    prisma.conversation.findMany({
      where,
      include: {
        contact: { select: { id: true, name: true, phone: true, avatar: true, tags: { select: { tag: true } } } },
        assignedAgent: { select: { id: true, name: true, avatar: true } },
        labels: { include: { label: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1, select: { content: true, type: true, direction: true, status: true, createdAt: true } },
      },
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.conversation.count({ where }),
    prisma.conversation.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
    prisma.conversation.count({ where: { ...base, status: { in: ["OPEN", "PENDING"] }, isRead: false } }),
  ]);

  const counts = Object.fromEntries(STATUSES.map((s) => [s, grouped.find((g) => g.status === s)?._count._all ?? 0]));
  return NextResponse.json({ conversations, total, page, limit, counts, unread });
}
