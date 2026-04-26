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

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const org = await prisma.organization.findUnique({
    where: { id },
    include: {
      members: { include: { user: { select: { id: true, name: true, email: true, isActive: true, isSuperAdmin: true } } } },
      subscription: true,
      whatsappAccounts: { select: { id: true, phoneNumber: true, displayName: true, isActive: true } },
      _count: { select: { conversations: true, broadcasts: true, contacts: true, templates: true } },
    },
  });

  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ organization: org });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();
  const { plan, name, trialEndsAt } = body;

  const org = await prisma.organization.update({
    where: { id },
    data: {
      ...(name && { name }),
      ...(plan && { plan }),
      ...(trialEndsAt !== undefined && { trialEndsAt: trialEndsAt ? new Date(trialEndsAt) : null }),
    },
  });

  if (plan) {
    await prisma.subscription.upsert({
      where: { organizationId: id },
      update: { plan, status: plan === "TRIAL" ? "TRIALING" : "ACTIVE" },
      create: { organizationId: id, plan, status: plan === "TRIAL" ? "TRIALING" : "ACTIVE" },
    });
  }

  return NextResponse.json({ organization: org });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  await prisma.organization.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
