import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, requireAdmin } from "@/lib/admin-auth";
import { sanitizePlanInput } from "@/lib/admin-plans";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { ctx, response } = await requireAdmin("plans:write");
  if (!ctx) return response;
  const { id } = await params;

  const body = (await req.json().catch(() => null)) ?? {};
  const result = sanitizePlanInput(body);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  if (Object.keys(result.data).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  try {
    const plan = await prisma.planConfig.update({ where: { id }, data: result.data });
    await audit(ctx, "plan.update", { entity: "PlanConfig", entityId: id, metadata: { name: plan.name, fields: Object.keys(result.data) } });
    return NextResponse.json({ plan });
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "P2025") return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    if (code === "P2002") return NextResponse.json({ error: "Plan name/slug already exists" }, { status: 409 });
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { ctx, response } = await requireAdmin("plans:delete");
  if (!ctx) return response;
  const { id } = await params;

  try {
    const plan = await prisma.planConfig.delete({ where: { id } });
    await audit(ctx, "plan.delete", { entity: "PlanConfig", entityId: id, metadata: { name: plan.name } });
    return NextResponse.json({ success: true });
  } catch (e) {
    if ((e as { code?: string }).code === "P2025") return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
