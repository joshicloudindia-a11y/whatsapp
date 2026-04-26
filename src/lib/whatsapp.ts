const META_API_BASE = "https://graph.facebook.com/v19.0";

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

export function verifyWebhookSignature(body: string, signature: string, secret: string): boolean {
  const crypto = require("crypto");
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return `sha256=${expected}` === signature;
}

export function parseWebhookMessage(entry: any) {
  try {
    const changes = entry.changes?.[0]?.value;
    if (!changes) return null;

    const messages = changes.messages;
    const statuses = changes.statuses;
    const phoneNumberId = changes.metadata?.phone_number_id;

    return { messages, statuses, phoneNumberId, contacts: changes.contacts };
  } catch {
    return null;
  }
}
