import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { MAX_ENDPOINTS, WEBHOOK_EVENTS, assertPublicHost, generateWebhookSecret, validateWebhookUrl } from "@/lib/outgoing-webhooks";
import { cleanEvents, cleanName, endpointSelect } from "./_shared";

export const dynamic = "force-dynamic";

/** GET → { endpoints, events, limit } (secrets are never listed). */
export async function GET() {
  const { member, response } = await requireOrgMember({ admin: true });
  if (!member) return response;
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { organizationId: member.organizationId },
    select: { ...endpointSelect, _count: { select: { deliveries: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ endpoints, events: WEBHOOK_EVENTS, limit: MAX_ENDPOINTS });
}

/** POST { name?, url, events[] } → 201 { endpoint, secret } — the secret is returned in full here. */
export async function POST(req: NextRequest) {
  const { member, response } = await requireOrgMember({ admin: true });
  if (!member) return response;
  const body = (await req.json().catch(() => null)) ?? {};

  const v = validateWebhookUrl(body.url);
  if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });
  const hostError = await assertPublicHost(v.url);
  if (hostError) return NextResponse.json({ error: hostError }, { status: 400 });

  const events = cleanEvents(body.events);
  if (!events?.length) return NextResponse.json({ error: "Choose at least one event" }, { status: 400 });

  const count = await prisma.webhookEndpoint.count({ where: { organizationId: member.organizationId } });
  if (count >= MAX_ENDPOINTS) return NextResponse.json({ error: `You can add up to ${MAX_ENDPOINTS} webhook endpoints.` }, { status: 400 });

  const secret = generateWebhookSecret();
  const endpoint = await prisma.webhookEndpoint.create({
    data: { organizationId: member.organizationId, name: cleanName(body.name, v.url), url: v.url, events, secret },
    select: endpointSelect,
  });
  return NextResponse.json({ endpoint, secret }, { status: 201 });
}
