import { NextRequest, NextResponse, after } from "next/server";
import { emitContactCreated } from "@/lib/outgoing-webhooks";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { STAGES, cleanTags, isEmail, normalizePhone } from "@/components/contacts/shared";
import { apiError, buildContactOrder, buildContactWhere, contactListSelect } from "./_lib/query";

/** GET ?search&stage&tag&status&sort&page&limit → paginated, org-scoped contact list. */
export async function GET(req: NextRequest) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;

  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, parseInt(sp.get("page") ?? "1") || 1);
  const limit = Math.min(200, Math.max(1, parseInt(sp.get("limit") ?? "25") || 25));
  const where = buildContactWhere(member.organizationId, sp);

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({ where, select: contactListSelect, orderBy: buildContactOrder(sp), skip: (page - 1) * limit, take: limit }),
    prisma.contact.count({ where }),
  ]);

  return NextResponse.json({ contacts, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
}

const createSchema = z.object({
  phone: z.union([z.string(), z.number()]),
  name: z.string().trim().max(120).optional().nullable(),
  email: z.string().trim().max(191).optional().nullable(),
  stage: z.enum(STAGES).optional(),
  tags: z.array(z.string()).max(50).optional(),
  notes: z.string().max(5000).optional().nullable(),
  optedOut: z.boolean().optional(),
  isBlocked: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid contact details" }, { status: 400 });
  const b = parsed.data;

  const p = normalizePhone(b.phone);
  if ("error" in p) return NextResponse.json({ error: p.error }, { status: 400 });
  const email = b.email?.trim() || null;
  if (email && !isEmail(email)) return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  const tags = cleanTags(b.tags);

  try {
    const contact = await prisma.contact.create({
      data: {
        organizationId: member.organizationId,
        phone: p.phone,
        name: b.name?.trim() || null,
        email,
        stage: b.stage ?? "LEAD",
        notes: b.notes?.trim() || null,
        optedOut: b.optedOut ?? false,
        isBlocked: b.isBlocked ?? false,
        ...(tags.length > 0 && { tags: { createMany: { data: tags.map((tag) => ({ tag })), skipDuplicates: true } } }),
      },
      select: contactListSelect,
    });
    after(() => emitContactCreated(contact.id)); // [webhooks]
    return NextResponse.json({ contact }, { status: 201 });
  } catch (e) {
    if (apiError(e) === "P2002") return NextResponse.json({ error: `A contact with +${p.phone} already exists` }, { status: 409 });
    console.error("[contacts] create failed", e);
    return NextResponse.json({ error: "Failed to create contact" }, { status: 500 });
  }
}
