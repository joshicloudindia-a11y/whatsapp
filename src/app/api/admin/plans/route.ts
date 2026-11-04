import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit, requireAdmin } from "@/lib/admin-auth";
import { sanitizePlanInput } from "@/lib/admin-plans";

export async function GET() {
  const { ctx, response } = await requireAdmin("plans:read");
  if (!ctx) return response;

  const plans = await prisma.planConfig.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ plans });
}

export async function POST(req: NextRequest) {
  const { ctx, response } = await requireAdmin("plans:write");
  if (!ctx) return response;

  const body = (await req.json().catch(() => null)) ?? {};
  if (!body.name || !String(body.name).trim()) {
    return NextResponse.json({ error: "Plan name is required" }, { status: 400 });
  }
  const result = sanitizePlanInput({ ...body, slug: body.slug || String(body.name) });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

  try {
    const plan = await prisma.planConfig.create({
      data: { features: [], ...(result.data as Prisma.PlanConfigCreateInput) },
    });
    await audit(ctx, "plan.create", { entity: "PlanConfig", entityId: plan.id, metadata: { name: plan.name } });
    return NextResponse.json({ plan }, { status: 201 });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "Plan name/slug already exists" }, { status: 409 });
    }
    console.error("[admin] plan create failed", e);
    return NextResponse.json({ error: "Failed to create plan" }, { status: 500 });
  }
}
