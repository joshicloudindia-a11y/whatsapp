import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { ORG_ROLES, type OrgRole } from "@/lib/team";

type Params = { params: Promise<{ id: string }> };

async function load(organizationId: string, id: string) {
  return prisma.organizationMember.findFirst({ where: { id, organizationId, isActive: true }, select: { id: true, userId: true, role: true } });
}
const adminCount = (organizationId: string) =>
  prisma.organizationMember.count({ where: { organizationId, isActive: true, role: "ADMIN" } });

/** Change a member's role. */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { member, response } = await requireOrgMember({ admin: true });
  if (!member) return response;
  const { id } = await params;
  const target = await load(member.organizationId, id);
  if (!target) return NextResponse.json({ error: "Member not found" }, { status: 404 });
  if (target.userId === member.userId) return NextResponse.json({ error: "You can't change your own role" }, { status: 400 });

  const body = (await req.json().catch(() => null)) ?? {};
  const role = body.role as OrgRole;
  if (!ORG_ROLES.includes(role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  if (target.role === "ADMIN" && role !== "ADMIN" && (await adminCount(member.organizationId)) <= 1) {
    return NextResponse.json({ error: "Your organization needs at least one admin" }, { status: 400 });
  }

  const updated = await prisma.organizationMember.update({ where: { id }, data: { role }, select: { id: true, role: true } });
  return NextResponse.json({ member: updated });
}

/** Remove a member from the organization (their account is kept). */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { member, response } = await requireOrgMember({ admin: true });
  if (!member) return response;
  const { id } = await params;
  const target = await load(member.organizationId, id);
  if (!target) return NextResponse.json({ error: "Member not found" }, { status: 404 });
  if (target.userId === member.userId) return NextResponse.json({ error: "You can't remove yourself" }, { status: 400 });
  if (target.role === "ADMIN" && (await adminCount(member.organizationId)) <= 1) {
    return NextResponse.json({ error: "Your organization needs at least one admin" }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.organizationMember.update({ where: { id }, data: { isActive: false } }),
    // Unassign their open conversations so nothing gets stuck.
    prisma.conversation.updateMany({
      where: { organizationId: member.organizationId, assignedAgentId: target.userId, status: { in: ["OPEN", "PENDING"] } },
      data: { assignedAgentId: null },
    }),
  ]);
  return NextResponse.json({ success: true });
}
