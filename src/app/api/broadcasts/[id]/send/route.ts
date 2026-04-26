import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendTemplateMessage } from "@/lib/whatsapp";
import { pusherServer, PUSHER_EVENTS, orgChannel } from "@/lib/pusher";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const broadcast = await prisma.broadcast.findFirst({
    where: { id, organizationId: session.user.organizationId },
    include: {
      template: true,
      whatsappAccount: true,
      recipients: { include: { contact: true }, where: { status: "PENDING" } },
    },
  });

  if (!broadcast) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (broadcast.status === "RUNNING") return NextResponse.json({ error: "Already running" }, { status: 400 });

  await prisma.broadcast.update({
    where: { id: broadcast.id },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  processBroadcast(broadcast, session.user.organizationId).catch(console.error);

  return NextResponse.json({ success: true, message: "Broadcast started" });
}

async function processBroadcast(broadcast: any, organizationId: string) {
  const { whatsappAccount, template, recipients } = broadcast;
  let sent = 0, failed = 0;

  for (const recipient of recipients) {
    try {
      const res = await sendTemplateMessage({
        to: recipient.contact.phone,
        templateName: template.name,
        languageCode: template.language,
        accessToken: whatsappAccount.accessToken,
        phoneNumberId: whatsappAccount.phoneNumberId,
      });

      const wamid = res.messages?.[0]?.id;
      await prisma.broadcastRecipient.update({
        where: { id: recipient.id },
        data: { status: "SENT", wamid, sentAt: new Date() },
      });
      sent++;
    } catch {
      await prisma.broadcastRecipient.update({
        where: { id: recipient.id },
        data: { status: "FAILED", failReason: "Send failed" },
      });
      failed++;
    }

    await prisma.broadcast.update({
      where: { id: broadcast.id },
      data: { sentCount: sent, failedCount: failed },
    });

    await pusherServer.trigger(orgChannel(organizationId), PUSHER_EVENTS.BROADCAST_PROGRESS, {
      broadcastId: broadcast.id,
      sent,
      failed,
      total: broadcast.totalCount,
    });

    await new Promise((r) => setTimeout(r, 100));
  }

  await prisma.broadcast.update({
    where: { id: broadcast.id },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
}
