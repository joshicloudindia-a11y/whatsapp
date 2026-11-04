import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, pagination, withApiKey } from "../_lib/api";

export const dynamic = "force-dynamic";

/** GET /api/v1/templates?search=&language=&category=&page=&limit= — approved templates only. */
export const GET = withApiKey(async (req, { organizationId }) => {
  const sp = req.nextUrl.searchParams;
  const { page, limit, skip } = pagination(sp);
  const search = (sp.get("search") ?? "").trim().slice(0, 100);
  const language = (sp.get("language") ?? "").trim().slice(0, 10);
  const category = (sp.get("category") ?? "").trim().toUpperCase();
  if (category && !["MARKETING", "UTILITY", "AUTHENTICATION"].includes(category)) {
    return apiError(400, "INVALID_CATEGORY", "`category` must be marketing, utility or authentication.");
  }

  const where = {
    organizationId,
    status: "APPROVED" as const,
    ...(search && { name: { contains: search } }),
    ...(language && { language }),
    ...(category && { category: category as never }),
  };
  const [rows, total] = await Promise.all([
    prisma.messageTemplate.findMany({
      where,
      select: { id: true, name: true, language: true, category: true, headerType: true, headerContent: true, body: true, footer: true, buttons: true, approvedAt: true },
      orderBy: { name: "asc" },
      skip,
      take: limit,
    }),
    prisma.messageTemplate.count({ where }),
  ]);

  const templates = rows.map((t) => ({
    id: t.id,
    name: t.name,
    language: t.language,
    category: t.category.toLowerCase(),
    header: t.headerType ? { type: t.headerType.toLowerCase(), content: t.headerContent } : null,
    body: t.body,
    footer: t.footer,
    buttons: t.buttons ?? [],
    variables: new Set(Array.from(t.body.matchAll(/\{\{\s*(\d+)\s*\}\}/g), (m) => m[1])).size,
    approvedAt: t.approvedAt?.toISOString() ?? null,
  }));
  return NextResponse.json({ data: templates, page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) });
});
