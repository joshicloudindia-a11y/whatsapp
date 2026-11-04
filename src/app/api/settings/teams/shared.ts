import { prisma } from "@/lib/prisma";

export const MAX_TEAMS = 50;
export const MAX_NAME = 60;
export const MAX_DESC = 200;

export const TEAM_SELECT = {
  id: true, name: true, description: true, createdAt: true, updatedAt: true,
  members: {
    where: { member: { isActive: true } },
    select: {
      id: true, memberId: true,
      member: { select: { id: true, role: true, user: { select: { id: true, name: true, email: true, avatar: true } } } },
    },
  },
  _count: { select: { conversations: true } },
} as const;

export const cleanName = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
export const cleanDesc = (v: unknown) => {
  const s = String(v ?? "").trim().slice(0, MAX_DESC);
  return s || null;
};

/** Returns only the ids that are active OrganizationMembers of the org. */
export async function validMemberIds(organizationId: string, ids: unknown): Promise<string[]> {
  if (!Array.isArray(ids)) return [];
  const unique = [...new Set(ids.map((x) => String(x)).filter(Boolean))].slice(0, 500);
  if (!unique.length) return [];
  const rows = await prisma.organizationMember.findMany({
    where: { organizationId, isActive: true, id: { in: unique } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export async function findOrgTeam(organizationId: string, id: string) {
  return prisma.team.findFirst({ where: { id, organizationId }, select: { id: true, name: true } });
}
