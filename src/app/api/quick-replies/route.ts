import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";

export async function POST(req: NextRequest) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  const body = (await req.json().catch(() => null)) ?? {};
  const shortcut = String(body.shortcut ?? "").trim().toLowerCase().replace(/^\//, "").replace(/[^a-z0-9_-]/g, "").slice(0, 30);
  const content = String(body.content ?? "").trim().slice(0, 1000);
  if (!shortcut) return NextResponse.json({ error: "Shortcut is required (letters, numbers, - or _)" }, { status: 400 });
  if (!content) return NextResponse.json({ error: "Message is required" }, { status: 400 });

  const dup = await prisma.quickReply.findFirst({ where: { organizationId: member.organizationId, shortcut }, select: { id: true } });
  if (dup) return NextResponse.json({ error: `/${shortcut} already exists` }, { status: 409 });

  const quickReply = await prisma.quickReply.create({ data: { organizationId: member.organizationId, shortcut, content }, select: { id: true, shortcut: true, content: true } });
  return NextResponse.json({ quickReply }, { status: 201 });
}
