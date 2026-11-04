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
