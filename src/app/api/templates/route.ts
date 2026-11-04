import { NextRequest, NextResponse } from "next/server";
import type { Prisma, TemplateCategory, TemplateStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { TEMPLATE_CATEGORIES, TEMPLATE_STATUSES, coerceDraft, draftToColumns, validateDraft } from "@/components/templates/template-utils";
import { activeAccounts, canManage, distinctWabas, duplicateNameResponse, forbidden, isUniqueViolation, submitToMeta, templateSelect } from "./_lib";

export const maxDuration = 60;

/** GET ?status=&category=&search= — list templates plus org-wide counts. */
export async function GET(req: NextRequest) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  const organizationId = member.organizationId;
  const sp = req.nextUrl.searchParams;
  const status = sp.get("status")?.toUpperCase();
  const category = sp.get("category")?.toUpperCase();
  const search = (sp.get("search") ?? "").trim().slice(0, 100);

  const where: Prisma.MessageTemplateWhereInput = { organizationId };
  if (status && (TEMPLATE_STATUSES as readonly string[]).includes(status)) where.status = status as TemplateStatus;
  else where.status = { not: "DELETED" };
  if (category && (TEMPLATE_CATEGORIES as readonly string[]).includes(category)) where.category = category as TemplateCategory;

  const [all, byStatus, byCategory, accounts] = await Promise.all([
    prisma.messageTemplate.findMany({ where, select: templateSelect, orderBy: [{ updatedAt: "desc" }], take: 500 }),
    prisma.messageTemplate.groupBy({ by: ["status"], where: { organizationId }, _count: { _all: true } }),
    prisma.messageTemplate.groupBy({ by: ["category"], where: { organizationId, status: { not: "DELETED" } }, _count: { _all: true } }),
    activeAccounts(organizationId),
  ]);

  // Filter in JS: TiDB's default utf8mb4_bin collation makes SQL LIKE case-sensitive.
  const q = search.toLowerCase();
  const templates = q
    ? all.filter((t) => t.name.toLowerCase().includes(q) || t.body.toLowerCase().includes(q) || (t.headerContent ?? "").toLowerCase().includes(q))
    : all;

  const statusCounts = Object.fromEntries(TEMPLATE_STATUSES.map((s) => [s, byStatus.find((b) => b.status === s)?._count._all ?? 0]));
  return NextResponse.json({
    templates,
    counts: {
      total: Object.entries(statusCounts).reduce((n, [s, c]) => (s === "DELETED" ? n : n + c), 0),
      status: statusCounts,
      category: Object.fromEntries(TEMPLATE_CATEGORIES.map((c) => [c, byCategory.find((b) => b.category === c)?._count._all ?? 0])),
    },
    accounts: distinctWabas(accounts).map((a) => ({ id: a.id, displayName: a.displayName, phoneNumber: a.phoneNumber })),
    canManage: canManage(member.role),
  });
}

/** POST { ...draft, submit?: boolean, accountId?: string } — create (and optionally submit to Meta). */
export async function POST(req: NextRequest) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  if (!canManage(member.role)) return forbidden();

  const raw = await req.json().catch(() => null);
  if (!raw || typeof raw !== "object") return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const draft = coerceDraft(raw);
  const invalid = validateDraft(draft);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  let template;
  try {
    template = await prisma.messageTemplate.create({
      data: { organizationId: member.organizationId, status: "DRAFT", ...draftToColumns(draft) },
    });
  } catch (e) {
    if (isUniqueViolation(e)) return duplicateNameResponse();
    throw e;
  }

  if (raw.submit === true) {
    const r = await submitToMeta(template, draft, member.organizationId, typeof raw.accountId === "string" ? raw.accountId : null);
    return NextResponse.json({ template: r.template, submitted: !r.error, submitError: r.error }, { status: 201 });
  }
  return NextResponse.json({ template, submitted: false }, { status: 201 });
}
