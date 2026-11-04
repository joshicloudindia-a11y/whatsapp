import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { broadcastQuota, runBroadcast } from "@/lib/broadcast-runner";

export const maxDuration = 300;

/** POST { retryFailed?: boolean } → starts, resumes or retries a broadcast in the background. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  if (!["ADMIN", "CAMPAIGN_MANAGER"].includes(member.role)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const { id } = await params;
  const body = (await req.json().catch(() => null)) ?? {};

  const b = await prisma.broadcast.findFirst({
    where: { id, organizationId: member.organizationId },
    select: { id: true, status: true, whatsappAccount: { select: { isActive: true } } },
  });
  if (!b) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (b.status === "RUNNING") return NextResponse.json({ error: "Already sending" }, { status: 400 });
  if (!b.whatsappAccount.isActive) return NextResponse.json({ error: "The WhatsApp number for this broadcast is disabled" }, { status: 400 });

  if (body.retryFailed) {
    const r = await prisma.broadcastRecipient.updateMany({
      where: { broadcastId: id, status: "FAILED", NOT: { failReason: { in: ["Contact opted out", "Contact is blocked"] } } },
      data: { status: "PENDING", failReason: null },
    });
    if (!r.count) return NextResponse.json({ error: "No retryable failed recipients" }, { status: 400 });
    await prisma.broadcast.update({ where: { id }, data: { failedCount: { decrement: r.count }, completedAt: null } });
  }

  const pending = await prisma.broadcastRecipient.count({ where: { broadcastId: id, status: "PENDING" } });
  if (!pending) return NextResponse.json({ error: "Nothing left to send" }, { status: 400 });
  const quota = await broadcastQuota(member.organizationId);
  if (pending > quota.remaining) return NextResponse.json({ error: `Only ${quota.remaining} messages left on your plan this period` }, { status: 402 });

  // Make it claimable by the runner, then process after the response is sent.
  await prisma.broadcast.update({ where: { id }, data: { status: "SCHEDULED", scheduledAt: new Date() } });
  after(() => runBroadcast(id).then(() => undefined).catch((e) => console.error("[broadcast]", e)));
  return NextResponse.json({ success: true, pending });
}
