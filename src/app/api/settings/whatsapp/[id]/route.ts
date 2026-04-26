import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const allowed = ["displayName", "accessToken", "isActive", "phoneNumberId", "wabaId"];
  const data: any = {};
  allowed.forEach((k) => { if (body[k] !== undefined) data[k] = body[k]; });

  try {
    const account = await prisma.whatsappAccount.update({
      where: { id, organizationId: session.user.organizationId },
      data,
      select: { id: true, phoneNumber: true, phoneNumberId: true, displayName: true, wabaId: true, isActive: true },
    });
    return NextResponse.json({ account });
  } catch {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    await prisma.whatsappAccount.delete({
      where: { id, organizationId: session.user.organizationId },
    });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
