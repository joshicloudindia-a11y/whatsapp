import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";

type Params = { params: Promise<{ id: string }> };

/** Internal note (never sent to the customer). */
export async function POST(req: NextRequest, { params }: Params) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  const { id } = await params;

  const conv = await prisma.conversation.findFirst({ where: { id, organizationId: member.organizationId }, select: { id: true } });
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) ?? {};
  const content = String(body.content ?? "").trim().slice(0, 2000);
  if (!content) return NextResponse.json({ error: "Note can't be empty" }, { status: 400 });

  const note = await prisma.conversationNote.create({ data: { conversationId: id, authorId: member.userId, content } });
  return NextResponse.json({ note }, { status: 201 });
}

/** DELETE ?noteId= (author or org admin only) */
export async function DELETE(req: NextRequest, { params }: Params) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  const { id } = await params;
  const noteId = req.nextUrl.searchParams.get("noteId");

  const note = await prisma.conversationNote.findFirst({
    where: { id: noteId ?? "", conversationId: id, conversation: { organizationId: member.organizationId } },
    select: { id: true, authorId: true },
  });
  if (!note) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (note.authorId !== member.userId && member.role !== "ADMIN") return NextResponse.json({ error: "You can only delete your own notes" }, { status: 403 });

  await prisma.conversationNote.delete({ where: { id: note.id } });
  return NextResponse.json({ success: true });
}
