import { NextResponse, after } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { STAGES, type Stage } from "@/components/contacts/shared";
import { parseIntlPhone } from "@/lib/messaging";
import { emitContactCreated, toApiContact } from "@/lib/outgoing-webhooks";
import { apiError, pagination, readJson, withApiKey } from "../_lib/api";
import { contactSelect, parseContactPatch, patchToData } from "../_lib/contacts";

export const dynamic = "force-dynamic";

/** GET /api/v1/contacts?search=&stage=&tag=&optedOut=&page=&limit= */
export const GET = withApiKey(async (req, { organizationId }) => {
  const sp = req.nextUrl.searchParams;
  const { page, limit, skip } = pagination(sp);
  const where: Prisma.ContactWhereInput = { organizationId };

  const search = (sp.get("search") ?? "").trim().slice(0, 100);
  if (search) {
    const digits = search.replace(/\D/g, "");
    where.OR = [{ name: { contains: search } }, { email: { contains: search } }, ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : [])];
  }
  const stage = sp.get("stage")?.toUpperCase();
  if (stage) {
    if (!STAGES.includes(stage as Stage)) return apiError(400, "INVALID_STAGE", `\`stage\` must be one of ${STAGES.join(", ").toLowerCase()}.`);
    where.stage = stage as Stage;
  }
  const tag = (sp.get("tag") ?? "").trim().toLowerCase().slice(0, 40);
  if (tag) where.tags = { some: { tag } };
  const optedOut = sp.get("optedOut");
  if (optedOut === "true" || optedOut === "false") where.optedOut = optedOut === "true";

  const [rows, total] = await Promise.all([
    prisma.contact.findMany({ where, select: contactSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take: limit }),
    prisma.contact.count({ where }),
  ]);
  return NextResponse.json({ data: rows.map(toApiContact), page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) });
});

/**
 * POST /api/v1/contacts — create or update by phone.
 * { phone, name?, email?, stage?, tags?, optedOut? } → 201 { contact, created: true } | 200 { contact, created: false }
 */
export const POST = withApiKey(async (req, { organizationId }) => {
  const body = await readJson(req);
  if (!body) return apiError(400, "INVALID_JSON", "Request body must be a JSON object.");
  const phone = parseIntlPhone(body.phone);
  if (!phone) return apiError(400, "INVALID_PHONE", "`phone` must be a phone number with country code, digits only (e.g. 919876543210).");
  const parsed = parseContactPatch(body);
  if ("error" in parsed) return apiError(400, "VALIDATION_ERROR", parsed.error);
  const { patch } = parsed;

  const existing = await prisma.contact.findUnique({ where: { organizationId_phone: { organizationId, phone } }, select: { id: true } });
  if (existing) {
    const contact = await prisma.contact.update({ where: { id: existing.id }, data: patchToData(patch), select: contactSelect });
    return NextResponse.json({ contact: toApiContact(contact), created: false });
  }

  try {
    const contact = await prisma.contact.create({
      data: {
        organizationId,
        phone,
        name: patch.name ?? null,
        email: patch.email ?? null,
        stage: patch.stage ?? "LEAD",
        optedOut: patch.optedOut ?? false,
        ...(patch.tags?.length && { tags: { createMany: { data: patch.tags.map((tag) => ({ tag })), skipDuplicates: true } } }),
      },
      select: contactSelect,
    });
    after(() => emitContactCreated(contact.id));
    return NextResponse.json({ contact: toApiContact(contact), created: true }, { status: 201 });
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") {
      // Created concurrently — apply the update instead.
      const contact = await prisma.contact.update({ where: { organizationId_phone: { organizationId, phone } }, data: patchToData(patch), select: contactSelect });
      return NextResponse.json({ contact: toApiContact(contact), created: false });
    }
    throw e;
  }
});
