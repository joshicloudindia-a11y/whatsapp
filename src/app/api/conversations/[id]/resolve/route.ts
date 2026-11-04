import { NextRequest, NextResponse, after } from "next/server";
import { emitConversationResolved } from "@/lib/outgoing-webhooks";
import type { ConversationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";

const STATUSES: ConversationStatus[] = ["OPEN", "PENDING", "RESOLVED", "SNOOZED"];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) ?? {};
  const status = (body.status ?? "RESOLVED") as ConversationStatus;
  if (!STATUSES.includes(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });

  const conv = await prisma.conversation.findFirst({ where: { id, organizationId: member.organizationId }, select: { id: true } });
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const conversation = await prisma.conversation.update({ where: { id }, data: { status }, select: { id: true, status: true } });
  if (status === "RESOLVED") after(() => emitConversationResolved(id, member.userId)); // [webhooks]
  return NextResponse.json({ success: true, conversation });
}
