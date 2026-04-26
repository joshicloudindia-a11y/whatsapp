import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const broadcasts = await prisma.broadcast.findMany({
    where: { organizationId: session.user.organizationId },
    include: { template: { select: { name: true, category: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ broadcasts });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, templateId, whatsappAccountId, scheduledAt, recipientFilter, recipientIds } = body;

  // Resolve recipients
  let contactIds: string[] = recipientIds ?? [];

  if (!recipientIds?.length && recipientFilter) {
    const where: any = { organizationId: session.user.organizationId };
    if (recipientFilter.tags?.length) where.tags = { some: { tag: { in: recipientFilter.tags } } };
    if (recipientFilter.stage) where.stage = recipientFilter.stage;

    const contacts = await prisma.contact.findMany({
      where,
      select: { id: true },
    });
    contactIds = contacts.map((c) => c.id);
  }

  if (!contactIds.length) {
    return NextResponse.json({ error: "No recipients selected" }, { status: 400 });
  }

  const broadcast = await prisma.broadcast.create({
    data: {
      organizationId: session.user.organizationId,
      whatsappAccountId,
      templateId,
      name,
      status: scheduledAt ? "SCHEDULED" : "DRAFT",
      scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
      totalCount: contactIds.length,
      recipients: {
        createMany: {
          data: contactIds.map((contactId) => ({ contactId, status: "PENDING" })),
        },
      },
    },
  });

  return NextResponse.json({ broadcast }, { status: 201 });
}
