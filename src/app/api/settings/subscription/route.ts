import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const org = await prisma.organization.findUnique({
    where: { id: session.user.organizationId },
    select: {
      plan: true,
      trialEndsAt: true,
      subscription: { select: { plan: true, status: true, currentPeriodEnd: true } },
    },
  });

  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    plan: org.subscription?.plan ?? org.plan,
    status: org.subscription?.status ?? "ACTIVE",
    trialEndsAt: org.trialEndsAt,
    currentPeriodEnd: org.subscription?.currentPeriodEnd,
  });
}
