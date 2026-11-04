import type { Message, Prisma, WhatsappAccount } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { metaErrorMessage, sendInteractiveMessage } from "@/lib/whatsapp";
import { pusherServer, PUSHER_EVENTS, conversationChannel, orgChannel } from "@/lib/pusher";
import { findOrCreateContact, findOrCreateConversation } from "@/lib/messaging";
import { CALL_EVENTS } from "@/lib/calling-events";

/**
 * WhatsApp Business Calling API (Cloud API, Graph signaling + WebRTC media).
 *
 * Docs this follows:
 *  - Overview / eligibility   https://developers.facebook.com/documentation/business-messaging/whatsapp/calling
 *  - Call settings            https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/call-settings
 *  - User-initiated calls     https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/user-initiated-calls
 *  - Business-initiated calls https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/business-initiated-calls
 *  - User call permissions    https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/user-call-permissions
 *  - Troubleshooting (codes)  https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/troubleshooting
 *
 * Signaling:
 *  POST /{phone-number-id}/calls  { messaging_product, to, action: "connect", session: { sdp_type: "offer", sdp } }   business → user
 *  POST /{phone-number-id}/calls  { messaging_product, call_id, action: "pre_accept"|"accept", session: { sdp_type: "answer", sdp } }
 *  POST /{phone-number-id}/calls  { messaging_product, call_id, action: "reject"|"terminate" }
 *  Webhook field "calls": value.calls[] (event connect | terminate) and value.statuses[] (type "call", RINGING | ACCEPTED | REJECTED).
 *
 * Call log: no schema of its own. Each call is ONE Message row (type SYSTEM) whose templateData.call holds the state below.
 * Transient SDP (offerSdp / answerSdp) lives in templateData.call while the call is set up and is removed when it ends.
 */

// Same base as src/lib/whatsapp.ts (not exported there).
const META_GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || "v24.0";
const META_API_BASE = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;
const FETCH_TIMEOUT_MS = 10_000;

export const CALLING_DOCS_URL = "https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/call-settings";

/** Custom realtime events on the org channel (kept out of src/lib/pusher.ts). */
export { CALL_EVENTS };

export type CallStatus = "ringing" | "connected" | "missed" | "rejected" | "ended" | "failed";
export type CallVia = "whatsapp" | "phone" | "video_link";
export type CallDirection = "inbound" | "outbound";

export interface CallRecord {
  /** WhatsApp call id (wacid.…) for via "whatsapp"; a local id for phone / video_link. */
  id: string;
  direction: CallDirection;
  status: CallStatus;
  via: CallVia;
  startedAt: string;
  connectedAt?: string | null;
  endedAt?: string | null;
  durationSec?: number | null;
  /** Free-form extras, e.g. the meeting URL for video_link. */
  url?: string | null;
  error?: string | null;
  /** Business-initiated: Meta reported the customer's phone is ringing. */
  deviceRinging?: boolean;
  acceptedByUserId?: string | null;
  startedByUserId?: string | null;
  /** WebRTC SDP while the call is being set up (removed once it ends). */
  offerSdp?: string | null;
  answerSdp?: string | null;
}

const FINAL: CallStatus[] = ["missed", "rejected", "ended", "failed"];
export const isFinalStatus = (s: CallStatus) => FINAL.includes(s);

export class CallingError extends Error {
  constructor(message: string, public status = 400, public code?: number | string, public details?: unknown) {
    super(message);
  }
}

type Account = Pick<WhatsappAccount, "id" | "organizationId" | "phoneNumberId" | "accessToken">;

// ─── Graph helpers ───────────────────────────────────────────────────────────

async function graph<T = Record<string, unknown>>(method: "GET" | "POST", path: string, accessToken: string, body?: object): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${META_API_BASE}/${path}`, {
      method,
      headers: { Authorization: `Bearer ${accessToken}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (e) {
    throw new CallingError(`Couldn't reach Meta: ${e instanceof Error ? e.message : "network error"}`, 502);
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: { code?: number; error_subcode?: number; error_data?: unknown } };
  if (!res.ok || (data as { error?: unknown }).error) {
    const code = data.error?.code;
    throw new CallingError(friendlyCallingError(code, metaErrorMessage(data, `Meta API error (${res.status})`)), res.status >= 500 ? 502 : 400, code, data.error?.error_data);
  }
  return data;
}

/** Adds actionable hints to the Calling API error codes listed on the troubleshooting page. */
export function friendlyCallingError(code: number | undefined, message: string): string {
  const hints: Record<number, string> = {
    138000: "Calling isn't enabled on this number. Enable it in WhatsApp Manager → Phone numbers → Call settings, or from ChatFlow (admin).",
    138001: "This customer can't receive WhatsApp calls (not on WhatsApp, old app, or unsupported device).",
    138003: "A call with this customer is already in progress.",
    138005: "Too many calls were started from this number. Try again later.",
    138006: "The customer hasn't given permission to be called. Send a call permission request first.",
    138007: "The call couldn't be connected in time (SDP not applied). Please retry.",
    138009: "Call permission request limit reached for this customer (1 per 24h, 2 per 7 days; a connected call resets it).",
    138012: "Business-initiated call limit for this customer reached (100 connected calls per 24h).",
    138013: "Business-initiated calling isn't available for this number (not supported in its country).",
    138014: "Calling was temporarily disabled for this number by Meta due to low call quality.",
    138015: "Calling can't be enabled: the number's messaging limit must be at least 2,000 unique customers per day.",
    138017: "The customer already granted permanent call permission.",
    138018: "Technical prerequisites not met: subscribe your app to the \"calls\" webhook field (or configure SIP).",
    131030: "Test numbers can only call / send call permission requests to numbers on the allowed list.",
    131044: "Calling needs a valid payment method on the WhatsApp Business Account.",
    131055: "This number uses SIP, so Graph API calling is not available.",
  };
  const hint = code ? hints[code] : undefined;
  return hint ? `${hint} (Meta: ${message})` : message;
}

export interface CallingSettings {
  status?: "ENABLED" | "DISABLED";
  call_icon_visibility?: "DEFAULT" | "DISABLE_ALL";
  callback_permission_status?: "ENABLED" | "DISABLED";
  call_hours?: unknown;
  sip?: { status?: "ENABLED" | "DISABLED" };
  restrictions?: { restrictions_list?: { type?: string; reason?: string; expiration?: number }[] };
  [k: string]: unknown;
}

/** GET /{phone-number-id}/settings → the `calling` block. */
export async function getCallingSettings(account: Pick<Account, "phoneNumberId" | "accessToken">): Promise<CallingSettings | null> {
  const data = await graph<{ calling?: CallingSettings }>("GET", `${encodeURIComponent(account.phoneNumberId)}/settings`, account.accessToken);
  return data.calling ?? null;
}

/** POST /{phone-number-id}/settings { calling: {...} }. Only the keys given are sent. */
export async function updateCallingSettings(
  account: Pick<Account, "phoneNumberId" | "accessToken">,
  calling: Partial<Pick<CallingSettings, "status" | "call_icon_visibility" | "callback_permission_status">>,
) {
  const res = await graph<{ success?: boolean }>("POST", `${encodeURIComponent(account.phoneNumberId)}/settings`, account.accessToken, { calling });
  statusCache.delete(account.phoneNumberId);
  return res;
}

export interface CallingStatus {
  enabled: boolean;
  /** Human-readable reason when not enabled / restricted (Meta's words where available). */
  reason: string | null;
  code: number | string | null;
  settings: { status: string | null; callIconVisibility: string | null; callbackPermission: string | null; sip: string | null } | null;
  restrictions: { type?: string; reason?: string; expiration?: number }[];
  businessInitiatedAllowed: boolean;
  userInitiatedAllowed: boolean;
  docsUrl: string;
  checkedAt: string;
}

const statusCache = new Map<string, { at: number; value: CallingStatus }>();
const STATUS_TTL_MS = 60_000;

/** Eligibility for one number, cached 60 s. Never throws. */
export async function getCallingStatus(account: Pick<Account, "phoneNumberId" | "accessToken">, opts: { fresh?: boolean } = {}): Promise<CallingStatus> {
  const hit = statusCache.get(account.phoneNumberId);
  if (!opts.fresh && hit && Date.now() - hit.at < STATUS_TTL_MS) return hit.value;

  const base = { docsUrl: CALLING_DOCS_URL, checkedAt: new Date().toISOString() };
  let value: CallingStatus;
  try {
    const s = await getCallingSettings(account);
    const restrictions = s?.restrictions?.restrictions_list ?? [];
    const sipOn = s?.sip?.status === "ENABLED";
    const on = s?.status === "ENABLED";
    const biRestricted = restrictions.some((r) => r.type === "RESTRICTED_BUSINESS_INITIATED_CALLING");
    const uiRestricted = restrictions.some((r) => r.type === "RESTRICTED_USER_INITIATED_CALLING");
    const reason = !s
      ? "Meta returned no calling settings for this number."
      : !on
        ? "Calling is disabled for this number (calling.status is DISABLED)."
        : sipOn
          ? "This number routes calls over SIP, so in-browser calling isn't available."
          : restrictions.length
            ? restrictions.map((r) => r.reason ?? r.type).filter(Boolean).join("; ")
            : null;
    value = {
      ...base,
      enabled: on && !sipOn,
      reason,
      code: null,
      settings: s
        ? { status: s.status ?? null, callIconVisibility: s.call_icon_visibility ?? null, callbackPermission: s.callback_permission_status ?? null, sip: s.sip?.status ?? null }
        : null,
      restrictions,
      businessInitiatedAllowed: on && !sipOn && !biRestricted,
      userInitiatedAllowed: on && !sipOn && !uiRestricted && s?.call_icon_visibility !== "DISABLE_ALL",
    };
  } catch (e) {
    const err = e instanceof CallingError ? e : null;
    value = {
      ...base,
      enabled: false,
      reason: err?.message ?? (e instanceof Error ? e.message : "Couldn't read calling settings"),
      code: err?.code ?? null,
      settings: null,
      restrictions: [],
      businessInitiatedAllowed: false,
      userInitiatedAllowed: false,
    };
  }
  statusCache.set(account.phoneNumberId, { at: Date.now(), value });
  return value;
}

export interface CallPermission {
  status: "no_permission" | "temporary" | "permanent" | "unknown";
  expirationTime: number | null;
  canStartCall: boolean | null;
  canRequestPermission: boolean | null;
  limits: unknown;
  error?: string;
}

/** GET /{phone-number-id}/call_permissions?user_wa_id=… Never throws. */
export async function getCallPermission(account: Pick<Account, "phoneNumberId" | "accessToken">, userWaId: string): Promise<CallPermission> {
  try {
    const data = await graph<{
      permission?: { status?: string; expiration_time?: number };
      actions?: { action_name?: string; can_perform_action?: boolean; limits?: unknown }[];
    }>("GET", `${encodeURIComponent(account.phoneNumberId)}/call_permissions?user_wa_id=${encodeURIComponent(userWaId)}`, account.accessToken);
    const act = (n: string) => data.actions?.find((a) => a.action_name === n);
    const st = data.permission?.status;
    return {
      status: st === "temporary" || st === "permanent" || st === "no_permission" ? st : "unknown",
      expirationTime: data.permission?.expiration_time ?? null,
      canStartCall: act("start_call")?.can_perform_action ?? null,
      canRequestPermission: act("send_call_permission_request")?.can_perform_action ?? null,
      limits: data.actions?.map((a) => ({ action: a.action_name, limits: a.limits })) ?? null,
    };
  } catch (e) {
    return { status: "unknown", expirationTime: null, canStartCall: null, canRequestPermission: null, limits: null, error: e instanceof Error ? e.message : "Couldn't read call permission" };
  }
}

/** Free-form interactive call_permission_request (only inside the 24 h customer service window). */
export async function sendCallPermissionRequest(account: Pick<Account, "phoneNumberId" | "accessToken">, to: string, bodyText?: string) {
  try {
    return await sendInteractiveMessage({
      to,
      accessToken: account.accessToken,
      phoneNumberId: account.phoneNumberId,
      interactive: {
        type: "call_permission_request",
        action: { name: "call_permission_request" },
        ...(bodyText ? { body: { text: bodyText } } : {}),
      },
    });
  } catch (e) {
    throw new CallingError(e instanceof Error ? e.message : "Couldn't send the call permission request", 400);
  }
}

/** Business-initiated call: POST /{phone-number-id}/calls action "connect" with an SDP offer. Returns the WhatsApp call id. */
export async function initiateCall(account: Pick<Account, "phoneNumberId" | "accessToken">, to: string, sdpOffer: string, bizOpaque?: string): Promise<string> {
  const data = await graph<{ calls?: { id?: string }[] }>("POST", `${encodeURIComponent(account.phoneNumberId)}/calls`, account.accessToken, {
    messaging_product: "whatsapp",
    to,
    action: "connect",
    session: { sdp_type: "offer", sdp: sdpOffer },
    ...(bizOpaque ? { biz_opaque_callback_data: bizOpaque.slice(0, 512) } : {}),
  });
  const id = data.calls?.[0]?.id;
  if (!id) throw new CallingError("Meta didn't return a call id", 502);
  return id;
}

export type CallAction = "pre_accept" | "accept" | "reject" | "terminate";

/** pre_accept / accept need an SDP answer; reject / terminate have no session. */
export async function callAction(account: Pick<Account, "phoneNumberId" | "accessToken">, callId: string, action: CallAction, sdpAnswer?: string) {
  const needsSdp = action === "pre_accept" || action === "accept";
  if (needsSdp && !sdpAnswer) throw new CallingError("An SDP answer is required", 400);
  return graph<{ success?: boolean }>("POST", `${encodeURIComponent(account.phoneNumberId)}/calls`, account.accessToken, {
    messaging_product: "whatsapp",
    call_id: callId,
    action,
    ...(needsSdp ? { session: { sdp_type: "answer", sdp: sdpAnswer } } : {}),
  });
}

// ─── Call log (Message rows) ─────────────────────────────────────────────────

export function readCall(templateData: unknown): CallRecord | null {
  const c = (templateData as { call?: CallRecord } | null)?.call;
  return c && typeof c === "object" && typeof c.id === "string" ? c : null;
}

export function formatDuration(sec: number | null | undefined) {
  if (!sec || sec < 0) return "0:00";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export function callContent(c: Pick<CallRecord, "status" | "direction" | "via" | "durationSec">): string {
  if (c.via === "video_link") return "Video meeting link sent";
  if (c.via === "phone") return "Phone call (dialed from agent's phone)";
  switch (c.status) {
    case "ringing":
      return c.direction === "inbound" ? "Incoming voice call" : "Calling…";
    case "connected":
      return "Voice call · in progress";
    case "ended":
      return `Voice call · ${formatDuration(c.durationSec)}`;
    case "missed":
      return c.direction === "inbound" ? "Missed voice call" : "No answer · voice call";
    case "rejected":
      return "Declined voice call";
    case "failed":
      return "Voice call failed";
  }
}

/** Strips SDP before sending a call to browsers / outgoing payloads. */
export function publicCall(c: CallRecord) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { offerSdp, answerSdp, ...rest } = c;
  return rest;
}

const newLocalId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
export const localCallId = newLocalId;

export async function createCallMessage(opts: {
  organizationId: string;
  conversationId: string;
  call: CallRecord;
  sentByUserId?: string | null;
  markUnread?: boolean;
}): Promise<Message> {
  const { call } = opts;
  const message = await prisma.message.create({
    data: {
      conversationId: opts.conversationId,
      organizationId: opts.organizationId,
      direction: call.direction === "inbound" ? "INBOUND" : "OUTBOUND",
      type: "SYSTEM",
      status: call.direction === "inbound" ? "DELIVERED" : "SENT",
      content: callContent(call),
      templateData: { call } as unknown as Prisma.InputJsonValue,
      sentByUserId: opts.sentByUserId ?? null,
    },
  });
  await prisma.conversation
    .update({ where: { id: opts.conversationId }, data: { lastMessageAt: new Date(), ...(opts.markUnread ? { isRead: false } : {}) } })
    .catch(() => undefined);
  await notify(opts.organizationId, opts.conversationId, message, call, true);
  return message;
}

async function notify(organizationId: string, conversationId: string, message: Message, call: CallRecord, isNew: boolean) {
  const payload = { messageId: message.id, conversationId, call: publicCall(call) };
  await pusherServer.trigger(conversationChannel(conversationId), isNew ? PUSHER_EVENTS.NEW_MESSAGE : PUSHER_EVENTS.MESSAGE_STATUS_UPDATE, { message: { ...message, templateData: { call: publicCall(call) } } });
  await pusherServer.trigger(orgChannel(organizationId), CALL_EVENTS.UPDATED, payload);
  await pusherServer.trigger(orgChannel(organizationId), PUSHER_EVENTS.CONVERSATION_UPDATED, { conversationId, lastMessage: message.content });
}

/**
 * Merges `patch` into templateData.call under a row lock so concurrent webhooks / agent actions don't clobber each other.
 * A final status (missed/rejected/ended/failed) is never moved back to ringing/connected.
 */
export async function updateCallMessage(
  messageId: string,
  patch: Partial<CallRecord> | ((c: CallRecord) => Partial<CallRecord> | null),
): Promise<{ message: Message; call: CallRecord } | null> {
  const apply = async (tx: Prisma.TransactionClient, lock: boolean) => {
    if (lock) await tx.$queryRaw`SELECT id FROM Message WHERE id = ${messageId} FOR UPDATE`;
    const row = await tx.message.findUnique({ where: { id: messageId } });
    const current = row && readCall(row.templateData);
    if (!row || !current) return null;
    const p = typeof patch === "function" ? patch(current) : patch;
    if (!p) return { message: row, call: current, changed: false };
    if (p.status && isFinalStatus(current.status) && !isFinalStatus(p.status)) delete p.status;
    const next: CallRecord = { ...current, ...p };
    if (isFinalStatus(next.status)) {
      delete next.offerSdp;
      delete next.answerSdp;
    }
    const prevData = (row.templateData ?? {}) as Record<string, unknown>;
    const message = await tx.message.update({
      where: { id: messageId },
      data: { content: callContent(next), templateData: { ...prevData, call: next } as unknown as Prisma.InputJsonValue },
    });
    return { message, call: next, changed: true };
  };

  let res: Awaited<ReturnType<typeof apply>>;
  try {
    res = await prisma.$transaction((tx) => apply(tx, true), { timeout: 10_000 });
  } catch (e) {
    console.warn("[calling] locked update failed, retrying without lock:", e instanceof Error ? e.message : e);
    res = await prisma.$transaction((tx) => apply(tx, false));
  }
  if (!res) return null;
  if (res.changed) {
    await prisma.conversation.update({ where: { id: res.message.conversationId }, data: { lastMessageAt: new Date() } }).catch(() => undefined);
    await notify(res.message.organizationId, res.message.conversationId, res.message, res.call, false);
  }
  return { message: res.message, call: res.call };
}

/** Finds the call Message for a WhatsApp call id (searches the last 24 h of SYSTEM messages in the org). */
export async function findCallMessage(organizationId: string, waCallId: string) {
  return prisma.message.findFirst({
    where: {
      organizationId,
      type: "SYSTEM",
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      templateData: { path: "$.call.id", equals: waCallId },
    },
    orderBy: { createdAt: "desc" },
  });
}

// ─── Webhook: field "calls" ──────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
const unix = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : null;
};

/**
 * Handles one `change.value` whose `change.field === "calls"`. NEVER throws.
 *  - value.calls[]    event "connect" (USER_INITIATED: SDP offer; BUSINESS_INITIATED: SDP answer) and event "terminate"
 *  - value.statuses[] type "call", status RINGING | ACCEPTED | REJECTED (business-initiated)
 */
export async function handleCallsWebhook(value: any, waAccount: WhatsappAccount): Promise<void> {
  try {
    if (!value || !waAccount) return;
    const contacts: any[] = Array.isArray(value.contacts) ? value.contacts : [];
    const valueErrors: any[] = Array.isArray(value.errors) ? value.errors : [];

    for (const call of Array.isArray(value.calls) ? value.calls : []) {
      try {
        if (call?.event === "connect") await onConnect(call, waAccount, contacts);
        else if (call?.event === "terminate") await onTerminate(call, waAccount, valueErrors);
      } catch (err) {
        console.error("[calling] webhook call event failed:", call?.id, call?.event, err);
      }
    }

    for (const st of Array.isArray(value.statuses) ? value.statuses : []) {
      try {
        if (st?.type === "call" || String(st?.id ?? "").startsWith("wacid.")) await onCallStatus(st, waAccount);
      } catch (err) {
        console.error("[calling] webhook call status failed:", st?.id, err);
      }
    }
  } catch (err) {
    console.error("[calling] handleCallsWebhook failed:", err);
  }
}

/** Convenience for the main webhook: dispatches every `calls` change in an entry (looks up the account itself). Never throws. */
export async function handleCallsEntry(entry: any): Promise<void> {
  try {
    for (const change of entry?.changes ?? []) {
      if (change?.field !== "calls" || !change.value) continue;
      const phoneNumberId = change.value.metadata?.phone_number_id;
      const waAccount = await prisma.whatsappAccount.findFirst({ where: phoneNumberId ? { phoneNumberId } : { wabaId: entry.id } });
      if (!waAccount) {
        console.warn(`[calling] No WhatsApp account for phoneNumberId=${phoneNumberId} wabaId=${entry?.id}`);
        continue;
      }
      await handleCallsWebhook(change.value, waAccount);
    }
  } catch (err) {
    console.error("[calling] handleCallsEntry failed:", err);
  }
}

const sdpOf = (call: any): string | null => call?.session?.sdp ?? call?.connection?.webrtc?.sdp ?? null;

async function onConnect(call: any, waAccount: WhatsappAccount, contacts: any[]) {
  const callId: string | undefined = call?.id;
  if (!callId) return;
  const direction = String(call.direction ?? "").toUpperCase();

  if (direction === "BUSINESS_INITIATED") {
    const msg = await findCallMessage(waAccount.organizationId, callId);
    if (!msg) return console.warn("[calling] connect for unknown outbound call", callId);
    const sdp = sdpOf(call);
    await updateCallMessage(msg.id, (c) => (isFinalStatus(c.status) ? null : { answerSdp: sdp ?? c.answerSdp ?? null }));
    return;
  }

  // USER_INITIATED: a customer is calling us. Meta may redeliver – dedupe on call id.
  if (await findCallMessage(waAccount.organizationId, callId)) return;

  const phone = String(call.from ?? contacts[0]?.wa_id ?? "").replace(/\D/g, "");
  if (!phone) return console.warn("[calling] inbound call without caller number (username-only users are not supported yet)", callId);
  const name = contacts.find((c) => c?.wa_id === phone)?.profile?.name ?? contacts[0]?.profile?.name ?? null;

  const { contact } = await findOrCreateContact(waAccount.organizationId, phone, name);
  const { conversation } = await findOrCreateConversation(waAccount.organizationId, contact.id, waAccount.id);
  const startedAt = unix(call.timestamp) ?? new Date().toISOString();

  if (contact.isBlocked) {
    // Blocked contacts are declined automatically.
    await callAction(waAccount, callId, "reject").catch((e) => console.warn("[calling] auto-reject failed:", e?.message));
    await createCallMessage({
      organizationId: waAccount.organizationId,
      conversationId: conversation.id,
      call: { id: callId, direction: "inbound", status: "rejected", via: "whatsapp", startedAt, endedAt: new Date().toISOString(), error: "Contact is blocked – declined automatically" },
    });
    return;
  }

  const message = await createCallMessage({
    organizationId: waAccount.organizationId,
    conversationId: conversation.id,
    markUnread: true,
    call: { id: callId, direction: "inbound", status: "ringing", via: "whatsapp", startedAt, offerSdp: sdpOf(call) },
  });
  await pusherServer.trigger(orgChannel(waAccount.organizationId), CALL_EVENTS.INCOMING, {
    messageId: message.id,
    conversationId: conversation.id,
    contact: { id: contact.id, name: contact.name, phone: contact.phone },
  });
}

async function onTerminate(call: any, waAccount: WhatsappAccount, valueErrors: any[]) {
  const callId: string | undefined = call?.id;
  if (!callId) return;
  const msg = await findCallMessage(waAccount.organizationId, callId);
  if (!msg) return;
  const failed = String(call.status ?? "").toUpperCase() === "FAILED";
  const duration = Number(call.duration);
  const picked = Number.isFinite(duration) && duration > 0;
  const err = (Array.isArray(call.errors) ? call.errors : valueErrors)[0];
  const errText = err ? friendlyCallingError(Number(err.code) || undefined, err.error_data?.details ?? err.message ?? "Call failed") : null;

  await updateCallMessage(msg.id, (c) => {
    const endedAt = unix(call.end_time) ?? c.endedAt ?? new Date().toISOString();
    const connectedAt = unix(call.start_time) ?? c.connectedAt ?? null;
    if (isFinalStatus(c.status) && c.endedAt) {
      // Already closed locally (agent hung up / declined): only take Meta's authoritative duration.
      return c.status === "ended" && picked ? { durationSec: Math.round(duration), endedAt, connectedAt } : null;
    }
    let status: CallStatus;
    let durationSec = 0;
    if (picked) {
      status = "ended";
      durationSec = Math.round(duration);
    } else if (c.status === "connected") {
      status = failed ? "failed" : "ended";
      durationSec = c.connectedAt ? Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(c.connectedAt)) / 1000)) : 0;
    } else {
      status = failed ? "failed" : "missed";
    }
    return { status, endedAt, connectedAt, durationSec, error: errText ?? c.error ?? null };
  });
}

async function onCallStatus(st: any, waAccount: WhatsappAccount) {
  const callId: string | undefined = st?.id;
  if (!callId) return;
  const msg = await findCallMessage(waAccount.organizationId, callId);
  if (!msg) return;
  const s = String(st.status ?? "").toUpperCase();
  if (s === "RINGING") await updateCallMessage(msg.id, (c) => (c.status === "ringing" && !c.deviceRinging ? { deviceRinging: true } : null));
  else if (s === "ACCEPTED") await updateCallMessage(msg.id, (c) => (c.status === "ringing" ? { status: "connected", connectedAt: unix(st.timestamp) ?? new Date().toISOString() } : null));
  else if (s === "REJECTED") await updateCallMessage(msg.id, { status: "rejected", endedAt: unix(st.timestamp) ?? new Date().toISOString(), durationSec: 0 });
}
/* eslint-enable @typescript-eslint/no-explicit-any */
