import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status") ?? "OPEN";
  const assignedTo = searchParams.get("assignedTo");
  const labelId = searchParams.get("labelId");
  const search = searchParams.get("search");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "30")));

  const where: any = {
    organizationId: session.user.organizationId,
    status,
  };

  if (assignedTo === "me") where.assignedAgentId = session.user.id;
  if (assignedTo === "unassigned") where.assignedAgentId = null;
  if (labelId) where.labels = { some: { labelId } };
  if (search) {
    where.contact = {
      OR: [
        { name: { contains: search } },
        { phone: { contains: search } },
        { email: { contains: search } },
      ],
    };
  }

  const [conversations, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      include: {
        contact: { include: { tags: true } },
        assignedAgent: { select: { id: true, name: true, avatar: true } },
        assignedTeam: { select: { id: true, name: true } },
        labels: { include: { label: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { content: true, type: true, direction: true, createdAt: true },
        },
      },
      orderBy: { lastMessageAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.conversation.count({ where }),
  ]);

  return NextResponse.json({ conversations, total, page, limit });
}
