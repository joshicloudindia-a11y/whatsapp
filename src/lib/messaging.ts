import type { Contact, Conversation, Message, Prisma, WhatsappAccount } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendTemplateMessage, sendTextMessage } from "@/lib/whatsapp";
import { pusherServer, PUSHER_EVENTS, conversationChannel, orgChannel } from "@/lib/pusher";

/**
 * Shared outbound-messaging logic (used by the public API v1).
 * Mirrors what the inbox send route does: call Meta, store the Message row,
 * bump the conversation, notify realtime listeners and log usage.
 */

export class MessagingError extends Error {
  constructor(public code: string, message: string, public status = 400, public messageId?: string) {
    super(message);
  }
}

/** Strict international number: digits only (a leading "+" and separators are stripped), 8–15 digits, no leading 0. */
export function parseIntlPhone(input: unknown): string | null {
  if (typeof input !== "string" && typeof input !== "number") return null;
  const raw = String(input).trim();
  if (!raw || /[a-z]/i.test(raw)) return null;
  const d = raw.replace(/\D/g, "");
  if (d.startsWith("0") || d.length < 8 || d.length > 15) return null;
  return d;
}

/** The org's sending account: a specific Meta phoneNumberId (or our account id), else the first active one. */
export async function resolveWhatsappAccount(organizationId: string, from?: string | null) {
  if (from) {
    return prisma.whatsappAccount.findFirst({
      where: { organizationId, isActive: true, OR: [{ phoneNumberId: from }, { id: from }, { phoneNumber: from }] },
    });
  }
  return prisma.whatsappAccount.findFirst({ where: { organizationId, isActive: true }, orderBy: { createdAt: "asc" } });
}

/** Upserts a contact by (organizationId, phone). `created` is true when a new row was inserted. */
export async function findOrCreateContact(organizationId: string, phone: string, name?: string | null) {
  const existing = await prisma.contact.findUnique({ where: { organizationId_phone: { organizationId, phone } } });
  if (existing) return { contact: existing, created: false };
  try {
    const contact = await prisma.contact.create({ data: { organizationId, phone, name: name?.trim() || null } });
    return { contact, created: true };
  } catch (e) {
    // Lost a race with a parallel insert: read the winner.
    if ((e as { code?: string })?.code === "P2002") {
      const contact = await prisma.contact.findUnique({ where: { organizationId_phone: { organizationId, phone } } });
      if (contact) return { contact, created: false };
    }
    throw e;
  }
}

/**
 * Reuses the contact's open/pending conversation on that number, else the most recent one, else creates one.
 * `windowOpen` is computed across all of the contact's conversations on that number (the 24h window is per customer).
 */
export async function findOrCreateConversation(organizationId: string, contactId: string, whatsappAccountId: string) {
  const where = { organizationId, contactId, whatsappAccountId };
  const [active, latest, windowRow] = await Promise.all([
    prisma.conversation.findFirst({ where: { ...where, status: { in: ["OPEN", "PENDING"] } }, orderBy: { updatedAt: "desc" } }),
    prisma.conversation.findFirst({ where, orderBy: { updatedAt: "desc" } }),
    prisma.conversation.findFirst({ where: { ...where, sessionExpiresAt: { gt: new Date() } }, select: { id: true } }),
  ]);
  const conversation =
    active ?? latest ?? (await prisma.conversation.create({ data: { organizationId, contactId, whatsappAccountId, status: "OPEN" } }));
  if (!active && !latest) {
    await pusherServer.trigger(orgChannel(organizationId), PUSHER_EVENTS.NEW_CONVERSATION, { conversationId: conversation.id });
  }
  return { conversation, windowOpen: !!windowRow };
}

/** Replaces {{1}}, {{2}}… in a template body with the given values (for the inbox preview). */
export function renderTemplateBody(body: string, vars: string[]) {
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (m, n) => vars[Number(n) - 1] ?? m);
}

export type OutboundInput =
  | { type: "text"; text: string }
  | { type: "template"; name: string; language: string; variables?: string[]; components?: object[] };

export interface SendOutboundOptions {
  organizationId: string;
  conversation: Conversation;
  contact: Contact;
  whatsappAccount: WhatsappAccount;
  windowOpen: boolean;
  input: OutboundInput;
  sentByUserId?: string | null;
  /** Merged into Message.templateData, e.g. { source: "api", apiKeyId }. */
  meta?: Record<string, unknown>;
}

/**
 * Sends a text/template message and stores it. On a Meta error the message is stored as FAILED and a
 * MessagingError (code SEND_FAILED, status 502) carrying its id is thrown.
 */
export async function sendOutboundMessage(opts: SendOutboundOptions): Promise<Message> {
  const { organizationId, conversation, contact, whatsappAccount, input } = opts;

  if (!whatsappAccount.isActive) throw new MessagingError("ACCOUNT_DISABLED", "This WhatsApp number is disabled.", 400);
  if (contact.optedOut) throw new MessagingError("CONTACT_OPTED_OUT", "This contact has opted out of messages.", 422);
  if (contact.isBlocked) throw new MessagingError("CONTACT_BLOCKED", "This contact is blocked.", 422);
  if (input.type === "text" && !opts.windowOpen) {
    throw new MessagingError(
      "WINDOW_CLOSED",
      "The 24-hour customer service window is closed. Send an approved template to start the conversation.",
      422,
    );
  }

  let content: string | null = null;
  let components: object[] | undefined;
  let templateData: Prisma.InputJsonValue | undefined;

  if (input.type === "text") {
    content = input.text;
    if (opts.meta) templateData = opts.meta as Prisma.InputJsonValue;
  } else {
    const vars = input.variables ?? [];
    components = input.components ?? (vars.length ? [{ type: "body", parameters: vars.map((text) => ({ type: "text", text })) }] : []);
    const tpl = await prisma.messageTemplate.findFirst({
      where: { organizationId, name: input.name, language: input.language },
      select: { body: true },
    });
    content = tpl ? renderTemplateBody(tpl.body, vars) : null;
    templateData = { ...(opts.meta ?? {}), language: input.language, variables: vars } as Prisma.InputJsonValue;
  }

  let wamid: string | undefined;
  let failureReason: string | undefined;
  try {
    const res =
      input.type === "text"
        ? await sendTextMessage({ to: contact.phone, text: input.text, accessToken: whatsappAccount.accessToken, phoneNumberId: whatsappAccount.phoneNumberId })
        : await sendTemplateMessage({
            to: contact.phone,
            templateName: input.name,
            languageCode: input.language,
            components,
            accessToken: whatsappAccount.accessToken,
            phoneNumberId: whatsappAccount.phoneNumberId,
          });
    wamid = res?.messages?.[0]?.id;
  } catch (err) {
    failureReason = (err instanceof Error ? err.message : String(err)).slice(0, 180);
  }

  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      organizationId,
      wamid,
      direction: "OUTBOUND",
      type: input.type === "text" ? "TEXT" : "TEMPLATE",
      status: failureReason ? "FAILED" : "SENT",
      content,
      templateName: input.type === "template" ? input.name : null,
      templateData,
      sentByUserId: opts.sentByUserId ?? null,
      failureReason,
    },
  });

  if (!failureReason) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        ...(conversation.status !== "OPEN" && { status: "OPEN" }),
        ...(opts.sentByUserId && !conversation.assignedAgentId && { assignedAgentId: opts.sentByUserId }),
      },
    });
  }

  await pusherServer.trigger(conversationChannel(conversation.id), PUSHER_EVENTS.NEW_MESSAGE, { message });
  await pusherServer.trigger(orgChannel(organizationId), PUSHER_EVENTS.CONVERSATION_UPDATED, { conversationId: conversation.id, lastMessage: content });

  if (failureReason) throw new MessagingError("SEND_FAILED", `WhatsApp rejected the message: ${failureReason}`, 502, message.id);

  await prisma.usageLog.create({ data: { organizationId, type: "MESSAGE_SENT" } });
  return message;
}
