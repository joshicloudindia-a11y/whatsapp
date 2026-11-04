import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { STAGES, type Stage } from "@/components/contacts/shared";
import { CAN_DELETE_ROLES } from "../_lib/query";

/** GET → org-wide contact KPIs, stage breakdown and tag list (for filters / suggestions). */
export async function GET() {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  const organizationId = member.organizationId;
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [total, newThisWeek, optedOut, blocked, stageRows, tagRows] = await Promise.all([
    prisma.contact.count({ where: { organizationId } }),
    prisma.contact.count({ where: { organizationId, createdAt: { gte: weekAgo } } }),
    prisma.contact.count({ where: { organizationId, optedOut: true } }),
    prisma.contact.count({ where: { organizationId, isBlocked: true } }),
    prisma.contact.groupBy({ by: ["stage"], where: { organizationId }, _count: { _all: true } }),
    prisma.contactTag.groupBy({ by: ["tag"], where: { contact: { organizationId } }, _count: { _all: true }, orderBy: { _count: { tag: "desc" } }, take: 200 }),
  ]);

  const stages = Object.fromEntries(STAGES.map((s) => [s, stageRows.find((r) => r.stage === s)?._count._all ?? 0])) as Record<Stage, number>;

  return NextResponse.json({
    total, newThisWeek, optedOut, blocked, stages,
    tags: tagRows.map((t) => ({ tag: t.tag, count: t._count._all })),
    canDelete: CAN_DELETE_ROLES.includes(member.role),
  });
}
