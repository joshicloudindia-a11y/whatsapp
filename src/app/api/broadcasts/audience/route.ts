import { NextRequest, NextResponse } from "next/server";
import type { ContactStage, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";

const STAGES: ContactStage[] = ["LEAD", "PROSPECT", "CUSTOMER", "CHURNED"];

/** GET ?mode=all|tags|stage&tags=a,b&stage=LEAD → live recipient count + available tags/stages. */
export async function GET(req: NextRequest) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  const organizationId = member.organizationId;
  const sp = req.nextUrl.searchParams;
  const mode = sp.get("mode") ?? "all";

  const base: Prisma.ContactWhereInput = { organizationId };
  const where: Prisma.ContactWhereInput = { ...base, optedOut: false, isBlocked: false };
  if (mode === "tags") {
    const tags = (sp.get("tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean);
    where.tags = { some: { tag: { in: tags.length ? tags : ["__none__"] } } };
  }
  if (mode === "stage") where.stage = (STAGES.includes(sp.get("stage") as ContactStage) ? sp.get("stage") : "__none__") as never;

  const [eligible, excluded, tagRows, stageRows, sample] = await Promise.all([
    prisma.contact.count({ where }),
    prisma.contact.count({ where: { ...base, OR: [{ optedOut: true }, { isBlocked: true }] } }),
    prisma.contactTag.groupBy({ by: ["tag"], where: { contact: { organizationId } }, _count: { _all: true }, orderBy: { _count: { tag: "desc" } }, take: 100 }),
    prisma.contact.groupBy({ by: ["stage"], where: { ...base, optedOut: false, isBlocked: false }, _count: { _all: true } }),
    prisma.contact.findMany({ where, select: { id: true, name: true, phone: true }, take: 5, orderBy: { createdAt: "desc" } }),
  ]);

  return NextResponse.json({
    eligible,
    excluded,
    tags: tagRows.map((t) => ({ tag: t.tag, count: t._count._all })),
    stages: STAGES.map((s) => ({ stage: s, count: stageRows.find((r) => r.stage === s)?._count._all ?? 0 })),
    sample,
  });
}
