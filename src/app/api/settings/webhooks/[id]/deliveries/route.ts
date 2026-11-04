import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";

export const dynamic = "force-dynamic";

/** GET → the 30 most recent delivery attempts for this endpoint. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { member, response } = await requireOrgMember({ admin: true });
  if (!member) return response;
  const { id } = await params;
  const ep = await prisma.webhookEndpoint.findFirst({ where: { id, organizationId: member.organizationId }, select: { id: true } });
  if (!ep) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await prisma.webhookDelivery.findMany({
    where: { webhookEndpointId: id },
    select: { id: true, event: true, payload: true, statusCode: true, responseBody: true, success: true, duration: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  const deliveries = rows.map((d) => {
    const p = d.payload as { attempt?: number; body?: unknown } | null;
    return { ...d, attempt: p?.attempt ?? 1, payload: p?.body ?? p };
  });
  return NextResponse.json({ deliveries });
}
