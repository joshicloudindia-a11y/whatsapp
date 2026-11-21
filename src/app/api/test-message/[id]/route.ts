import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** Live status of a message sent from the console (updated by Meta's status webhooks). */
export async function GET(_req: NextRequest, { params }: Params) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  const { id } = await params;
  const message = await prisma.message.findFirst({
    where: { id, organizationId: member.organizationId },
    select: { id: true, status: true, wamid: true, failureReason: true, createdAt: true, updatedAt: true },
  });
  if (!message) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ message }, { headers: { "Cache-Control": "no-store" } });
}
