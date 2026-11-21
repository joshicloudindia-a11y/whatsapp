import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";

type Params = { params: Promise<{ id: string }> };

const MAX = 20;

/**
 * GET ?limit=10&exclude=<conversationId> — the contact's most recent conversations (customer history),
 * newest first, with the last message snippet and assigned agent. Scoped to the caller's organization.
 */
export async function GET(req: NextRequest, { params }: Params) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  const { id } = await params;
  const sp = req.nextUrl.searchParams;
  const limit = Math.min(MAX, Math.max(1, parseInt(sp.get("limit") ?? "10") || 10));
  const exclude = sp.get("exclude")?.trim() || undefined;

  const contact = await prisma.contact.findFirst({ where: { id, organizationId: member.organizationId }, select: { id: true } });
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  const where = { contactId: id, organizationId: member.organizationId, ...(exclude && { id: { not: exclude } }) };
  const [rows, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      select: {
        id: true,
        status: true,
        createdAt: true,
        lastMessageAt: true,
        assignedAgent: { select: { id: true, name: true, email: true } },
        whatsappAccount: { select: { displayName: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1, select: { content: true, type: true, direction: true, mediaCaption: true, templateName: true, createdAt: true } },
        _count: { select: { messages: true } },
      },
      orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: limit,
    }),
    prisma.conversation.count({ where }),
  ]);

  const conversations = rows.map(({ messages, ...c }) => ({ ...c, lastMessage: messages[0] ?? null }));
  return NextResponse.json({ conversations, total });
}
