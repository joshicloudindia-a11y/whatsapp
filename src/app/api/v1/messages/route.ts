import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  MessagingError,
  findOrCreateContact,
  findOrCreateConversation,
  parseIntlPhone,
  resolveWhatsappAccount,
  sendOutboundMessage,
  type OutboundInput,
} from "@/lib/messaging";
import { emitContactCreated, emitMessageSent, toApiMessage } from "@/lib/outgoing-webhooks";
import { apiError, readJson, withApiKey } from "../_lib/api";

export const dynamic = "force-dynamic";

const LANG_RE = /^[a-z]{2,3}(_[A-Za-z]{2,4})?$/;

/**
 * POST /api/v1/messages
 * { to, type: "text", text } | { to, type: "template", template: { name, language?, variables?: string[] } }
 * Optional: from (phoneNumberId of the sending number), name (contact name if the contact is new).
 */
export const POST = withApiKey(async (req, { organizationId, keyId }) => {
  const body = await readJson(req);
  if (!body) return apiError(400, "INVALID_JSON", "Request body must be a JSON object.");

  const phone = parseIntlPhone(body.to);
  if (!phone) return apiError(400, "INVALID_PHONE", "`to` must be a phone number with country code, digits only (e.g. 919876543210).");

  const type = body.type ?? (body.template ? "template" : "text");
  let input: OutboundInput;
  if (type === "text") {
    const text = typeof body.text === "string" ? body.text : typeof body.content === "string" ? body.content : "";
    if (!text.trim()) return apiError(400, "INVALID_TEXT", "`text` is required for text messages.");
    if (text.length > 4096) return apiError(400, "INVALID_TEXT", "`text` can be at most 4096 characters.");
    input = { type: "text", text };
  } else if (type === "template") {
    const t = (body.template && typeof body.template === "object" ? body.template : {}) as Record<string, unknown>;
    const name = typeof t.name === "string" ? t.name.trim() : "";
    if (!name) return apiError(400, "INVALID_TEMPLATE", "`template.name` is required.");
    const vars = t.variables ?? t.bodyVariables ?? [];
    if (!Array.isArray(vars) || vars.length > 50 || vars.some((v) => typeof v !== "string" && typeof v !== "number")) {
      return apiError(400, "INVALID_TEMPLATE", "`template.variables` must be an array of strings.");
    }
    const approved = await prisma.messageTemplate.findMany({
      where: { organizationId, name, status: "APPROVED" },
      select: { language: true },
    });
    if (!approved.length) return apiError(404, "TEMPLATE_NOT_FOUND", `No approved template named "${name}".`);
    const language = typeof t.language === "string" && t.language.trim() ? t.language.trim() : approved[0].language;
    if (!LANG_RE.test(language)) return apiError(400, "INVALID_TEMPLATE", "`template.language` must be a language code such as en or en_US.");
    if (!approved.some((a) => a.language === language)) {
      return apiError(404, "TEMPLATE_NOT_FOUND", `Template "${name}" is not approved in language "${language}". Available: ${approved.map((a) => a.language).join(", ")}.`);
    }
    input = { type: "template", name, language, variables: vars.map(String) };
  } else {
    return apiError(400, "UNSUPPORTED_TYPE", "`type` must be \"text\" or \"template\".");
  }

  const from = typeof body.from === "string" && body.from.trim() ? body.from.trim() : null;
  const account = await resolveWhatsappAccount(organizationId, from);
  if (!account) {
    return from
      ? apiError(404, "SENDER_NOT_FOUND", `No active WhatsApp number matches from="${from}".`)
      : apiError(409, "NO_WHATSAPP_ACCOUNT", "Connect an active WhatsApp number in Settings → WhatsApp first.");
  }

  const { contact, created } = await findOrCreateContact(organizationId, phone, typeof body.name === "string" ? body.name.slice(0, 120) : null);
  if (created) after(() => emitContactCreated(contact.id));
  if (contact.optedOut) return apiError(422, "CONTACT_OPTED_OUT", "This contact has opted out of messages.");
  if (contact.isBlocked) return apiError(422, "CONTACT_BLOCKED", "This contact is blocked.");

  const { conversation, windowOpen } = await findOrCreateConversation(organizationId, contact.id, account.id);

  try {
    const message = await sendOutboundMessage({
      organizationId,
      conversation,
      contact,
      whatsappAccount: account,
      windowOpen,
      input,
      meta: { source: "api", apiKeyId: keyId },
    });
    after(() => emitMessageSent(message.id));
    return NextResponse.json(
      { id: message.id, wamid: message.wamid, status: message.status.toLowerCase(), message: toApiMessage(message, contact.phone) },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof MessagingError) return apiError(e.status, e.code, e.message, e.messageId ? { messageId: e.messageId } : undefined);
    throw e;
  }
});
