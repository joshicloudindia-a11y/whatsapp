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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();
  const { isSuperAdmin, isActive, role, organizationId } = body;

  const data: any = {};
  if (isSuperAdmin !== undefined) data.isSuperAdmin = isSuperAdmin;
  if (isActive !== undefined) data.isActive = isActive;

  const user = await prisma.user.update({ where: { id }, data });

  // Update role within an organization if provided
  if (role && organizationId) {
    await prisma.organizationMember.updateMany({
      where: { userId: id, organizationId },
      data: { role },
    });
  }

  return NextResponse.json({ user });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  // Prevent deleting self
  if (id === session.user.id) return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });

  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
