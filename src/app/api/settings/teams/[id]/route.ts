import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { TEAM_SELECT, cleanDesc, cleanName, findOrgTeam } from "../shared";

/** Renames a team / updates its description. Body: { name?, description? } */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { member, response } = await requireOrgMember({ admin: true });
  if (!member) return response;
  const { id } = await params;
  const organizationId = member.organizationId;

  const team = await findOrgTeam(organizationId, id);
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) ?? {};
  const data: { name?: string; description?: string | null } = {};
  if (body.name !== undefined) {
    const name = cleanName(body.name);
    if (name.length < 2) return NextResponse.json({ error: "Team name must be at least 2 characters" }, { status: 400 });
    const dup = await prisma.team.findFirst({ where: { organizationId, name, NOT: { id } }, select: { id: true } });
    if (dup) return NextResponse.json({ error: "A team with this name already exists" }, { status: 409 });
    data.name = name;
  }
  if (body.description !== undefined) data.description = cleanDesc(body.description);
  if (!Object.keys(data).length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const updated = await prisma.team.update({ where: { id }, data, select: TEAM_SELECT });
  return NextResponse.json({ team: updated });
}

/** Deletes a team. Conversations routed to it become unassigned (team-wise); memberships are removed. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { member, response } = await requireOrgMember({ admin: true });
  if (!member) return response;
  const { id } = await params;
  const organizationId = member.organizationId;

  const team = await findOrgTeam(organizationId, id);
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  await prisma.$transaction([
    prisma.conversation.updateMany({ where: { organizationId, assignedTeamId: id }, data: { assignedTeamId: null } }),
    prisma.teamMember.deleteMany({ where: { teamId: id } }),
    prisma.team.delete({ where: { id } }),
  ]);
  return NextResponse.json({ success: true });
}
