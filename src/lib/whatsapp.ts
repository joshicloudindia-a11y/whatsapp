import crypto from "crypto";

// v19.0 is deprecated by Meta. Override with META_GRAPH_API_VERSION if needed.
const META_GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || "v24.0";
const META_API_BASE = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;

export interface SendTextPayload {
  to: string;
  text: string;
  accessToken: string;
  phoneNumberId: string;
}

export interface SendTemplatePayload {
  to: string;
  templateName: string;
  languageCode: string;
  components?: object[];
  accessToken: string;
  phoneNumberId: string;
}

export interface SendMediaPayload {
  to: string;
  type: "image" | "video" | "document" | "audio";
  url: string;
  caption?: string;
  filename?: string;
  accessToken: string;
  phoneNumberId: string;
}

export interface SendInteractivePayload {
  to: string;
  interactive: object;
  accessToken: string;
  phoneNumberId: string;
}

async function metaPost(phoneNumberId: string, accessToken: string, body: object) {
  const res = await fetch(`${META_API_BASE}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? "Meta API error");
  return data;
}

export async function sendTextMessage({ to, text, accessToken, phoneNumberId }: SendTextPayload) {
  return metaPost(phoneNumberId, accessToken, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { preview_url: false, body: text },
  });
}

export async function sendTemplateMessage({
  to,
  templateName,
  languageCode,
  components = [],
  accessToken,
  phoneNumberId,
}: SendTemplatePayload) {
  return metaPost(phoneNumberId, accessToken, {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      components,
    },
  });
}

export async function sendMediaMessage({
  to,
  type,
  url,
  caption,
  filename,
  accessToken,
  phoneNumberId,
}: SendMediaPayload) {
  const mediaObj: Record<string, string> = { link: url };
  if (caption) mediaObj.caption = caption;
  if (filename) mediaObj.filename = filename;

  return metaPost(phoneNumberId, accessToken, {
    messaging_product: "whatsapp",
    to,
    type,
    [type]: mediaObj,
  });
}

export async function sendInteractiveMessage({
  to,
  interactive,
  accessToken,
  phoneNumberId,
}: SendInteractivePayload) {
  return metaPost(phoneNumberId, accessToken, {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive,
  });
}

export async function markMessageRead(wamid: string, accessToken: string, phoneNumberId: string) {
  return metaPost(phoneNumberId, accessToken, {
    messaging_product: "whatsapp",
    status: "read",
    message_id: wamid,
  });
}

export async function submitTemplate(
  wabaId: string,
  accessToken: string,
  template: {
    name: string;
    category: string;
    language: string;
    components: object[];
  }
) {
  const res = await fetch(`${META_API_BASE}/${wabaId}/message_templates`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(template),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? "Template submission failed");
  return data;
}

export async function getTemplateStatus(templateId: string, accessToken: string) {
  const res = await fetch(`${META_API_BASE}/${templateId}?fields=status,quality_score,rejected_reason`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.json();
}

/**
 * Validates Meta's X-Hub-Signature-256 header (HMAC-SHA256 of the raw body using the App Secret).
 * Uses a constant-time comparison to avoid timing attacks.
 */
export function verifyWebhookSignature(body: string, signature: string, secret: string): boolean {
  if (!signature?.startsWith("sha256=") || !secret) return false;
  const expected = Buffer.from(
    "sha256=" + crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex"),
    "utf8"
  );
  const received = Buffer.from(signature, "utf8");
  if (expected.length !== received.length) return false;
  return crypto.timingSafeEqual(expected, received);
}

/* eslint-disable @typescript-eslint/no-explicit-any -- raw Meta webhook payloads; typed by the webhook route */
export interface ParsedWebhookChange {
  messages?: any[];
  statuses?: any[];
  phoneNumberId?: string;
  contacts?: any[];
}

/** Returns every "messages" change in an entry (Meta can batch several per entry). */
export function parseWebhookMessage(entry: any): ParsedWebhookChange[] {
  const result: ParsedWebhookChange[] = [];
  for (const change of entry?.changes ?? []) {
    if (change?.field && change.field !== "messages") continue;
    const value = change?.value;
    if (!value) continue;
    result.push({
      messages: value.messages,
      statuses: value.statuses,
      phoneNumberId: value.metadata?.phone_number_id,
      contacts: value.contacts,
    });
  }
  return result;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface PhoneNumberInfo {
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  messaging_limit_tier?: string;
}

/** Validates a Phone Number ID + token pair against Meta and returns the number's details. */
export async function getPhoneNumberInfo(phoneNumberId: string, accessToken: string): Promise<PhoneNumberInfo> {
  const res = await fetch(
    `${META_API_BASE}/${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name,quality_rating,messaging_limit_tier`,
    { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message ?? "Could not verify the number with Meta");
  return data;
}

/** Subscribes our Meta app to the WABA so webhook events are delivered. */
export async function subscribeAppToWaba(wabaId: string, accessToken: string): Promise<boolean> {
  const res = await fetch(`${META_API_BASE}/${encodeURIComponent(wabaId)}/subscribed_apps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json().catch(() => ({}));
  return res.ok && data?.success !== false;
}

// ─── Message template management (WhatsApp Business Management API) ──────────

/** Extracts the most helpful message from a Graph API error body. */
export function metaErrorMessage(data: unknown, fallback = "Meta API error"): string {
  const e = (data as { error?: { message?: string; error_user_title?: string; error_user_msg?: string } })?.error;
  if (!e) return fallback;
  if (e.error_user_msg) return e.error_user_title ? `${e.error_user_title}: ${e.error_user_msg}` : e.error_user_msg;
  return e.message ?? fallback;
}

export interface MetaTemplateRecord {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  rejected_reason?: string;
  components?: Record<string, unknown>[];
}

/** Creates a template. Returns Meta's id, initial status and (possibly re-classified) category. */
export async function createMessageTemplate(
  wabaId: string,
  accessToken: string,
  template: { name: string; category: string; language: string; components: object[] }
): Promise<{ id: string; status?: string; category?: string }> {
  const res = await fetch(`${META_API_BASE}/${encodeURIComponent(wabaId)}/message_templates`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(template),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.id) throw new Error(metaErrorMessage(data, "Template submission failed"));
  return data;
}

/** Edits an existing template (allowed for rejected/paused, and approved within Meta's edit limits). */
export async function editMessageTemplate(
  templateId: string,
  accessToken: string,
  update: { category?: string; components: object[] }
): Promise<{ success: boolean }> {
  const res = await fetch(`${META_API_BASE}/${encodeURIComponent(templateId)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(update),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) throw new Error(metaErrorMessage(data, "Template update failed"));
  return { success: true };
}

/** Lists every template on a WABA, following pagination (capped to avoid runaway loops). */
export async function listMessageTemplates(wabaId: string, accessToken: string, maxPages = 20): Promise<MetaTemplateRecord[]> {
  const out: MetaTemplateRecord[] = [];
  let url: string | null =
    `${META_API_BASE}/${encodeURIComponent(wabaId)}/message_templates?fields=name,status,category,language,components,id,rejected_reason&limit=100`;
  for (let page = 0; url && page < maxPages; page++) {
    const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(metaErrorMessage(data, "Could not fetch templates from Meta"));
    out.push(...((data?.data ?? []) as MetaTemplateRecord[]));
    url = typeof data?.paging?.next === "string" ? data.paging.next : null;
  }
  return out;
}

/**
 * Deletes a template on Meta. With `hsmId` only that language version is deleted;
 * by name alone Meta deletes every language of the template.
 */
export async function deleteMessageTemplate(wabaId: string, accessToken: string, name: string, hsmId?: string | null) {
  const qs = new URLSearchParams({ name });
  if (hsmId) qs.set("hsm_id", hsmId);
  const res = await fetch(`${META_API_BASE}/${encodeURIComponent(wabaId)}/message_templates?${qs}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) throw new Error(metaErrorMessage(data, "Could not delete the template on Meta"));
  return { success: true };
}

// ─── [media] WhatsApp-hosted media (upload / lookup / send by id) ────────────

export type WaMediaKind = "image" | "video" | "audio" | "document";

export interface MetaMediaInfo {
  id: string;
  url: string;
  mime_type?: string;
  file_size?: number;
  sha256?: string;
}

/**
 * Looks up a WhatsApp media id. Returns the short-lived download `url` (needs the
 * same bearer token to fetch) or the raw Graph error so callers can map it.
 */
export async function getMediaInfo(
  mediaId: string,
  accessToken: string,
  phoneNumberId?: string,
): Promise<{ ok: true; info: MetaMediaInfo } | { ok: false; status: number; error: unknown }> {
  const qs = phoneNumberId ? `?phone_number_id=${encodeURIComponent(phoneNumberId)}` : "";
  const res = await fetch(`${META_API_BASE}/${encodeURIComponent(mediaId)}${qs}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.url) return { ok: false, status: res.status, error: data };
  return { ok: true, info: data as MetaMediaInfo };
}

/** Uploads a file to WhatsApp's media store and returns the media id. */
export async function uploadMedia({
  file, filename, mimeType, accessToken, phoneNumberId,
}: { file: Blob; filename: string; mimeType: string; accessToken: string; phoneNumberId: string }): Promise<string> {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mimeType);
  form.append("file", new Blob([await file.arrayBuffer()], { type: mimeType }), filename);
  const res = await fetch(`${META_API_BASE}/${encodeURIComponent(phoneNumberId)}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.id) throw new Error(metaErrorMessage(data, "Could not upload the file to WhatsApp"));
  return String(data.id);
}

/** Sends a media message that references an uploaded WhatsApp media id. */
export async function sendMediaById({
  to, type, mediaId, caption, filename, accessToken, phoneNumberId,
}: { to: string; type: WaMediaKind; mediaId: string; caption?: string; filename?: string; accessToken: string; phoneNumberId: string }) {
  const mediaObj: Record<string, string> = { id: mediaId };
  // WhatsApp does not accept captions on audio.
  if (caption && type !== "audio") mediaObj.caption = caption;
  if (filename && type === "document") mediaObj.filename = filename;
  return metaPost(phoneNumberId, accessToken, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type,
    [type]: mediaObj,
  });
}

// ─── [chat] Rich chat sends (reply context, reactions, typing, location, contacts) ─

export interface SendRichMessagePayload {
  to: string;
  /** Cloud API message type, e.g. "text", "image", "location", "contacts", "interactive". */
  type: "text" | "image" | "video" | "audio" | "document" | "sticker" | "location" | "contacts" | "interactive";
  /** The object placed under `[type]` (an array for `contacts`). */
  content: object;
  /** wamid of the message being replied to → `context.message_id` (quoted reply). */
  contextMessageId?: string | null;
  accessToken: string;
  phoneNumberId: string;
}

/** Sends any free-form message type, optionally as a contextual (quoted) reply. */
export async function sendRichMessage({ to, type, content, contextMessageId, accessToken, phoneNumberId }: SendRichMessagePayload) {
  return metaPost(phoneNumberId, accessToken, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    ...(contextMessageId && { context: { message_id: contextMessageId } }),
    type,
    [type]: content,
  });
}

/**
 * Reacts to a message (`emoji` = "" removes the business's reaction).
 * Reactions can't be contextual replies and fail for targets older than 30 days.
 */
export async function sendReaction({ to, messageId, emoji, accessToken, phoneNumberId }: {
  to: string; messageId: string; emoji: string; accessToken: string; phoneNumberId: string;
}) {
  return metaPost(phoneNumberId, accessToken, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "reaction",
    reaction: { message_id: messageId, emoji },
  });
}

/**
 * Marks an inbound message read AND shows the "typing…" indicator to the customer.
 * WhatsApp clears it when we reply or after ~25 seconds.
 */
export async function sendTypingIndicator(wamid: string, accessToken: string, phoneNumberId: string) {
  return metaPost(phoneNumberId, accessToken, {
    messaging_product: "whatsapp",
    status: "read",
    message_id: wamid,
    typing_indicator: { type: "text" },
  });
}

/** Downloads a WhatsApp-hosted media file (used to re-upload when forwarding). */
export async function downloadMedia(mediaId: string, accessToken: string, phoneNumberId?: string): Promise<{ blob: Blob; mimeType: string }> {
  const lookup = await getMediaInfo(mediaId, accessToken, phoneNumberId);
  if (!lookup.ok) throw new Error(metaErrorMessage(lookup.error, "This media is no longer available on WhatsApp"));
  const res = await fetch(lookup.info.url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  if (!res.ok) throw new Error("Could not download the media from WhatsApp");
  const blob = await res.blob();
  return { blob, mimeType: lookup.info.mime_type ?? blob.type ?? "application/octet-stream" };
}

// ─── Embedded Signup (Tech Provider onboarding) ──────────────────────────────

export const GRAPH_VERSION = META_GRAPH_API_VERSION;

async function graphGet<T = Record<string, unknown>>(path: string, accessToken?: string): Promise<T> {
  const res = await fetch(`${META_API_BASE}/${path}`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(metaErrorMessage(data, "Meta API error"));
  return data as T;
}

async function graphPost<T = Record<string, unknown>>(path: string, accessToken: string, body: object): Promise<T> {
  const res = await fetch(`${META_API_BASE}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(metaErrorMessage(data, "Meta API error"));
  return data as T;
}

/** Server-to-server: exchanges the 30-second Embedded Signup code for the customer's business token. */
export async function exchangeEmbeddedSignupCode(code: string): Promise<string> {
  const appId = process.env.META_APP_ID, secret = process.env.META_APP_SECRET;
  if (!appId || !secret) throw new Error("META_APP_ID / META_APP_SECRET are not configured");
  const q = new URLSearchParams({ client_id: appId, client_secret: secret, code });
  const data = await graphGet<{ access_token?: string }>(`oauth/access_token?${q}`);
  if (!data.access_token) throw new Error("Meta did not return an access token");
  return data.access_token;
}

/** WABA ids the business token was granted (fallback when the signup session info didn't arrive). */
export async function grantedWabaIds(accessToken: string): Promise<string[]> {
  const appToken = `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`;
  const q = new URLSearchParams({ input_token: accessToken, access_token: appToken });
  const data = await graphGet<{ data?: { granular_scopes?: { scope: string; target_ids?: string[] }[] } }>(`debug_token?${q}`);
  const scope = data.data?.granular_scopes?.find((s) => s.scope === "whatsapp_business_management");
  return scope?.target_ids ?? [];
}

export interface WabaPhoneNumber extends PhoneNumberInfo { id: string }

export async function listWabaPhoneNumbers(wabaId: string, accessToken: string): Promise<WabaPhoneNumber[]> {
  const data = await graphGet<{ data?: WabaPhoneNumber[] }>(
    `${encodeURIComponent(wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,messaging_limit_tier`,
    accessToken,
  );
  return data.data ?? [];
}

/** Registers the number on Cloud API; `pin` becomes its two-step verification PIN. */
export async function registerPhoneNumber(phoneNumberId: string, accessToken: string, pin: string) {
  return graphPost(`${encodeURIComponent(phoneNumberId)}/register`, accessToken, { messaging_product: "whatsapp", pin });
}

// ─── Business profile (WhatsApp Business Management API) ─────────────────────

export const BUSINESS_VERTICALS = [
  "UNDEFINED", "OTHER", "AUTO", "BEAUTY", "APPAREL", "EDU", "ENTERTAIN", "EVENT_PLAN", "FINANCE", "GROCERY", "GOVT",
  "HOTEL", "HEALTH", "NONPROFIT", "PROF_SERVICES", "RETAIL", "TRAVEL", "RESTAURANT",
] as const;

export interface BusinessProfile {
  about?: string; address?: string; description?: string; email?: string;
  websites?: string[]; vertical?: string; profile_picture_url?: string;
}

export async function getBusinessProfile(phoneNumberId: string, accessToken: string): Promise<BusinessProfile> {
  const data = await graphGet<{ data?: BusinessProfile[] }>(
    `${encodeURIComponent(phoneNumberId)}/whatsapp_business_profile?fields=about,address,description,email,profile_picture_url,websites,vertical`,
    accessToken,
  );
  return data.data?.[0] ?? {};
}

export async function updateBusinessProfile(phoneNumberId: string, accessToken: string, profile: Omit<BusinessProfile, "profile_picture_url">) {
  return graphPost(`${encodeURIComponent(phoneNumberId)}/whatsapp_business_profile`, accessToken, { messaging_product: "whatsapp", ...profile });
}

// ─── Marketing Messages API for WhatsApp ─────────────────────────────────────

/** "ONBOARDED" | "ELIGIBLE" | other/unknown. Only ONBOARDED WABAs may use /marketing_messages. */
export async function getMarketingMessagesStatus(wabaId: string, accessToken: string): Promise<string> {
  const data = await graphGet<{ marketing_messages_onboarding_status?: string | { status?: string } }>(
    `${encodeURIComponent(wabaId)}?fields=marketing_messages_onboarding_status`,
    accessToken,
  );
  const s = data.marketing_messages_onboarding_status;
  return (typeof s === "string" ? s : s?.status) ?? "UNKNOWN";
}

/** Sends a marketing template through the Marketing Messages API (optimized delivery). */
export async function sendMarketingTemplateMessage({ to, templateName, languageCode, components = [], accessToken, phoneNumberId }: SendTemplatePayload) {
  return graphPost<{ messages?: { id: string }[] }>(`${encodeURIComponent(phoneNumberId)}/marketing_messages`, accessToken, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: { name: templateName, language: { code: languageCode }, components },
  });
}
