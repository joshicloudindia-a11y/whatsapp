import { NextRequest, NextResponse } from "next/server";
import type { MessageStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";

type Params = { params: Promise<{ id: string }> };
const CAN_SEND = ["ADMIN", "CAMPAIGN_MANAGER"];
const RSTATUS: MessageStatus[] = ["PENDING", "SENT", "DELIVERED", "READ", "FAILED"];

export async function GET(req: NextRequest, { params }: Params) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  const { id } = await params;
  const sp = req.nextUrl.searchParams;
  const rstatus = sp.get("recipientStatus");
  const page = Math.max(1, parseInt(sp.get("page") ?? "1") || 1);

  const broadcast = await prisma.broadcast.findFirst({
    where: { id, organizationId: member.organizationId },
    include: { template: { select: { name: true, body: true, language: true, category: true } }, whatsappAccount: { select: { displayName: true, phoneNumber: true } } },
  });
  if (!broadcast) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rwhere = { broadcastId: id, ...(rstatus && RSTATUS.includes(rstatus as MessageStatus) && { status: rstatus as MessageStatus }) };
  const [byStatus, recipients, filtered] = await Promise.all([
    prisma.broadcastRecipient.groupBy({ by: ["status"], where: { broadcastId: id }, _count: { _all: true } }),
    prisma.broadcastRecipient.findMany({
      where: rwhere,
      select: { id: true, status: true, sentAt: true, deliveredAt: true, readAt: true, failReason: true, contact: { select: { id: true, name: true, phone: true } } },
      orderBy: { createdAt: "asc" },
      skip: (page - 1) * 50,
      take: 50,
    }),
    prisma.broadcastRecipient.count({ where: rwhere }),
  ]);

  return NextResponse.json({
    broadcast,
    counts: Object.fromEntries(RSTATUS.map((s) => [s, byStatus.find((b) => b.status === s)?._count._all ?? 0])),
    recipients, recipientTotal: filtered, page,
  });
}

/** PATCH { action: "pause" | "cancel" } */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  if (!CAN_SEND.includes(member.role)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const { id } = await params;
  const body = (await req.json().catch(() => null)) ?? {};

  const b = await prisma.broadcast.findFirst({ where: { id, organizationId: member.organizationId }, select: { status: true } });
  if (!b) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.action === "pause") {
    if (b.status !== "RUNNING") return NextResponse.json({ error: "Only a sending broadcast can be paused" }, { status: 400 });
    await prisma.broadcast.update({ where: { id }, data: { status: "PAUSED" } });
  } else if (body.action === "cancel") {
    if (!["SCHEDULED", "PAUSED", "DRAFT"].includes(b.status)) return NextResponse.json({ error: "This broadcast can't be cancelled" }, { status: 400 });
    await prisma.broadcast.update({ where: { id }, data: { status: "DRAFT", scheduledAt: null } });
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  if (!CAN_SEND.includes(member.role)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const { id } = await params;
  const b = await prisma.broadcast.findFirst({ where: { id, organizationId: member.organizationId }, select: { status: true } });
  if (!b) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (b.status === "RUNNING") return NextResponse.json({ error: "Pause the broadcast before deleting it" }, { status: 400 });
  await prisma.broadcast.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
