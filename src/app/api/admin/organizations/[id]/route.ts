import { NextRequest, NextResponse } from "next/server";
import type { Plan, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit, requireAdmin } from "@/lib/admin-auth";
import { normalizeWebsite, slugify } from "@/lib/utils";

type Params = { params: Promise<{ id: string }> };
const PLANS: Plan[] = ["TRIAL", "GROWTH", "PRO", "BUSINESS"];

export async function GET(_req: NextRequest, { params }: Params) {
  const { ctx, response } = await requireAdmin("orgs:read");
  if (!ctx) return response;
  const { id } = await params;

  const org = await prisma.organization.findUnique({
    where: { id },
    include: {
      members: { include: { user: { select: { id: true, name: true, email: true, isActive: true, isSuperAdmin: true } } } },
      subscription: true,
      whatsappAccounts: { select: { id: true, phoneNumber: true, phoneNumberId: true, wabaId: true, displayName: true, isActive: true } },
      _count: { select: { conversations: true, broadcasts: true, contacts: true, templates: true } },
    },
  });

  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ organization: org });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { ctx, response } = await requireAdmin("orgs:write");
  if (!ctx) return response;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) ?? {};

  const data: Prisma.OrganizationUpdateInput = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 120);
    if (!name) return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    data.name = name;
  }
  if (body.slug !== undefined) {
    const slug = slugify(String(body.slug)).slice(0, 60);
    if (!slug) return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
    data.slug = slug;
  }
  if (body.website !== undefined) {
    const website = normalizeWebsite(body.website);
    if (website === undefined) return NextResponse.json({ error: "Enter a valid website, e.g. sunjewellers.com (or leave it empty)" }, { status: 400 });
    data.website = website;
  }
  if (body.timezone !== undefined) data.timezone = String(body.timezone).slice(0, 64);
  if (body.plan !== undefined) {
    if (!PLANS.includes(body.plan)) return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    data.plan = body.plan;
  }
  if (body.trialEndsAt !== undefined) {
    const d = body.trialEndsAt ? new Date(body.trialEndsAt) : null;
    if (d && isNaN(d.getTime())) return NextResponse.json({ error: "Invalid trial end date" }, { status: 400 });
    data.trialEndsAt = d;
  }
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  try {
    const org = await prisma.$transaction(async (tx) => {
      const updated = await tx.organization.update({ where: { id }, data });
      if (data.plan) {
        const plan = data.plan as Plan;
        await tx.subscription.upsert({
          where: { organizationId: id },
          update: { plan, status: plan === "TRIAL" ? "TRIALING" : "ACTIVE" },
          create: { organizationId: id, plan, status: plan === "TRIAL" ? "TRIALING" : "ACTIVE" },
        });
      }
      return updated;
    });
    await audit(ctx, "org.update", { entity: "Organization", entityId: id, metadata: { name: org.name, fields: Object.keys(data) } });
    return NextResponse.json({ organization: org });
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "P2025") return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (code === "P2002") return NextResponse.json({ error: "Slug already taken" }, { status: 409 });
    console.error("[admin] org update failed", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { ctx, response } = await requireAdmin("orgs:delete");
  if (!ctx) return response;
  const { id } = await params;

  const org = await prisma.organization.findUnique({ where: { id }, select: { id: true, name: true, slug: true } });
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Typed confirmation guards against accidental/CSRF-style deletes.
  const confirm = req.nextUrl.searchParams.get("confirm");
  if (confirm !== org.slug) {
    return NextResponse.json({ error: "Type the organization slug to confirm deletion" }, { status: 400 });
  }

  await prisma.organization.delete({ where: { id } });
  await audit(ctx, "org.delete", { entity: "Organization", entityId: id, metadata: { name: org.name, slug: org.slug } });
  return NextResponse.json({ success: true });
}
