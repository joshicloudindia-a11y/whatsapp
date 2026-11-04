import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { sendTypingIndicator } from "@/lib/whatsapp";
import { isWindowOpen } from "../_lib/outbound";

/** Minimum gap between typing indicators per conversation (WhatsApp shows one for ~25 s). */
const THROTTLE_MS = 20_000;
// Best-effort, per server instance. The client throttles too.
const lastSent = new Map<string, number>();

/**
 * POST → shows "typing…" to the customer (Cloud API: mark-as-read with `typing_indicator: { type: "text" }`
 * on the latest inbound wamid). Only inside an open 24h window; never for blocked/opted-out contacts.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOrgMember();
  if ("response" in auth) return auth.response;
  const { member } = auth;
  const { id } = await params;

  const now = Date.now();
  const prev = lastSent.get(id) ?? 0;
  if (now - prev < THROTTLE_MS) return NextResponse.json({ sent: false, reason: "throttled" });

  const conv = await prisma.conversation.findFirst({
    where: { id, organizationId: member.organizationId },
    select: {
      sessionExpiresAt: true,
      contact: { select: { isBlocked: true, optedOut: true } },
      whatsappAccount: { select: { accessToken: true, phoneNumberId: true, isActive: true } },
    },
  });
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!isWindowOpen(conv) || conv.contact.isBlocked || conv.contact.optedOut || !conv.whatsappAccount.isActive) {
    return NextResponse.json({ sent: false, reason: "not_allowed" });
  }

  const lastInbound = await prisma.message.findFirst({
    where: { conversationId: id, direction: "INBOUND", wamid: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { wamid: true },
  });
  if (!lastInbound?.wamid) return NextResponse.json({ sent: false, reason: "no_inbound" });

  lastSent.set(id, now);
  if (lastSent.size > 5000) for (const [k, t] of lastSent) if (now - t > THROTTLE_MS) lastSent.delete(k);
  try {
    await sendTypingIndicator(lastInbound.wamid, conv.whatsappAccount.accessToken, conv.whatsappAccount.phoneNumberId);
    // The indicator also marks the chat read on WhatsApp.
    await prisma.conversation.update({ where: { id }, data: { isRead: true } }).catch(() => undefined);
    return NextResponse.json({ sent: true });
  } catch (e) {
    return NextResponse.json({ sent: false, reason: e instanceof Error ? e.message : "failed" });
  }
}
