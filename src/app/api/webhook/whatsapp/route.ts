import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseWebhookMessage, verifyWebhookSignature, sendTextMessage } from "@/lib/whatsapp";
import { applyReaction, asExtras, mergeExtras, messagePreview, type MessageExtras, type WaContact } from "@/components/inbox/message-extras"; // [chat]
import { pusherServer, PUSHER_EVENTS, orgChannel, conversationChannel } from "@/lib/pusher";
import { applyRecipientStatus } from "@/lib/broadcast-runner";
import { handleCallsEntry } from "@/lib/calling"; // [calls]
import { emitContactCreated, emitMessageReceived, emitMessageStatus } from "@/lib/outgoing-webhooks"; // [webhooks]
import { runChatbotForInbound } from "@/lib/chatbot-runtime"; // [chatbot]
import { runInboundAutomations } from "@/lib/automation-runtime"; // [automation]

export const dynamic = "force-dynamic";

/**
 * Step 2a – GET verification request.
 * Meta sends hub.mode=subscribe, hub.verify_token and hub.challenge when the
 * Callback URL is saved. Echo hub.challenge with 200 only if the token matches.
 */
export async function GET(req: NextRequest) {
  const mode      = req.nextUrl.searchParams.get("hub.mode");
  const token     = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");
  const expected  = process.env.META_WEBHOOK_VERIFY_TOKEN;

  if (!expected) {
    console.error("[webhook] META_WEBHOOK_VERIFY_TOKEN is not set");
    return new NextResponse("Server misconfigured", { status: 500 });
  }

  if (mode === "subscribe" && token === expected && challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

/**
 * Step 2b – POST event notifications.
 * Validates X-Hub-Signature-256 with the App Secret, replies 200 immediately,
 * and processes the payload after the response is sent.
 */
export async function POST(req: NextRequest) {
  const rawBody   = await req.text();
  const appSecret = process.env.META_APP_SECRET;

  if (appSecret) {
    const signature = req.headers.get("x-hub-signature-256") ?? "";
    if (!verifyWebhookSignature(rawBody, signature, appSecret)) {
      console.error("[webhook] X-Hub-Signature-256 mismatch");
      return new NextResponse("Invalid signature", { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    console.error("[webhook] META_APP_SECRET is not set – rejecting unsigned payload");
    return new NextResponse("Server misconfigured", { status: 500 });
  } else {
    console.warn("[webhook] META_APP_SECRET not set – skipping signature check (dev only)");
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  if (body?.object !== "whatsapp_business_account") {
    return NextResponse.json({ status: "ignored" });
  }

  // Acknowledge promptly; Meta retries (and duplicates) if we are slow or non-200.
  after(() => processPayload(body));
  return NextResponse.json({ status: "ok" });
}

async function processPayload(body: any) {
  for (const entry of body.entry ?? []) {
    for (const { messages, statuses, phoneNumberId, contacts } of parseWebhookMessage(entry)) {
      try {
        // Look up account by phoneNumberId (most precise), fall back to WABA ID
        const waAccount = await prisma.whatsappAccount.findFirst({
          where: phoneNumberId ? { phoneNumberId } : { wabaId: entry.id },
        });

        if (!waAccount) {
          console.warn(`[webhook] No WhatsApp account for phoneNumberId=${phoneNumberId} wabaId=${entry.id}`);
          continue;
        }

        for (const msg of messages ?? []) {
          try {
            await handleInboundMessage(msg, waAccount, contacts ?? []);
          } catch (err) {
            console.error("[webhook] Failed to handle message:", msg?.id, err);
          }
        }

        for (const status of statuses ?? []) {
          try {
            await handleStatusUpdate(status, waAccount.organizationId);
          } catch (err) {
            console.error("[webhook] Failed to handle status update:", status?.id, err);
          }
        }
      } catch (err) {
        console.error("[webhook] Failed to process change:", err);
      }
    }
    // [calls] WhatsApp Calling API events (field "calls"). Finds the account itself; never throws.
    await handleCallsEntry(entry);
  }
}

async function handleInboundMessage(msg: any, waAccount: any, contacts: any[]) {
  // Meta may deliver the same event more than once – wamid is unique.
  if (msg.id && (await prisma.message.findUnique({ where: { wamid: msg.id }, select: { id: true } }))) {
    return;
  }

  // [chat] Reactions never become chat bubbles: attach them to the target message. Never throws.
  if (msg.type === "reaction") {
    await handleInboundReaction(msg, waAccount.organizationId);
    return;
  }

  const phone       = msg.from;
  const contactInfo = contacts?.find((c: any) => c.wa_id === phone);
  const contactName = contactInfo?.profile?.name;

  const contactIsNew = !(await prisma.contact.findUnique({
    where: { organizationId_phone: { organizationId: waAccount.organizationId, phone } },
    select: { id: true },
  })); // [webhooks]
  const contact = await prisma.contact.upsert({
    where: { organizationId_phone: { organizationId: waAccount.organizationId, phone } },
    create: { organizationId: waAccount.organizationId, phone, name: contactName },
    update: { name: contactName ?? undefined, lastSeenAt: new Date() },
  });

  let conversation = await prisma.conversation.findFirst({
    where: {
      organizationId: waAccount.organizationId,
      whatsappAccountId: waAccount.id,
      contactId: contact.id,
      status: { in: ["OPEN", "PENDING"] },
    },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        organizationId: waAccount.organizationId,
        whatsappAccountId: waAccount.id,
        contactId: contact.id,
        status: "OPEN",
        sessionExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        lastMessageAt: new Date(),
      },
    });

    await pusherServer.trigger(
      orgChannel(waAccount.organizationId),
      PUSHER_EVENTS.NEW_CONVERSATION,
      { conversationId: conversation.id }
    );
  }

  const { type, content, mediaUrl, mediaType, extras } = extractMessageContent(msg);
  // [chat] Quoted reply / forwarded flags from the inbound `context` object.
  const chatExtras = await buildInboundExtras(msg, waAccount.organizationId, extras);

  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      organizationId: waAccount.organizationId,
      wamid: msg.id,
      direction: "INBOUND",
      type: type as any,
      status: "DELIVERED",
      content,
      mediaUrl,
      mediaType,
      ...(chatExtras && { interactive: chatExtras as never }),
    },
  });
  // [webhooks] Notify the org's outgoing webhooks (never throws).
  after(() => emitMessageReceived(message.id));
  if (contactIsNew) after(() => emitContactCreated(contact.id));

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: new Date(),
      isRead: false,
      sessionExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  await pusherServer.trigger(
    conversationChannel(conversation.id),
    PUSHER_EVENTS.NEW_MESSAGE,
    { message, contact }
  );
  await pusherServer.trigger(
    orgChannel(waAccount.organizationId),
    PUSHER_EVENTS.CONVERSATION_UPDATED,
    { conversationId: conversation.id, lastMessage: content }
  );

  await prisma.usageLog.create({
    data: { organizationId: waAccount.organizationId, type: "MESSAGE_RECEIVED" },
  });

  // [compliance] STOP / START keywords: update opt-out, confirm once, and skip bots/automations. Never throws.
  if (await handleOptKeyword(msg, waAccount, contact, conversation.id)) return;

  // [chatbot] Run any active chatbot flow for this message (src/lib/chatbot-runtime.ts). Never throws.
  await runChatbotForInbound({ msg, waAccount, contactId: contact.id, conversationId: conversation.id });

  // [automation] Rule-based automations. Keep this AFTER any chatbot call: bots answer keywords first, automations skip their text reply if a bot already replied. Never throws.
  await runInboundAutomations({ organizationId: waAccount.organizationId, whatsappAccount: waAccount, contactId: contact.id, conversationId: conversation.id, messageId: message.id, text: content });
}

// [compliance] Whole-message keywords (trimmed, case-insensitive).
const OPT_OUT_KEYWORDS = new Set(["stop", "unsubscribe", "stop all", "cancel", "opt out", "optout", "band karo"]);
const OPT_IN_KEYWORDS = new Set(["start", "subscribe", "unstop", "opt in"]);
const OPT_OUT_REPLY = "You've been unsubscribed from our messages. Reply START to subscribe again.";
const OPT_IN_REPLY = "Welcome back! You'll receive our updates again.";

/** [compliance] Returns true when the message was a STOP/START keyword (caller must then skip chatbot + automations). */
async function handleOptKeyword(
  msg: { type?: string; text?: { body?: string } },
  waAccount: { organizationId: string; accessToken: string; phoneNumberId: string },
  contact: { id: string; phone: string }, conversationId: string): Promise<boolean> {
  if (msg?.type !== "text") return false;
  const word = String(msg.text?.body ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const optOut = OPT_OUT_KEYWORDS.has(word);
  if (!optOut && !OPT_IN_KEYWORDS.has(word)) return false;

  try {
    await prisma.contact.update({ where: { id: contact.id }, data: { optedOut: optOut } });

    const text = optOut ? OPT_OUT_REPLY : OPT_IN_REPLY;
    let wamid: string | undefined;
    let failure: string | undefined;
    try {
      const res = await sendTextMessage({ to: contact.phone, text, accessToken: waAccount.accessToken, phoneNumberId: waAccount.phoneNumberId });
      wamid = res.messages?.[0]?.id;
    } catch (e) {
      failure = e instanceof Error ? e.message : "Send failed";
      console.error("[compliance] confirmation send failed:", failure);
    }

    const reply = await prisma.message.create({
      data: {
        conversationId, organizationId: waAccount.organizationId, wamid,
        direction: "OUTBOUND", type: "TEXT", status: failure ? "FAILED" : "SENT",
        failureReason: failure?.slice(0, 190), content: text, isBotMessage: true,
      },
    });
    await prisma.conversationNote.create({
      data: {
        conversationId,
        content: optOut
          ? `Contact replied "${word.toUpperCase()}" and was unsubscribed automatically (opted out of all messages).`
          : `Contact replied "${word.toUpperCase()}" and was re-subscribed automatically.`,
      },
    }).catch(() => undefined);
    await prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } });
    if (!failure) await prisma.usageLog.create({ data: { organizationId: waAccount.organizationId, type: "MESSAGE_SENT" } }).catch(() => undefined);

    try {
      await pusherServer.trigger(conversationChannel(conversationId), PUSHER_EVENTS.NEW_MESSAGE, { message: reply });
      await pusherServer.trigger(orgChannel(waAccount.organizationId), PUSHER_EVENTS.CONVERSATION_UPDATED, { conversationId, lastMessage: text });
    } catch { /* realtime is best-effort */ }
  } catch (err) {
    console.error("[compliance] opt keyword handling failed:", err);
  }
  return true;
}

async function handleStatusUpdate(status: any, organizationId: string) {
  const { id: wamid, status: msgStatus, timestamp } = status;

  const statusMap: Record<string, string> = {
    sent: "SENT", delivered: "DELIVERED", read: "READ", failed: "FAILED",
  };
  const mapped = statusMap[msgStatus];
  if (!mapped) return;

  const updateData: any = { status: mapped };
  if (msgStatus === "delivered") updateData.updatedAt = new Date(Number(timestamp) * 1000);
  if (msgStatus === "failed" && status.errors?.[0]) {
    updateData.failureReason = status.errors[0].title;
  }

  // Forward-only: Meta can deliver "sent" after "delivered"/"read".
  const allowedPrev: Record<string, string[]> = {
    SENT: ["PENDING"], DELIVERED: ["PENDING", "SENT"], READ: ["PENDING", "SENT", "DELIVERED"], FAILED: ["PENDING", "SENT", "DELIVERED"],
  };
  const result = await prisma.message.updateMany({ where: { wamid, status: { in: allowedPrev[mapped] as never } }, data: updateData });

  // Broadcast delivery / read statistics.
  await applyRecipientStatus(wamid, mapped as never, new Date(Number(timestamp) * 1000 || Date.now()), status.errors?.[0]?.title);

  if (result.count > 0) {
    after(() => emitMessageStatus(wamid, mapped)); // [webhooks]
    const msg = await prisma.message.findFirst({ where: { wamid } });
    if (msg) {
      await pusherServer.trigger(
        conversationChannel(msg.conversationId),
        PUSHER_EVENTS.MESSAGE_STATUS_UPDATE,
        { wamid, status: mapped }
      );
    }
  }
}

/** [chat] Inbound reaction: `reaction.emoji` absent/empty = the customer removed their reaction. */
async function handleInboundReaction(msg: { reaction?: { message_id?: unknown; emoji?: unknown } }, organizationId: string) {
  try {
    const targetWamid = msg?.reaction?.message_id;
    const rawEmoji = msg?.reaction?.emoji;
    if (typeof targetWamid !== "string" || !targetWamid) return;
    const target = await prisma.message.findFirst({
      where: { wamid: targetWamid, organizationId },
      select: { id: true, conversationId: true, interactive: true },
    });
    if (!target) return;
    const emoji = typeof rawEmoji === "string" && rawEmoji ? rawEmoji.slice(0, 16) : null;
    const reactions = applyReaction(asExtras(target.interactive).reactions, emoji, { contact: true });
    await prisma.message.update({ where: { id: target.id }, data: { interactive: mergeExtras(target.interactive, { reactions }) as never } });
    await pusherServer.trigger(conversationChannel(target.conversationId), PUSHER_EVENTS.MESSAGE_STATUS_UPDATE, { messageId: target.id, reaction: emoji });
  } catch (err) {
    console.error("[chat] inbound reaction failed:", err);
  }
}

/** [chat] Adds reply context (resolved preview of the quoted message) and the forwarded flag. Never throws. */
async function buildInboundExtras(msg: { context?: { id?: unknown; forwarded?: boolean; frequently_forwarded?: boolean } }, organizationId: string, extras: MessageExtras): Promise<MessageExtras | null> {
  const out: MessageExtras = { ...extras };
  try {
    const ctx = msg?.context;
    if (ctx?.forwarded || ctx?.frequently_forwarded) out.forwarded = true;
    if (typeof ctx?.id === "string" && ctx.id) {
      const quoted = await prisma.message.findFirst({
        where: { wamid: ctx.id, organizationId },
        select: { id: true, type: true, direction: true, content: true, mediaCaption: true, templateName: true, interactive: true },
      });
      out.context = quoted
        ? { wamid: ctx.id, messageId: quoted.id, preview: messagePreview(quoted), type: quoted.type, direction: quoted.direction }
        : { wamid: ctx.id, messageId: null, preview: null };
    }
  } catch (err) {
    console.error("[chat] inbound context failed:", err);
  }
  return Object.keys(out).length ? out : null;
}

/** [chat] Inbound contact card as Meta sends it (fields may be missing). */
interface RawWaContact {
  name?: { formatted_name?: string; first_name?: string };
  phones?: { phone?: string; wa_id?: string; type?: string }[];
  emails?: { email?: string; type?: string }[];
  org?: { company?: string; title?: string };
}

function extractMessageContent(msg: any): { type: string; content: string | null; mediaUrl: string | null; mediaType: string | null; extras: MessageExtras } {
  const none = { mediaUrl: null, mediaType: null, extras: {} };
  switch (msg.type) {
    case "text":
      return { ...none, type: "TEXT", content: msg.text?.body ?? null };
    case "image":
      return { ...none, type: "IMAGE", content: msg.image?.caption ?? null, mediaUrl: msg.image?.id ?? null, mediaType: "image" };
    case "video":
      return { ...none, type: "VIDEO", content: msg.video?.caption ?? null, mediaUrl: msg.video?.id ?? null, mediaType: "video" };
    case "sticker":
      return { ...none, type: "STICKER", content: null, mediaUrl: msg.sticker?.id ?? null, mediaType: msg.sticker?.mime_type ?? "image/webp" };
    case "audio":
      return { ...none, type: "AUDIO", content: null, mediaUrl: msg.audio?.id ?? null, mediaType: "audio" };
    case "document":
      return { ...none, type: "DOCUMENT", content: msg.document?.filename ?? null, mediaUrl: msg.document?.id ?? null, mediaType: "document" };
    case "location": {
      const l = msg.location ?? {};
      const latitude = Number(l.latitude), longitude = Number(l.longitude);
      const name = typeof l.name === "string" ? l.name.slice(0, 200) : undefined;
      const address = typeof l.address === "string" ? l.address.slice(0, 500) : undefined;
      const url = typeof l.url === "string" ? l.url.slice(0, 500) : undefined;
      return {
        ...none,
        type: "LOCATION",
        content: JSON.stringify({ lat: l.latitude, lng: l.longitude, ...(name && { name }), ...(address && { address }) }),
        extras: Number.isFinite(latitude) && Number.isFinite(longitude)
          ? { location: { latitude, longitude, ...(name && { name }), ...(address && { address }), ...(url && { url }) } } : {},
      };
    }
    case "contacts": {
      const raw: RawWaContact[] = Array.isArray(msg.contacts) ? msg.contacts : [];
      const cards: WaContact[] = raw.slice(0, 20).map((c) => ({
        name: { formatted_name: String(c?.name?.formatted_name ?? c?.name?.first_name ?? "Contact").slice(0, 200), ...(c?.name?.first_name && { first_name: String(c.name.first_name).slice(0, 100) }) },
        phones: (Array.isArray(c?.phones) ? c.phones : []).slice(0, 5).map((p) => ({ phone: p?.phone ? String(p.phone).slice(0, 40) : undefined, wa_id: p?.wa_id ? String(p.wa_id).slice(0, 40) : undefined, type: p?.type ? String(p.type).slice(0, 20) : undefined })),
        emails: (Array.isArray(c?.emails) ? c.emails : []).slice(0, 3).map((e) => ({ email: e?.email ? String(e.email).slice(0, 191) : undefined, type: e?.type ? String(e.type).slice(0, 20) : undefined })),
        ...(c?.org?.company && { org: { company: String(c.org.company).slice(0, 120), ...(c.org.title && { title: String(c.org.title).slice(0, 120) }) } }),
      }));
      return { ...none, type: "CONTACTS", content: cards.length ? `Contact: ${cards.map((c) => c.name.formatted_name).join(", ")}` : null, extras: cards.length ? { contacts: cards } : {} };
    }
    case "interactive": {
      const i = msg.interactive ?? {};
      const r = i.button_reply ?? i.list_reply;
      const kind = i.button_reply ? "button_reply" : i.list_reply ? "list_reply" : i.nfm_reply ? "nfm_reply" : null;
      const title = r?.title ?? (i.nfm_reply ? (i.nfm_reply.body ?? "Form response") : null);
      return {
        ...none,
        type: "INTERACTIVE",
        content: title ?? null,
        extras: kind && title ? { reply: { kind, title: String(title).slice(0, 200), ...(r?.id && { id: String(r.id).slice(0, 256) }), ...(r?.description && { description: String(r.description).slice(0, 200) }) } } : {},
      };
    }
    case "button":
      // Template quick-reply tap.
      return {
        ...none,
        type: "INTERACTIVE",
        content: msg.button?.text ?? msg.button?.payload ?? null,
        extras: msg.button?.text || msg.button?.payload
          ? { reply: { kind: "button", title: String(msg.button.text ?? msg.button.payload).slice(0, 200), ...(msg.button.payload && { id: String(msg.button.payload).slice(0, 256) }) } } : {},
      };
    default:
      return { ...none, type: "TEXT", content: null };
  }
}
