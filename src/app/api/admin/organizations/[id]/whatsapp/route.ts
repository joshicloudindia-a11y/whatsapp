import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit, requireAdmin } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };
const str = (v: unknown, max = 255) => String(v ?? "").trim().slice(0, max);

/** Ensures the account belongs to the organization in the URL (prevents cross-org edits). */
async function findAccount(organizationId: string, accountId: string | null) {
  if (!accountId) return null;
  return prisma.whatsappAccount.findFirst({ where: { id: accountId, organizationId }, select: { id: true, phoneNumber: true } });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { ctx, response } = await requireAdmin("orgs:whatsapp");
  if (!ctx) return response;

  const { id: organizationId } = await params;
  const body = (await req.json().catch(() => null)) ?? {};
  const phoneNumberId = str(body.phoneNumberId, 64);
  const wabaId = str(body.wabaId, 64);
  const accessToken = str(body.accessToken, 2000);
  const displayName = str(body.displayName, 120);
  const phoneNumber = str(body.phoneNumber, 32).replace(/\D/g, "");

  if (!phoneNumberId || !wabaId || !accessToken || !phoneNumber) {
    return NextResponse.json({ error: "Phone number, Phone Number ID, WABA ID and access token are required" }, { status: 400 });
  }
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

  const dup = await prisma.whatsappAccount.findFirst({ where: { phoneNumberId }, select: { id: true } });
  if (dup) return NextResponse.json({ error: "Phone Number ID already connected" }, { status: 409 });

  const account = await prisma.whatsappAccount.create({
    data: { organizationId, phoneNumber, phoneNumberId, displayName: displayName || phoneNumber, wabaId, accessToken },
    select: { id: true, phoneNumber: true, phoneNumberId: true, displayName: true, wabaId: true, isActive: true },
  });
  await audit(ctx, "whatsapp.create", { entity: "WhatsappAccount", entityId: account.id, metadata: { organizationId, phoneNumber, phoneNumberId } });
  return NextResponse.json({ account }, { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { ctx, response } = await requireAdmin("orgs:whatsapp");
  if (!ctx) return response;

  const { id: organizationId } = await params;
  const acc = await findAccount(organizationId, req.nextUrl.searchParams.get("accountId"));
  if (!acc) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) ?? {};
  const data: Prisma.WhatsappAccountUpdateInput = {};
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
  if (body.displayName !== undefined) data.displayName = str(body.displayName, 120);
  if (body.wabaId !== undefined) data.wabaId = str(body.wabaId, 64);
  if (body.accessToken) data.accessToken = str(body.accessToken, 2000);
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const account = await prisma.whatsappAccount.update({
    where: { id: acc.id },
    data,
    select: { id: true, phoneNumber: true, phoneNumberId: true, displayName: true, wabaId: true, isActive: true },
  });
  await audit(ctx, "whatsapp.update", {
    entity: "WhatsappAccount", entityId: acc.id,
    metadata: { organizationId, fields: Object.keys(data) },
  });
  return NextResponse.json({ account });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { ctx, response } = await requireAdmin("orgs:whatsapp");
  if (!ctx) return response;

  const { id: organizationId } = await params;
  const acc = await findAccount(organizationId, req.nextUrl.searchParams.get("accountId"));
  if (!acc) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  await prisma.whatsappAccount.delete({ where: { id: acc.id } });
  await audit(ctx, "whatsapp.delete", { entity: "WhatsappAccount", entityId: acc.id, metadata: { organizationId, phoneNumber: acc.phoneNumber } });
  return NextResponse.json({ success: true });
}
