import crypto from "crypto";
import { lookup } from "dns/promises";
import net from "net";
import type { Contact, ContactTag, Message, Prisma, WebhookEndpoint } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Outgoing (customer-facing) webhooks.
 *
 * Every delivery is a POST with a JSON body `{ id, event, createdAt, data }` and headers:
 *   X-ChatFlow-Event, X-ChatFlow-Delivery (= body.id), X-ChatFlow-Timestamp (unix seconds),
 *   X-ChatFlow-Signature: sha256=<hex HMAC-SHA256 of the raw request body, keyed with the endpoint secret>
 *
 * Nothing exported here throws: it is safe to call inside `after()` or fire-and-forget.
 */

export const WEBHOOK_EVENTS = [
  { id: "message.received", label: "Message received", description: "A customer sent you a message" },
  { id: "message.sent", label: "Message sent", description: "An outbound message was accepted by WhatsApp" },
  { id: "message.status", label: "Message status", description: "An outbound message was delivered, read or failed" },
  { id: "contact.created", label: "Contact created", description: "A new contact was added" },
  { id: "conversation.resolved", label: "Conversation resolved", description: "A conversation was marked as resolved" },
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]["id"];
export const WEBHOOK_EVENT_IDS = WEBHOOK_EVENTS.map((e) => e.id) as WebhookEvent[];
export const isWebhookEvent = (e: unknown): e is WebhookEvent => typeof e === "string" && (WEBHOOK_EVENT_IDS as string[]).includes(e);

const TIMEOUT_MS = 5000;
const MAX_ATTEMPTS = 2; // one quick retry on network errors / 5xx / 429
const RESPONSE_SNIPPET = 1000;
const AUTO_DISABLE_AFTER = 100; // consecutive failures
export const MAX_ENDPOINTS = 10;

export function generateWebhookSecret() {
  return "whsec_" + crypto.randomBytes(24).toString("base64url");
}

export function signPayload(rawBody: string, secret: string) {
  return "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

// ─── SSRF protection ────────────────────────────────────────────────────────

function isPrivateIPv4(ip: string) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  const [a, b] = p;
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && p[2] === 0) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

export function isPrivateIp(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) return isPrivateIPv4(ip);
  if (v === 6) {
    const x = ip.toLowerCase().replace(/^\[|\]$/g, "");
    if (x === "::" || x === "::1") return true;
    const mapped = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIPv4(mapped[1]);
    if (/^::ffff:/.test(x)) return true; // hex-form mapped addresses
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(x) || x.startsWith("64:ff9b:") || x.startsWith("2001:db8");
  }
  return true;
}

const BLOCKED_HOST = /(^|\.)(localhost|local|internal|localdomain|home\.arpa)$/i;

/** Synchronous check: https only, no credentials, no localhost / private IP literals. Returns the normalized URL or an error. */
export function validateWebhookUrl(input: unknown): { url: string } | { error: string } {
  if (typeof input !== "string" || !input.trim()) return { error: "Enter the endpoint URL" };
  if (input.length > 500) return { error: "URL is too long" };
  let u: URL;
  try { u = new URL(input.trim()); } catch { return { error: "Enter a valid URL, e.g. https://example.com/webhooks/chatflow" }; }
  if (u.protocol !== "https:") return { error: "Webhook URLs must use https://" };
  if (u.username || u.password) return { error: "URLs with credentials are not allowed" };
  if (u.port && u.port !== "443" && u.port !== "8443") return { error: "Only ports 443 and 8443 are allowed" };
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (!host.includes(".") && !net.isIP(host)) return { error: "Use a public domain name" };
  if (BLOCKED_HOST.test(host)) return { error: "Local and internal hosts are not allowed" };
  if (net.isIP(host) && isPrivateIp(host)) return { error: "Private and reserved IP addresses are not allowed" };
  u.hash = "";
  return { url: u.toString() };
}

/** Resolves the host and rejects it if any address is private (guards against DNS pointing inside our network). */
export async function assertPublicHost(url: string): Promise<string | null> {
  const v = validateWebhookUrl(url);
  if ("error" in v) return v.error;
  const host = new URL(v.url).hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) return null;
  try {
    const addrs = await lookup(host, { all: true, verbatim: true });
    if (!addrs.length) return "Host did not resolve";
    if (addrs.some((a) => isPrivateIp(a.address))) return "Host resolves to a private address";
    return null;
  } catch {
    return "Host could not be resolved";
  }
}

// ─── Public data shapes (shared with API v1) ─────────────────────────────────

export function toApiMessage(m: Pick<Message, "id" | "wamid" | "conversationId" | "direction" | "type" | "status" | "content" | "templateName" | "mediaUrl" | "failureReason" | "createdAt" | "updatedAt">, phone?: string) {
  return {
    id: m.id,
    wamid: m.wamid,
    conversationId: m.conversationId,
    direction: m.direction.toLowerCase(),
    type: m.type.toLowerCase(),
    status: m.status.toLowerCase(),
    to: m.direction === "OUTBOUND" ? phone ?? null : null,
    from: m.direction === "INBOUND" ? phone ?? null : null,
    content: m.content,
    templateName: m.templateName,
    mediaUrl: m.mediaUrl,
    failureReason: m.failureReason,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

export function toApiContact(c: Pick<Contact, "id" | "phone" | "name" | "email" | "stage" | "optedOut" | "isBlocked" | "lastSeenAt" | "createdAt" | "updatedAt"> & { tags?: Pick<ContactTag, "tag">[] }) {
  return {
    id: c.id,
    phone: c.phone,
    name: c.name,
    email: c.email,
    stage: c.stage,
    tags: (c.tags ?? []).map((t) => t.tag),
    optedOut: c.optedOut,
    isBlocked: c.isBlocked,
    lastSeenAt: c.lastSeenAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

// ─── Delivery ───────────────────────────────────────────────────────────────

export interface DeliveryResult { success: boolean; statusCode: number | null; error?: string; duration: number }

async function attempt(endpoint: Pick<WebhookEndpoint, "id" | "url" | "secret">, event: string, envelope: object, rawBody: string, attemptNo: number): Promise<DeliveryResult> {
  const started = Date.now();
  let statusCode: number | null = null;
  let responseBody = "";
  let error: string | undefined;

  const hostError = await assertPublicHost(endpoint.url);
  if (hostError) {
    error = `Blocked: ${hostError}`;
  } else {
    try {
      const ts = Math.floor(Date.now() / 1000).toString();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "User-Agent": "ChatFlow-Webhooks/1.0",
        "X-ChatFlow-Event": event,
        "X-ChatFlow-Delivery": (envelope as { id: string }).id,
        "X-ChatFlow-Timestamp": ts,
        "X-ChatFlow-Attempt": String(attemptNo),
      };
      if (endpoint.secret) headers["X-ChatFlow-Signature"] = signPayload(rawBody, endpoint.secret);
      const res = await fetch(endpoint.url, {
        method: "POST",
        headers,
        body: rawBody,
        redirect: "manual", // never follow redirects (could point at internal hosts)
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
      statusCode = res.status;
      responseBody = (await res.text().catch(() => "")).slice(0, RESPONSE_SNIPPET);
      if (res.status >= 300 && res.status < 400) error = "Redirects are not followed";
    } catch (e) {
      const name = (e as Error)?.name;
      error = name === "TimeoutError" || name === "AbortError" ? `Timed out after ${TIMEOUT_MS / 1000}s` : `Request failed: ${(e as Error)?.message ?? "network error"}`;
    }
  }

  const duration = Date.now() - started;
  const success = !error && statusCode !== null && statusCode >= 200 && statusCode < 300;

  await prisma.webhookDelivery
    .create({
      data: {
        webhookEndpointId: endpoint.id,
        event,
        payload: { attempt: attemptNo, body: envelope } as Prisma.InputJsonValue,
        statusCode,
        responseBody: (error ? `[${error}] ` : "") + responseBody || null,
        success,
        duration,
      },
    })
    .catch((e) => console.error("[outgoing-webhooks] failed to record delivery", e));

  return { success, statusCode, error, duration };
}

/** Delivers one event to one endpoint (with one retry for transient failures) and updates its health counters. */
export async function deliverToEndpoint(endpoint: Pick<WebhookEndpoint, "id" | "url" | "secret">, event: string, data: unknown): Promise<DeliveryResult> {
  try {
    const envelope = { id: "evt_" + crypto.randomBytes(12).toString("hex"), event, createdAt: new Date().toISOString(), data };
    const rawBody = JSON.stringify(envelope);
    let result = await attempt(endpoint, event, envelope, rawBody, 1);
    const transient = !result.success && !result.error?.startsWith("Blocked") && (result.statusCode === null || result.statusCode >= 500 || result.statusCode === 429);
    if (transient && MAX_ATTEMPTS > 1) {
      await new Promise((r) => setTimeout(r, 1000));
      result = await attempt(endpoint, event, envelope, rawBody, 2);
    }

    if (result.success) {
      await prisma.webhookEndpoint.update({ where: { id: endpoint.id }, data: { lastTriggeredAt: new Date(), failureCount: 0 } });
    } else {
      const ep = await prisma.webhookEndpoint.update({
        where: { id: endpoint.id },
        data: { lastTriggeredAt: new Date(), failureCount: { increment: 1 } },
        select: { failureCount: true },
      });
      if (ep.failureCount >= AUTO_DISABLE_AFTER) {
        await prisma.webhookEndpoint.update({ where: { id: endpoint.id }, data: { isActive: false } });
      }
    }
    return result;
  } catch (e) {
    console.error("[outgoing-webhooks] delivery error", endpoint.id, e);
    return { success: false, statusCode: null, error: "Internal error", duration: 0 };
  }
}

function subscribedTo(events: Prisma.JsonValue, event: string) {
  return Array.isArray(events) && (events.includes(event) || events.includes("*"));
}

/**
 * Sends `event` to every active endpoint of the organization subscribed to it. Never throws.
 * Usage: `after(() => dispatchOrgEvent(orgId, "message.sent", data))`.
 */
export async function dispatchOrgEvent(organizationId: string, event: WebhookEvent | "ping", data: unknown): Promise<void> {
  try {
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, url: true, secret: true, events: true },
    });
    const targets = endpoints.filter((e) => subscribedTo(e.events, event));
    if (!targets.length) return;
    await Promise.allSettled(targets.map((ep) => deliverToEndpoint(ep, event, data)));
  } catch (e) {
    console.error("[outgoing-webhooks] dispatch failed", event, e);
  }
}

// ─── Convenience emitters for existing code paths (all never throw) ──────────

const messageSelect = {
  id: true, wamid: true, conversationId: true, direction: true, type: true, status: true, content: true,
  templateName: true, mediaUrl: true, failureReason: true, createdAt: true, updatedAt: true, organizationId: true,
  conversation: { select: { contact: { select: { id: true, phone: true, name: true } } } },
} as const;

async function emitForMessage(where: Prisma.MessageWhereInput, event: WebhookEvent) {
  try {
    const m = await prisma.message.findFirst({ where, select: messageSelect });
    if (!m) return;
    const contact = m.conversation.contact;
    await dispatchOrgEvent(m.organizationId, event, { message: toApiMessage(m, contact.phone), contact: { id: contact.id, phone: contact.phone, name: contact.name } });
  } catch (e) {
    console.error("[outgoing-webhooks] emit failed", event, e);
  }
}

/** Inbound message stored → `message.received`. */
export const emitMessageReceived = (messageId: string) => emitForMessage({ id: messageId }, "message.received");

/** Outbound message stored and accepted by Meta → `message.sent`. */
export const emitMessageSent = (messageId: string) => emitForMessage({ id: messageId }, "message.sent");

/** Status webhook applied (delivered / read / failed) → `message.status`. Pass the wamid. */
export async function emitMessageStatus(wamid: string, status: string) {
  if (!["delivered", "read", "failed", "DELIVERED", "READ", "FAILED"].includes(status)) return;
  await emitForMessage({ wamid, direction: "OUTBOUND" }, "message.status");
}

/** New contact row → `contact.created`. */
export async function emitContactCreated(contactId: string) {
  try {
    const c = await prisma.contact.findUnique({ where: { id: contactId }, include: { tags: { select: { tag: true } } } });
    if (c) await dispatchOrgEvent(c.organizationId, "contact.created", { contact: toApiContact(c) });
  } catch (e) {
    console.error("[outgoing-webhooks] emit failed contact.created", e);
  }
}

/** Conversation status changed to RESOLVED → `conversation.resolved`. */
export async function emitConversationResolved(conversationId: string, resolvedByUserId?: string | null) {
  try {
    const c = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, organizationId: true, status: true, assignedAgentId: true, lastMessageAt: true, updatedAt: true, contact: { select: { id: true, phone: true, name: true } } },
    });
    if (!c || c.status !== "RESOLVED") return;
    await dispatchOrgEvent(c.organizationId, "conversation.resolved", {
      conversation: {
        id: c.id,
        status: "resolved",
        assignedAgentId: c.assignedAgentId,
        resolvedByUserId: resolvedByUserId ?? null,
        lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
        resolvedAt: c.updatedAt.toISOString(),
      },
      contact: c.contact,
    });
  } catch (e) {
    console.error("[outgoing-webhooks] emit failed conversation.resolved", e);
  }
}
