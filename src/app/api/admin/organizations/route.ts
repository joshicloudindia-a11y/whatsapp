import { NextRequest, NextResponse } from "next/server";
import type { Plan, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit, requireAdmin } from "@/lib/admin-auth";
import { slugify } from "@/lib/utils";

const PLANS: Plan[] = ["TRIAL", "GROWTH", "PRO", "BUSINESS"];

export async function GET(req: NextRequest) {
  const { ctx, response } = await requireAdmin("orgs:read");
  if (!ctx) return response;

  const { searchParams } = req.nextUrl;
  const search = (searchParams.get("search") ?? "").slice(0, 100);
  const plan = searchParams.get("plan");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20") || 20));

  const where: Prisma.OrganizationWhereInput = {};
  if (search) where.OR = [{ name: { contains: search } }, { slug: { contains: search } }];
  if (plan && PLANS.includes(plan as Plan)) where.plan = plan as Plan;

  const [organizations, total] = await Promise.all([
    prisma.organization.findMany({
      where,
      include: {
        _count: { select: { members: true, conversations: true, broadcasts: true, whatsappAccounts: true } },
        subscription: { select: { plan: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.organization.count({ where }),
  ]);

  return NextResponse.json({ organizations, total, page, limit });
}

export async function POST(req: NextRequest) {
  const { ctx, response } = await requireAdmin("orgs:create");
  if (!ctx) return response;

  const body = (await req.json().catch(() => null)) ?? {};
  const name = String(body.name ?? "").trim().slice(0, 120);
  const plan = (body.plan ?? "TRIAL") as Plan;
  const slug = slugify(String(body.slug || name)).slice(0, 60);
  const website = body.website ? String(body.website).trim().slice(0, 255) : null;
  const timezone = body.timezone ? String(body.timezone).slice(0, 64) : undefined;

  if (!name) return NextResponse.json({ error: "Organization name is required" }, { status: 400 });
  if (!slug) return NextResponse.json({ error: "Valid slug is required" }, { status: 400 });
  if (!PLANS.includes(plan)) return NextResponse.json({ error: "Invalid plan" }, { status: 400 });

  try {
    const organization = await prisma.organization.create({
      data: {
        name, slug, plan, website, ...(timezone && { timezone }),
        trialEndsAt: plan === "TRIAL" ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) : null,
        subscription: { create: { plan, status: plan === "TRIAL" ? "TRIALING" : "ACTIVE" } },
      },
    });
    await audit(ctx, "org.create", { entity: "Organization", entityId: organization.id, metadata: { name, slug, plan } });
    return NextResponse.json({ organization }, { status: 201 });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "Slug already taken" }, { status: 409 });
    }
    console.error("[admin] org create failed", e);
    return NextResponse.json({ error: "Failed to create organization" }, { status: 500 });
  }
}
