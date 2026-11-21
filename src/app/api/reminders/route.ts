import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { REMINDER_SELECT } from "@/lib/reminders";

export const dynamic = "force-dynamic";
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * GET ?contactId=…  → that contact's reminders (open first)
 * GET (no params)   → my open reminders (assigned to me, or created by me and unassigned) + due count
 */
export async function GET(req: NextRequest) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  const contactId = req.nextUrl.searchParams.get("contactId");
  const orgId = member.organizationId;

  if (contactId) {
    const reminders = await prisma.reminder.findMany({
      where: { organizationId: orgId, contactId },
      orderBy: [{ doneAt: { sort: "asc", nulls: "first" } }, { dueAt: "asc" }],
      take: 30,
      select: REMINDER_SELECT,
    });
    return NextResponse.json({ reminders });
  }

  const mine = { organizationId: orgId, doneAt: null, OR: [{ assignedToId: member.userId }, { assignedToId: null, createdById: member.userId }] };
  const [reminders, due] = await Promise.all([
    prisma.reminder.findMany({ where: mine, orderBy: { dueAt: "asc" }, take: 30, select: REMINDER_SELECT }),
    prisma.reminder.count({ where: { ...mine, dueAt: { lte: new Date() } } }),
  ]);
  return NextResponse.json({ reminders, due }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  const orgId = member.organizationId;
  const b = (await req.json().catch(() => null)) ?? {};

  const note = String(b.note ?? "").trim().slice(0, 1000);
  if (!note) return bad("Add a note for the follow-up");
  const dueAt = new Date(String(b.dueAt ?? ""));
  if (Number.isNaN(dueAt.getTime())) return bad("Pick a valid date and time");
  if (dueAt.getTime() > Date.now() + 366 * 24 * 3600 * 1000) return bad("Pick a date within the next year");

  const contact = await prisma.contact.findFirst({ where: { id: String(b.contactId ?? ""), organizationId: orgId }, select: { id: true } });
  if (!contact) return bad("Contact not found", 404);
  let conversationId: string | null = null;
  if (b.conversationId) {
    const conv = await prisma.conversation.findFirst({ where: { id: String(b.conversationId), organizationId: orgId, contactId: contact.id }, select: { id: true } });
    conversationId = conv?.id ?? null;
  }
  let assignedToId: string | null = null;
  if (b.assignedToId) {
    const m = await prisma.organizationMember.findFirst({ where: { organizationId: orgId, userId: String(b.assignedToId), isActive: true }, select: { userId: true } });
    if (!m) return bad("That team member isn't in your organization");
    assignedToId = m.userId;
  }

  const reminder = await prisma.reminder.create({
    data: { organizationId: orgId, contactId: contact.id, conversationId, createdById: member.userId, assignedToId, dueAt, note },
    select: REMINDER_SELECT,
  });
  return NextResponse.json({ reminder }, { status: 201 });
}
