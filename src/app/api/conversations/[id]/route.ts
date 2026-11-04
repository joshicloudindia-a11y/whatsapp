import { NextRequest, NextResponse } from "next/server";
import type { ConversationStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { markMessageRead } from "@/lib/whatsapp";

type Params = { params: Promise<{ id: string }> };
const STATUSES: ConversationStatus[] = ["OPEN", "PENDING", "RESOLVED", "SNOOZED"];

export async function GET(_req: NextRequest, { params }: Params) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  const { id } = await params;

  const conversation = await prisma.conversation.findFirst({
    where: { id, organizationId: member.organizationId },
    include: {
      contact: { include: { tags: { select: { tag: true } }, _count: { select: { conversations: true } } } },
      assignedAgent: { select: { id: true, name: true, email: true } },
      labels: { include: { label: true } },
      whatsappAccount: { select: { id: true, displayName: true, phoneNumber: true, isActive: true } },
      notes: { orderBy: { createdAt: "desc" }, take: 50 },
      _count: { select: { messages: true } },
    },
  });
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const authorIds = [...new Set(conversation.notes.map((n) => n.authorId).filter(Boolean))] as string[];
  const authors = authorIds.length
    ? await prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true, email: true } })
    : [];
  const notes = conversation.notes.map((n) => ({ ...n, author: authors.find((a) => a.id === n.authorId) ?? null }));

  return NextResponse.json({ conversation: { ...conversation, notes } });
}

/** PATCH { isRead?, status?, labelIds? } */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) ?? {};

  const conv = await prisma.conversation.findFirst({
    where: { id, organizationId: member.organizationId },
    select: { id: true, isRead: true, whatsappAccount: { select: { accessToken: true, phoneNumberId: true } } },
  });
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Prisma.ConversationUpdateInput = {};
  if (body.isRead !== undefined) data.isRead = Boolean(body.isRead);
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    data.status = body.status;
  }

  if (Array.isArray(body.labelIds)) {
    const valid = await prisma.label.findMany({ where: { organizationId: member.organizationId, id: { in: body.labelIds.map(String) } }, select: { id: true } });
    await prisma.$transaction([
      prisma.conversationLabel.deleteMany({ where: { conversationId: id } }),
      prisma.conversationLabel.createMany({ data: valid.map((l) => ({ conversationId: id, labelId: l.id })) }),
    ]);
  }

  const updated = Object.keys(data).length ? await prisma.conversation.update({ where: { id }, data, select: { id: true, isRead: true, status: true } }) : null;

  // Blue ticks for the customer: mark their latest message read on WhatsApp (best effort).
  if (body.isRead === true && !conv.isRead) {
    const lastInbound = await prisma.message.findFirst({
      where: { conversationId: id, direction: "INBOUND", wamid: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { wamid: true },
    });
    if (lastInbound?.wamid) {
      markMessageRead(lastInbound.wamid, conv.whatsappAccount.accessToken, conv.whatsappAccount.phoneNumberId).catch(() => {});
    }
  }

  return NextResponse.json({ success: true, conversation: updated });
}
