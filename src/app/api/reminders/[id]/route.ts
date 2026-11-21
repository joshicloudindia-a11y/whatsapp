import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { REMINDER_SELECT } from "@/lib/reminders";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** PATCH { done?: boolean, dueAt?: ISO (snooze/reschedule), note? } */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  const { id } = await params;
  const existing = await prisma.reminder.findFirst({ where: { id, organizationId: member.organizationId }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const b = (await req.json().catch(() => null)) ?? {};
  const data: Prisma.ReminderUpdateInput = {};
  if (b.done !== undefined) data.doneAt = b.done ? new Date() : null;
  if (b.dueAt !== undefined) {
    const d = new Date(String(b.dueAt));
    if (Number.isNaN(d.getTime())) return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    data.dueAt = d;
    data.notifiedAt = null; // remind again at the new time
    data.doneAt = null;
  }
  if (b.note !== undefined) {
    const note = String(b.note).trim().slice(0, 1000);
    if (!note) return NextResponse.json({ error: "Note can't be empty" }, { status: 400 });
    data.note = note;
  }
  const reminder = await prisma.reminder.update({ where: { id }, data, select: REMINDER_SELECT });
  return NextResponse.json({ reminder });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  const { id } = await params;
  const r = await prisma.reminder.deleteMany({ where: { id, organizationId: member.organizationId } });
  if (!r.count) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
