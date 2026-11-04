import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { generateWebhookSecret } from "@/lib/outgoing-webhooks";

/** POST { action: "reveal" | "rotate" } → { secret }. Admin only; POST so it is never cached or prefetched. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { member, response } = await requireOrgMember({ admin: true });
  if (!member) return response;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) ?? {};

  const ep = await prisma.webhookEndpoint.findFirst({ where: { id, organizationId: member.organizationId }, select: { id: true, secret: true } });
  if (!ep) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let secret = ep.secret;
  if (body.action === "rotate" || !secret) {
    secret = generateWebhookSecret();
    await prisma.webhookEndpoint.update({ where: { id }, data: { secret } });
  } else if (body.action !== "reveal") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  return NextResponse.json({ secret }, { headers: { "Cache-Control": "no-store" } });
}
