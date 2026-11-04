import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { MAX_TEAMS, TEAM_SELECT, cleanDesc, cleanName, validMemberIds } from "./shared";

/** Lists the org's teams with their members, plus the active org members that can be added. */
export async function GET() {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  const organizationId = member.organizationId;

  const [teams, members] = await Promise.all([
    prisma.team.findMany({ where: { organizationId }, select: TEAM_SELECT, orderBy: { createdAt: "asc" } }),
    prisma.organizationMember.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, role: true, user: { select: { id: true, name: true, email: true, avatar: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return NextResponse.json({ teams, members, me: { userId: member.userId, isAdmin: member.role === "ADMIN" } });
}

/** Creates a team. Body: { name, description?, memberIds?: OrganizationMember.id[] } */
export async function POST(req: NextRequest) {
  const { member, response } = await requireOrgMember({ admin: true });
  if (!member) return response;
  const organizationId = member.organizationId;
  const body = (await req.json().catch(() => null)) ?? {};

  const name = cleanName(body.name);
  if (name.length < 2) return NextResponse.json({ error: "Team name must be at least 2 characters" }, { status: 400 });

  const [count, dup] = await Promise.all([
    prisma.team.count({ where: { organizationId } }),
    prisma.team.findFirst({ where: { organizationId, name }, select: { id: true } }),
  ]);
  if (count >= MAX_TEAMS) return NextResponse.json({ error: `You can have up to ${MAX_TEAMS} teams` }, { status: 400 });
  if (dup) return NextResponse.json({ error: "A team with this name already exists" }, { status: 409 });

  const memberIds = await validMemberIds(organizationId, body.memberIds);
  const team = await prisma.team.create({
    data: {
      organizationId, name, description: cleanDesc(body.description),
      members: memberIds.length ? { create: memberIds.map((memberId) => ({ memberId })) } : undefined,
    },
    select: TEAM_SELECT,
  });
  return NextResponse.json({ team }, { status: 201 });
}
