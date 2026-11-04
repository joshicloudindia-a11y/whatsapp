import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";

const TIMEZONES = new Set(Intl.supportedValuesOf("timeZone"));

export async function GET() {
  const { member, response } = await requireOrgMember();
  if (!member) return response;

  const org = await prisma.organization.findUnique({
    where: { id: member.organizationId },
    select: {
      id: true, name: true, slug: true, website: true, timezone: true, logo: true, plan: true, trialEndsAt: true, createdAt: true,
      _count: { select: { members: { where: { isActive: true } }, contacts: true, conversations: true, whatsappAccounts: true, templates: true, broadcasts: true } },
    },
  });
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ organization: org, canEdit: member.role === "ADMIN" });
}

export async function PATCH(req: NextRequest) {
  const { member, response } = await requireOrgMember({ admin: true });
  if (!member) return response;

  const body = (await req.json().catch(() => null)) ?? {};
  const data: { name?: string; website?: string | null; timezone?: string; logo?: string | null } = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim().replace(/\s+/g, " ").slice(0, 120);
    if (name.length < 2) return NextResponse.json({ error: "Organization name must be at least 2 characters" }, { status: 400 });
    data.name = name;
  }
  for (const k of ["website", "logo"] as const) {
    if (body[k] === undefined) continue;
    const v = String(body[k] ?? "").trim();
    if (v && !/^https?:\/\/[^\s]+\.[^\s]+$/i.test(v)) return NextResponse.json({ error: `${k === "logo" ? "Logo URL" : "Website"} must start with http:// or https://` }, { status: 400 });
    data[k] = v ? v.slice(0, 255) : null;
  }
  if (body.timezone !== undefined) {
    if (!TIMEZONES.has(String(body.timezone))) return NextResponse.json({ error: "Unknown timezone" }, { status: 400 });
    data.timezone = String(body.timezone);
  }
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const organization = await prisma.organization.update({
    where: { id: member.organizationId },
    data,
    select: { id: true, name: true, slug: true, website: true, timezone: true, logo: true },
  });
  return NextResponse.json({ organization });
}
