import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { MAX_ACTIVE_KEYS, generateApiKey } from "@/lib/api-keys";

const SELECT = { id: true, name: true, keyPrefix: true, lastUsedAt: true, expiresAt: true, isActive: true, createdAt: true } as const;
const EXPIRY_DAYS = [30, 90, 180, 365] as const;

export async function GET() {
  const { member, response } = await requireOrgMember({ admin: true });
  if (!member) return response;

  const keys = await prisma.apiKey.findMany({
    where: { organizationId: member.organizationId, isActive: true },
    select: SELECT,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ keys, limit: MAX_ACTIVE_KEYS });
}

export async function POST(req: NextRequest) {
  const { member, response } = await requireOrgMember({ admin: true });
  if (!member) return response;

  const body = (await req.json().catch(() => null)) ?? {};
  const name = String(body.name ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
  if (name.length < 2) return NextResponse.json({ error: "Give the key a name (at least 2 characters)" }, { status: 400 });

  const days = body.expiresInDays == null || body.expiresInDays === "never" ? null : Number(body.expiresInDays);
  if (days !== null && !EXPIRY_DAYS.includes(days as (typeof EXPIRY_DAYS)[number])) {
    return NextResponse.json({ error: "Invalid expiry" }, { status: 400 });
  }

  const active = await prisma.apiKey.count({ where: { organizationId: member.organizationId, isActive: true } });
  if (active >= MAX_ACTIVE_KEYS) {
    return NextResponse.json({ error: `You can have up to ${MAX_ACTIVE_KEYS} active keys. Delete an unused key first.` }, { status: 400 });
  }

  const { plain, hash, prefix } = generateApiKey();
  const key = await prisma.apiKey.create({
    data: {
      organizationId: member.organizationId,
      name,
      keyHash: hash,
      keyPrefix: prefix,
      expiresAt: days ? new Date(Date.now() + days * 86400000) : null,
    },
    select: SELECT,
  });

  // The plain key is returned exactly once and never stored.
  return NextResponse.json({ key, plainKey: plain }, { status: 201 });
}
