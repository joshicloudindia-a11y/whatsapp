import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { getPhoneNumberInfo } from "@/lib/whatsapp";

type Params = { params: Promise<{ id: string }> };
const SELECT = {
  id: true, phoneNumber: true, phoneNumberId: true, displayName: true, wabaId: true,
  isActive: true, qualityRating: true, messagingLimit: true, createdAt: true,
} as const;

export async function PATCH(req: NextRequest, { params }: Params) {
  const { member, response } = await requireOrgMember({ admin: true });
  if (!member) return response;
  const { id } = await params;

  const existing = await prisma.whatsappAccount.findFirst({
    where: { id, organizationId: member.organizationId },
    select: { id: true, phoneNumberId: true, accessToken: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) ?? {};
  const data: Prisma.WhatsappAccountUpdateInput = {};
  if (body.displayName !== undefined) data.displayName = String(body.displayName).trim().slice(0, 120);
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);

  // New token or "refresh" → re-verify with Meta and refresh quality/limit.
  if (body.accessToken || body.refresh) {
    const token = body.accessToken ? String(body.accessToken).trim() : existing.accessToken;
    try {
      const info = await getPhoneNumberInfo(existing.phoneNumberId, token);
      if (body.accessToken) data.accessToken = token;
      data.qualityRating = info.quality_rating ?? null;
      data.messagingLimit = info.messaging_limit_tier ?? null;
    } catch (e) {
      return NextResponse.json({ error: `Meta rejected the token: ${(e as Error).message}` }, { status: 400 });
    }
  }
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const account = await prisma.whatsappAccount.update({ where: { id }, data, select: SELECT });
  return NextResponse.json({ account });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { member, response } = await requireOrgMember({ admin: true });
  if (!member) return response;
  const { id } = await params;

  const existing = await prisma.whatsappAccount.findFirst({ where: { id, organizationId: member.organizationId }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.whatsappAccount.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
