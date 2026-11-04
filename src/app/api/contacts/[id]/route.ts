import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { STAGES, cleanTags, isEmail, normalizePhone } from "@/components/contacts/shared";
import { CAN_DELETE_ROLES, apiError, contactListSelect } from "../_lib/query";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  const { id } = await params;

  const contact = await prisma.contact.findFirst({
    where: { id, organizationId: member.organizationId },
    select: {
      ...contactListSelect,
      attributes: { select: { key: true, value: true }, orderBy: { key: "asc" } },
      _count: { select: { conversations: true, broadcastLogs: true } },
    },
  });
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  const latestConversation = await prisma.conversation.findFirst({
    where: { contactId: id, organizationId: member.organizationId },
    select: { id: true, status: true, lastMessageAt: true },
    orderBy: [{ updatedAt: "desc" }],
  });

  return NextResponse.json({ contact: { ...contact, latestConversation } });
}

const patchSchema = z.object({
  phone: z.union([z.string(), z.number()]).optional(),
  name: z.string().trim().max(120).nullable().optional(),
  email: z.string().trim().max(191).nullable().optional(),
  stage: z.enum(STAGES).optional(),
  tags: z.array(z.string()).max(50).optional(),
  notes: z.string().max(5000).nullable().optional(),
  optedOut: z.boolean().optional(),
  isBlocked: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: Params) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  const { id } = await params;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid contact details" }, { status: 400 });
  const b = parsed.data;

  const existing = await prisma.contact.findFirst({ where: { id, organizationId: member.organizationId }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  const data: { phone?: string; name?: string | null; email?: string | null; stage?: (typeof STAGES)[number]; notes?: string | null; optedOut?: boolean; isBlocked?: boolean } = {};
  if (b.phone !== undefined) {
    const p = normalizePhone(b.phone);
    if ("error" in p) return NextResponse.json({ error: p.error }, { status: 400 });
    data.phone = p.phone;
  }
  if (b.name !== undefined) data.name = b.name?.trim() || null;
  if (b.email !== undefined) {
    const email = b.email?.trim() || null;
    if (email && !isEmail(email)) return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
    data.email = email;
  }
  if (b.stage !== undefined) data.stage = b.stage;
  if (b.notes !== undefined) data.notes = b.notes?.trim() || null;
  if (b.optedOut !== undefined) data.optedOut = b.optedOut;
  if (b.isBlocked !== undefined) data.isBlocked = b.isBlocked;

  try {
    const ops = [];
    ops.push(prisma.contact.update({ where: { id }, data }));
    if (b.tags !== undefined) {
      const tags = cleanTags(b.tags);
      ops.push(prisma.contactTag.deleteMany({ where: { contactId: id, ...(tags.length > 0 && { tag: { notIn: tags } }) } }));
      if (tags.length) ops.push(prisma.contactTag.createMany({ data: tags.map((tag) => ({ contactId: id, tag })), skipDuplicates: true }));
    }
    await prisma.$transaction(ops);
    const contact = await prisma.contact.findUnique({ where: { id }, select: contactListSelect });
    return NextResponse.json({ contact });
  } catch (e) {
    if (apiError(e) === "P2002") return NextResponse.json({ error: `Another contact already uses +${data.phone}` }, { status: 409 });
    console.error("[contacts] update failed", e);
    return NextResponse.json({ error: "Failed to update contact" }, { status: 500 });
  }
}

/**
 * Deletes a contact only when it has no conversation or broadcast history.
 * Conversations (and their messages) and broadcast recipients reference the contact without
 * cascading, so deleting would orphan chat history and corrupt broadcast reports. For those
 * contacts we refuse with 409 and suggest blocking / opting out instead.
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  if (!CAN_DELETE_ROLES.includes(member.role)) return NextResponse.json({ error: "Only admins and campaign managers can delete contacts" }, { status: 403 });
  const { id } = await params;

  const contact = await prisma.contact.findFirst({
    where: { id, organizationId: member.organizationId },
    select: { id: true, _count: { select: { conversations: true, broadcastLogs: true } } },
  });
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  if (contact._count.conversations || contact._count.broadcastLogs) {
    return NextResponse.json({
      error: "This contact has chat or broadcast history and can't be deleted. Block or opt them out instead.",
      code: "HAS_HISTORY",
    }, { status: 409 });
  }

  await prisma.$transaction([
    prisma.chatbotSession.deleteMany({ where: { contactId: id } }),
    prisma.contactTag.deleteMany({ where: { contactId: id } }),
    prisma.contactAttribute.deleteMany({ where: { contactId: id } }),
    prisma.contact.delete({ where: { id } }),
  ]);
  return NextResponse.json({ ok: true });
}
