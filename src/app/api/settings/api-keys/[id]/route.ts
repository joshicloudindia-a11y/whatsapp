import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";

type Params = { params: Promise<{ id: string }> };

async function findKey(organizationId: string, id: string) {
  return prisma.apiKey.findFirst({ where: { id, organizationId }, select: { id: true } });
}

/** Rename a key. */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { member, response } = await requireOrgMember({ admin: true });
  if (!member) return response;
  const { id } = await params;
  if (!(await findKey(member.organizationId, id))) return NextResponse.json({ error: "Key not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) ?? {};
  const name = String(body.name ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
  if (name.length < 2) return NextResponse.json({ error: "Name must be at least 2 characters" }, { status: 400 });

  const key = await prisma.apiKey.update({
    where: { id },
    data: { name },
    select: { id: true, name: true, keyPrefix: true, lastUsedAt: true, expiresAt: true, isActive: true, createdAt: true },
  });
  return NextResponse.json({ key });
}

/** Permanently delete (revoke) a key. Any integration using it stops working immediately. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { member, response } = await requireOrgMember({ admin: true });
  if (!member) return response;
  const { id } = await params;
  if (!(await findKey(member.organizationId, id))) return NextResponse.json({ error: "Key not found" }, { status: 404 });

  await prisma.apiKey.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
