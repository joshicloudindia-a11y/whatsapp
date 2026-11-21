import { prisma } from "@/lib/prisma";

const REPLY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Counts a contact's FIRST inbound message after a broadcast (within 7 days) as a reply to that
 * broadcast, so Broadcast.repliedCount and the campaign reports reflect real replies. Never throws.
 */
export async function recordBroadcastReply({ organizationId, contactId, messageId }: { organizationId: string; contactId: string; messageId: string }) {
  try {
    const recipient = await prisma.broadcastRecipient.findFirst({
      where: {
        contactId,
        status: { in: ["SENT", "DELIVERED", "READ"] },
        sentAt: { gte: new Date(Date.now() - REPLY_WINDOW_MS) },
        broadcast: { organizationId },
      },
      orderBy: { sentAt: "desc" },
      select: { broadcastId: true, sentAt: true },
    });
    if (!recipient?.sentAt) return;
    const earlier = await prisma.message.count({
      where: { organizationId, direction: "INBOUND", conversation: { contactId }, createdAt: { gt: recipient.sentAt }, id: { not: messageId } },
    });
    if (earlier > 0) return; // already counted on their first reply
    await prisma.broadcast.update({ where: { id: recipient.broadcastId }, data: { repliedCount: { increment: 1 } } });
  } catch (e) {
    console.error("[broadcast] reply tracking failed", e);
  }
}
