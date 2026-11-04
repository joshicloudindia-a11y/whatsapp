import type { Prisma } from "@prisma/client";
import { WEBHOOK_EVENT_IDS, isWebhookEvent, type WebhookEvent } from "@/lib/outgoing-webhooks";

export const endpointSelect = {
  id: true, name: true, url: true, events: true, isActive: true, failureCount: true, lastTriggeredAt: true, createdAt: true, updatedAt: true,
} satisfies Prisma.WebhookEndpointSelect;

export function cleanName(input: unknown, fallbackUrl?: string) {
  const n = typeof input === "string" ? input.trim().replace(/\s+/g, " ").slice(0, 60) : "";
  if (n) return n;
  if (fallbackUrl) {
    try { return new URL(fallbackUrl).hostname.slice(0, 60); } catch { /* ignore */ }
  }
  return "Webhook";
}

export function cleanEvents(input: unknown): WebhookEvent[] | null {
  if (!Array.isArray(input)) return null;
  const set = new Set(input.filter(isWebhookEvent));
  return WEBHOOK_EVENT_IDS.filter((e) => set.has(e));
}
