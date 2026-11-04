import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { deliverToEndpoint } from "@/lib/outgoing-webhooks";

export const dynamic = "force-dynamic";

/** POST → sends a signed `ping` event to this endpoint (even if disabled) and returns the result. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { member, response } = await requireOrgMember({ admin: true });
  if (!member) return response;
  const { id } = await params;
  const ep = await prisma.webhookEndpoint.findFirst({
    where: { id, organizationId: member.organizationId },
    select: { id: true, url: true, secret: true, name: true },
  });
  if (!ep) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const result = await deliverToEndpoint(ep, "ping", {
    message: "This is a test event from ChatFlow. Your webhook endpoint is reachable.",
    endpoint: { id: ep.id, name: ep.name },
  });
  return NextResponse.json({ result });
}
