import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { TEAM_SELECT, findOrgTeam, validMemberIds } from "../../shared";

/** Adds members. Body: { memberIds: OrganizationMember.id[] } (or { memberId }) */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { member, response } = await requireOrgMember({ admin: true });
  if (!member) return response;
  const { id } = await params;
  const organizationId = member.organizationId;

  const team = await findOrgTeam(organizationId, id);
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) ?? {};
  const requested = Array.isArray(body.memberIds) ? body.memberIds : body.memberId ? [body.memberId] : [];
  const memberIds = await validMemberIds(organizationId, requested);
  if (!memberIds.length) return NextResponse.json({ error: "Pick at least one active member of your organization" }, { status: 400 });

  const existing = await prisma.teamMember.findMany({ where: { teamId: id, memberId: { in: memberIds } }, select: { memberId: true } });
  const have = new Set(existing.map((e) => e.memberId));
  const toAdd = memberIds.filter((m) => !have.has(m));
  if (toAdd.length) {
    // createMany + skipDuplicates keeps this idempotent under concurrent requests.
    await prisma.teamMember.createMany({ data: toAdd.map((memberId) => ({ teamId: id, memberId })), skipDuplicates: true });
  }

  const updated = await prisma.team.findUnique({ where: { id }, select: TEAM_SELECT });
  return NextResponse.json({ team: updated, added: toAdd.length });
}

/** Removes a member. Query: ?memberId=<OrganizationMember.id> */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { member, response } = await requireOrgMember({ admin: true });
  if (!member) return response;
  const { id } = await params;

  const team = await findOrgTeam(member.organizationId, id);
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  const memberId = req.nextUrl.searchParams.get("memberId") ?? "";
  if (!memberId) return NextResponse.json({ error: "memberId is required" }, { status: 400 });

  await prisma.teamMember.deleteMany({ where: { teamId: id, memberId } });
  const updated = await prisma.team.findUnique({ where: { id }, select: TEAM_SELECT });
  return NextResponse.json({ team: updated });
}
