import type { MessageStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendTemplateMessage } from "@/lib/whatsapp";
import { pusherServer, PUSHER_EVENTS, orgChannel } from "@/lib/pusher";
import { resolvePlanConfig } from "@/lib/plans";

const BATCH = 50;
const CONCURRENCY = 5;
/** A runner that hasn't touched the broadcast for this long is considered dead and can be resumed. */
export const STALE_MS = 2 * 60 * 1000;

/** Template placeholder → value source. */
export type VarSource = { source: "name" | "phone" | "email" | "text"; value?: string };

export function placeholdersOf(body: string): string[] {
  return [...new Set(body.match(/\{\{\d+\}\}/g) ?? [])].sort((a, b) => Number(a.slice(2, -2)) - Number(b.slice(2, -2)));
}

export function resolveVars(mapping: VarSource[], contact: { name: string | null; phone: string; email: string | null }) {
  return mapping.map((m) => {
    const v = m.source === "name" ? contact.name || m.value || "there"
      : m.source === "phone" ? contact.phone
      : m.source === "email" ? contact.email || m.value || ""
      : m.value ?? "";
    return String(v).slice(0, 1024);
  });
}

/** Broadcast messages used in the current billing period vs the plan limit. */
export async function broadcastQuota(organizationId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { plan: true, subscription: { select: { plan: true, currentPeriodStart: true } } },
  });
  const now = new Date();
  const since = org?.subscription?.currentPeriodStart ?? new Date(now.getFullYear(), now.getMonth(), 1);
  const plan = org ? await resolvePlanConfig(org.subscription?.plan ?? org.plan) : null;
  const limit = plan?.maxBroadcasts ?? 500;
  const used = (await prisma.broadcast.aggregate({ where: { organizationId, createdAt: { gte: since } }, _sum: { sentCount: true } }))._sum.sentCount ?? 0;
  return { used, limit, remaining: limit >= 999999 ? Infinity : Math.max(0, limit - used) };
}

/**
 * Claims a broadcast (optimistic lock on updatedAt) and sends pending recipients
 * until done or the time budget runs out. Safe to call repeatedly.
 */
export async function runBroadcast(broadcastId: string, budgetMs = 240_000): Promise<"completed" | "partial" | "skipped"> {
  const started = Date.now();
  const cutoff = new Date(Date.now() - STALE_MS);

  // Claim: only if not RUNNING, or RUNNING but stale (previous runner died).
  const claim = await prisma.broadcast.updateMany({
    where: {
      id: broadcastId,
      OR: [{ status: { in: ["SCHEDULED", "DRAFT"] } }, { status: "RUNNING", updatedAt: { lt: cutoff } }, { status: "RUNNING", startedAt: null }],
    },
    data: { status: "RUNNING" },
  });
  if (!claim.count) return "skipped";

  const b = await prisma.broadcast.findUnique({
    where: { id: broadcastId },
    include: { template: true, whatsappAccount: true },
  });
  if (!b || !b.template || !b.whatsappAccount) {
    await prisma.broadcast.update({ where: { id: broadcastId }, data: { status: "FAILED", completedAt: new Date() } });
    return "completed";
  }
  if (!b.startedAt) await prisma.broadcast.update({ where: { id: b.id }, data: { startedAt: new Date() } });

  const placeholders = placeholdersOf(b.template.body);

  while (Date.now() - started < budgetMs) {
    // Respect pause/cancel requested from the UI.
    const current = await prisma.broadcast.findUnique({ where: { id: b.id }, select: { status: true } });
    if (current?.status !== "RUNNING") return "partial";

    const batch = await prisma.broadcastRecipient.findMany({
      where: { broadcastId: b.id, status: "PENDING" },
      include: { contact: { select: { phone: true, optedOut: true, isBlocked: true } } },
      take: BATCH,
    });
    if (!batch.length) break;

    for (let i = 0; i < batch.length; i += CONCURRENCY) {
      await Promise.all(batch.slice(i, i + CONCURRENCY).map(async (r) => {
        if (r.contact.optedOut || r.contact.isBlocked) {
          await prisma.broadcastRecipient.update({ where: { id: r.id }, data: { status: "FAILED", failReason: r.contact.optedOut ? "Contact opted out" : "Contact is blocked" } });
          await prisma.broadcast.update({ where: { id: b.id }, data: { failedCount: { increment: 1 } } });
          return;
        }
        const vars = Array.isArray(r.variables) ? (r.variables as string[]) : [];
        try {
          const res = await sendTemplateMessage({
            to: r.contact.phone,
            templateName: b.template!.name,
            languageCode: b.template!.language,
            components: placeholders.length ? [{ type: "body", parameters: placeholders.map((_, k) => ({ type: "text", text: vars[k] ?? "" })) }] : [],
            accessToken: b.whatsappAccount.accessToken,
            phoneNumberId: b.whatsappAccount.phoneNumberId,
          });
          await prisma.broadcastRecipient.update({ where: { id: r.id }, data: { status: "SENT", wamid: res.messages?.[0]?.id ?? null, sentAt: new Date() } });
          await prisma.broadcast.update({ where: { id: b.id }, data: { sentCount: { increment: 1 } } });
        } catch (e) {
          await prisma.broadcastRecipient.update({ where: { id: r.id }, data: { status: "FAILED", failReason: String((e as Error).message ?? "Send failed").slice(0, 300) } });
          await prisma.broadcast.update({ where: { id: b.id }, data: { failedCount: { increment: 1 } } });
        }
      }));
    }

    const p = await prisma.broadcast.findUnique({ where: { id: b.id }, select: { sentCount: true, failedCount: true, totalCount: true } });
    await pusherServer.trigger(orgChannel(b.organizationId), PUSHER_EVENTS.BROADCAST_PROGRESS, { broadcastId: b.id, sent: p?.sentCount, failed: p?.failedCount, total: p?.totalCount });
  }

  const left = await prisma.broadcastRecipient.count({ where: { broadcastId: b.id, status: "PENDING" } });
  if (left > 0) return "partial"; // stays RUNNING; resumed by the next trigger once stale

  const final = await prisma.broadcast.findUnique({ where: { id: b.id }, select: { sentCount: true, totalCount: true } });
  await prisma.broadcast.update({
    where: { id: b.id },
    data: { status: final && final.sentCount === 0 && final.totalCount > 0 ? "FAILED" : "COMPLETED", completedAt: new Date() },
  });
  return "completed";
}

/** Starts due scheduled broadcasts and resumes stalled ones. Called by cron and by inbox/broadcast page loads. */
export async function processDueBroadcasts(organizationId?: string, totalBudgetMs = 240_000) {
  const deadline = Date.now() + totalBudgetMs;
  const due = await prisma.broadcast.findMany({
    where: {
      ...(organizationId && { organizationId }),
      OR: [
        { status: "SCHEDULED", scheduledAt: { lte: new Date() } },
        { status: "RUNNING", updatedAt: { lt: new Date(Date.now() - STALE_MS) } },
      ],
    },
    select: { id: true },
    take: 5,
  });
  for (const d of due) {
    const left = deadline - Date.now();
    if (left < 15_000) break; // keep well inside the function's max duration
    await runBroadcast(d.id, left).catch((e) => console.error("[broadcast] run failed", d.id, e));
  }
  return due.length;
}

const RANK: Record<MessageStatus, number> = { PENDING: 0, SENT: 1, DELIVERED: 2, READ: 3, FAILED: 4 };

/** Applies a WhatsApp delivery status to a broadcast recipient and its counters (forward-only). */
export async function applyRecipientStatus(wamid: string, next: MessageStatus, at: Date, reason?: string) {
  const r = await prisma.broadcastRecipient.findFirst({ where: { wamid }, select: { id: true, status: true, broadcastId: true } });
  if (!r) return;
  if (next === "FAILED") {
    if (r.status === "FAILED") return;
    await prisma.$transaction([
      prisma.broadcastRecipient.update({ where: { id: r.id }, data: { status: "FAILED", failReason: reason ?? "Failed after sending" } }),
      prisma.broadcast.update({ where: { id: r.broadcastId }, data: { failedCount: { increment: 1 }, ...(r.status !== "PENDING" && { sentCount: { decrement: 1 } }) } }),
    ]);
    return;
  }
  if (RANK[next] <= RANK[r.status] || r.status === "FAILED") return;
  const inc: { deliveredCount?: { increment: number }; readCount?: { increment: number } } = {};
  if (RANK[r.status] < RANK.DELIVERED && RANK[next] >= RANK.DELIVERED) inc.deliveredCount = { increment: 1 };
  if (next === "READ") inc.readCount = { increment: 1 };
  await prisma.$transaction([
    prisma.broadcastRecipient.update({
      where: { id: r.id },
      data: { status: next, ...(RANK[next] >= RANK.DELIVERED && { deliveredAt: at }), ...(next === "READ" && { readAt: at }) },
    }),
    ...(Object.keys(inc).length ? [prisma.broadcast.update({ where: { id: r.broadcastId }, data: inc })] : []),
  ]);
}
