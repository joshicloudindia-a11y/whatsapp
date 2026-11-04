import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { assertPublicHost, validateWebhookUrl } from "@/lib/outgoing-webhooks";
import { cleanEvents, cleanName, endpointSelect } from "../_shared";

type Ctx = { params: Promise<{ id: string }> };

async function owned(id: string, organizationId: string) {
  return prisma.webhookEndpoint.findFirst({ where: { id, organizationId }, select: { id: true } });
}

/** PATCH { name?, url?, events?, isActive? } */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { member, response } = await requireOrgMember({ admin: true });
  if (!member) return response;
  const { id } = await params;
  if (!(await owned(id, member.organizationId))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) ?? {};
  const data: { name?: string; url?: string; events?: string[]; isActive?: boolean; failureCount?: number } = {};

  if (body.url !== undefined) {
    const v = validateWebhookUrl(body.url);
    if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });
    const hostError = await assertPublicHost(v.url);
    if (hostError) return NextResponse.json({ error: hostError }, { status: 400 });
    data.url = v.url;
  }
  if (body.name !== undefined) data.name = cleanName(body.name, data.url);
  if (body.events !== undefined) {
    const events = cleanEvents(body.events);
    if (!events?.length) return NextResponse.json({ error: "Choose at least one event" }, { status: 400 });
    data.events = events;
  }
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== "boolean") return NextResponse.json({ error: "Invalid value" }, { status: 400 });
    data.isActive = body.isActive;
    if (body.isActive) data.failureCount = 0; // re-enabling gives a fresh start
  }
  if (!Object.keys(data).length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const endpoint = await prisma.webhookEndpoint.update({ where: { id }, data, select: endpointSelect });
  return NextResponse.json({ endpoint });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { member, response } = await requireOrgMember({ admin: true });
  if (!member) return response;
  const { id } = await params;
  const r = await prisma.webhookEndpoint.deleteMany({ where: { id, organizationId: member.organizationId } });
  if (!r.count) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
