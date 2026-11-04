import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { pusherServer, PUSHER_EVENTS, orgChannel } from "@/lib/pusher";

/**
 * POST { blocked: boolean } → blocks/unblocks the conversation's contact (Contact.isBlocked).
 * Blocking is enforced in-app (sends refuse, broadcasts skip). WhatsApp Cloud API blocking of the
 * user on WhatsApp itself is a separate Meta feature and is not called here.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOrgMember();
  if ("response" in auth) return auth.response;
  const { member } = auth;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (typeof body?.blocked !== "boolean") return NextResponse.json({ error: "`blocked` must be true or false" }, { status: 400 });

  const conv = await prisma.conversation.findFirst({ where: { id, organizationId: member.organizationId }, select: { contactId: true } });
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const contact = await prisma.contact.update({ where: { id: conv.contactId }, data: { isBlocked: body.blocked }, select: { id: true, isBlocked: true } });
  await prisma.conversationNote.create({
    data: { conversationId: id, authorId: member.userId, content: body.blocked ? "Contact blocked from the inbox." : "Contact unblocked from the inbox." },
  }).catch(() => undefined);
  await pusherServer.trigger(orgChannel(member.organizationId), PUSHER_EVENTS.CONTACT_UPDATED, { contactId: contact.id });
  return NextResponse.json({ contact });
}
