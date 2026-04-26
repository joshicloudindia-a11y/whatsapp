import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireSuperAdmin() {
  const session = await getServerSession(authOptions);
  if (!session) return null;
  // Always verify from DB — JWT may be stale
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { isSuperAdmin: true } });
  return user?.isSuperAdmin ? session : null;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const plans = await prisma.planConfig.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({ plans });
}

export async function POST(req: NextRequest) {
  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "Super admin only" }, { status: 403 });

  const body = await req.json();
  const {
    name, slug, description, monthlyPrice, annualPrice, currency,
    isActive, isPopular, sortOrder, maxUsers, maxBroadcasts,
    maxAutomations, maxApiCalls, maxAiCredits, maxWhatsappNumbers,
    features, stripePriceMonthly, stripePriceAnnual,
  } = body;

  try {
    const plan = await prisma.planConfig.create({
      data: {
        name,
        slug: slug ?? name.toLowerCase().replace(/\s+/g, "-"),
        description,
        monthlyPrice: Number(monthlyPrice ?? 0),
        annualPrice: Number(annualPrice ?? 0),
        currency: currency ?? "USD",
        isActive: isActive ?? true,
        isPopular: isPopular ?? false,
        sortOrder: Number(sortOrder ?? 0),
        maxUsers: Number(maxUsers ?? 3),
        maxBroadcasts: Number(maxBroadcasts ?? 15000),
        maxAutomations: Number(maxAutomations ?? 1000),
        maxApiCalls: Number(maxApiCalls ?? 10000),
        maxAiCredits: Number(maxAiCredits ?? 250),
        maxWhatsappNumbers: Number(maxWhatsappNumbers ?? 1),
        features: features ?? [],
        stripePriceMonthly,
        stripePriceAnnual,
      },
    });
    return NextResponse.json({ plan }, { status: 201 });
  } catch (e: any) {
    if (e.code === "P2002") return NextResponse.json({ error: "Plan name/slug already exists" }, { status: 409 });
    return NextResponse.json({ error: "Failed to create plan" }, { status: 500 });
  }
}
