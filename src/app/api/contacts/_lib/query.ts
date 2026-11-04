import type { Prisma } from "@prisma/client";
import { SORTS, STAGES, STATUS_FILTERS, type Sort, type Stage, type StatusFilter } from "@/components/contacts/shared";

export const CAN_DELETE_ROLES = ["ADMIN", "CAMPAIGN_MANAGER"];

export const contactListSelect = {
  id: true, phone: true, name: true, email: true, stage: true, isBlocked: true, optedOut: true,
  notes: true, lastSeenAt: true, createdAt: true, updatedAt: true,
  tags: { select: { tag: true }, orderBy: { tag: "asc" } },
  _count: { select: { conversations: true } },
} satisfies Prisma.ContactSelect;

/** Builds an org-scoped Contact filter from allow-listed query params. */
export function buildContactWhere(organizationId: string, sp: URLSearchParams): Prisma.ContactWhereInput {
  const where: Prisma.ContactWhereInput = { organizationId };
  const and: Prisma.ContactWhereInput[] = [];

  const search = (sp.get("search") ?? "").trim().slice(0, 100);
  if (search) {
    const digits = search.replace(/\D/g, "");
    const or: Prisma.ContactWhereInput[] = [{ name: { contains: search } }, { email: { contains: search } }];
    if (digits.length >= 3) or.push({ phone: { contains: digits } });
    and.push({ OR: or });
  }

  const stage = sp.get("stage");
  if (stage && STAGES.includes(stage as Stage)) where.stage = stage as Stage;

  const tag = (sp.get("tag") ?? "").trim().slice(0, 60);
  if (tag) where.tags = { some: { tag } };

  const status = sp.get("status") as StatusFilter | null;
  if (status && STATUS_FILTERS.includes(status)) {
    if (status === "active") Object.assign(where, { optedOut: false, isBlocked: false });
    if (status === "optedOut") where.optedOut = true;
    if (status === "blocked") where.isBlocked = true;
  }

  if (and.length) where.AND = and;
  return where;
}

export function buildContactOrder(sp: URLSearchParams): Prisma.ContactOrderByWithRelationInput[] {
  const sort = (SORTS.includes(sp.get("sort") as Sort) ? sp.get("sort") : "newest") as Sort;
  switch (sort) {
    case "oldest": return [{ createdAt: "asc" }, { id: "asc" }];
    case "name": return [{ name: { sort: "asc", nulls: "last" } }, { id: "asc" }];
    case "lastSeen": return [{ lastSeenAt: { sort: "desc", nulls: "last" } }, { id: "desc" }];
    default: return [{ createdAt: "desc" }, { id: "desc" }];
  }
}

export const apiError = (e: unknown) => (e as { code?: string })?.code;
