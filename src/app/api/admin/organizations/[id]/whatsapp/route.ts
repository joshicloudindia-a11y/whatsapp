import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireSuperAdmin() {
  const session = await getServerSession(authOptions);
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { isSuperAdmin: true } });
  return user?.isSuperAdmin ? session : null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "Super admin only" }, { status: 403 });

  const { id: organizationId } = await params;
  const { phoneNumber, phoneNumberId, displayName, wabaId, accessToken } = await req.json();

  if (!phoneNumberId) return NextResponse.json({ error: "Phone Number ID is required" }, { status: 400 });

  try {
    const account = await prisma.whatsappAccount.create({
      data: {
        organizationId,
        phoneNumber: phoneNumber.replace(/\D/g, ""),
        phoneNumberId,
        displayName,
        wabaId,
        accessToken,
      },
      select: { id: true, phoneNumber: true, phoneNumberId: true, displayName: true, wabaId: true, isActive: true },
    });
    return NextResponse.json({ account }, { status: 201 });
  } catch (e: any) {
    if (e.code === "P2002") return NextResponse.json({ error: "Phone Number ID already connected" }, { status: 409 });
    return NextResponse.json({ error: "Failed to create" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "Super admin only" }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const accountId = searchParams.get("accountId");
  if (!accountId) return NextResponse.json({ error: "accountId required" }, { status: 400 });

  await prisma.whatsappAccount.delete({ where: { id: accountId } });
  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "Super admin only" }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const accountId = searchParams.get("accountId");
  if (!accountId) return NextResponse.json({ error: "accountId required" }, { status: 400 });

  const body = await req.json();
  const account = await prisma.whatsappAccount.update({ where: { id: accountId }, data: body });
  return NextResponse.json({ account });
}
