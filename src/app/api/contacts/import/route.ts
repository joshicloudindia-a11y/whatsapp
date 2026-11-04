import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { STAGES, cleanTags, isEmail, normalizePhone } from "@/components/contacts/shared";

const MAX_IMPORT_BATCH = 500;

const schema = z.object({
  rows: z.array(z.object({
    phone: z.union([z.string(), z.number()]),
    name: z.string().max(500).optional().nullable(),
    email: z.string().max(500).optional().nullable(),
    tags: z.array(z.string().max(200)).max(50).optional(),
  })).min(1).max(MAX_IMPORT_BATCH),
  stage: z.enum(STAGES).optional(),
  tags: z.array(z.string()).max(10).optional(),
});

/**
 * POST { rows: [{ phone, name?, email?, tags? }], stage?, tags? } (≤500 rows per call).
 * Creates new contacts only — phones already in the org (or repeated in the batch) are skipped.
 */
export async function POST(req: NextRequest) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  const organizationId = member.organizationId;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: `Send between 1 and ${MAX_IMPORT_BATCH} rows per request` }, { status: 400 });
  const { rows, stage = "LEAD" } = parsed.data;
  const extraTags = cleanTags(parsed.data.tags);

  let invalid = 0;
  let duplicateInFile = 0;
  const byPhone = new Map<string, { phone: string; name: string | null; email: string | null; tags: string[] }>();
  for (const r of rows) {
    const p = normalizePhone(r.phone);
    if ("error" in p) { invalid++; continue; }
    if (byPhone.has(p.phone)) { duplicateInFile++; continue; }
    const email = r.email?.trim() || null;
    byPhone.set(p.phone, {
      phone: p.phone,
      name: r.name?.trim().slice(0, 120) || null,
      email: email && isEmail(email) ? email : null,
      tags: cleanTags([...(r.tags ?? []), ...extraTags]),
    });
  }

  const phones = [...byPhone.keys()];
  const existing = phones.length
    ? await prisma.contact.findMany({ where: { organizationId, phone: { in: phones } }, select: { phone: true } })
    : [];
  const existingSet = new Set(existing.map((c) => c.phone));
  const fresh = phones.filter((p) => !existingSet.has(p)).map((p) => byPhone.get(p)!);

  let imported = 0;
  if (fresh.length) {
    const r = await prisma.contact.createMany({
      data: fresh.map((c) => ({ organizationId, phone: c.phone, name: c.name, email: c.email, stage })),
      skipDuplicates: true,
    });
    imported = r.count;

    const withTags = fresh.filter((c) => c.tags.length);
    if (withTags.length) {
      const created = await prisma.contact.findMany({
        where: { organizationId, phone: { in: withTags.map((c) => c.phone) } },
        select: { id: true, phone: true },
      });
      const idOf = new Map(created.map((c) => [c.phone, c.id]));
      const tagRows = withTags.flatMap((c) => (idOf.has(c.phone) ? c.tags.map((tag) => ({ contactId: idOf.get(c.phone)!, tag })) : []));
      if (tagRows.length) await prisma.contactTag.createMany({ data: tagRows, skipDuplicates: true });
    }
  }

  return NextResponse.json({
    imported,
    skipped: existingSet.size + duplicateInFile + (fresh.length - imported),
    invalid,
  });
}
