import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseWebhookMessage, verifyWebhookSignature } from "@/lib/whatsapp";
import { pusherServer, PUSHER_EVENTS, orgChannel, conversationChannel } from "@/lib/pusher";

// Meta webhook verification
export async function GET(req: NextRequest) {
  const mode      = req.nextUrl.searchParams.get("hub.mode");
  const token     = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

// Receive inbound messages & status updates
export async function POST(req: NextRequest) {
  try {
    // Read raw body for signature verification
    const rawBody = await req.text();

    // Verify signature when app secret is configured
    if (process.env.META_APP_SECRET) {
      const signature = req.headers.get("x-hub-signature-256") ?? "";
      const valid = verifyWebhookSignature(rawBody, signature, process.env.META_APP_SECRET);
      if (!valid) {
        console.error("Webhook signature mismatch");
        return new NextResponse("Invalid signature", { status: 403 });
      }
    }

    const body = JSON.parse(rawBody);

    if (body.object !== "whatsapp_business_account") {
      return NextResponse.json({ status: "ignored" });
    }

    for (const entry of body.entry ?? []) {
      const parsed = parseWebhookMessage(entry);
      if (!parsed) continue;

      const { messages, statuses, phoneNumberId, contacts } = parsed;

      // Look up account by phoneNumberId (most precise), fall back to WABA ID
      const waAccount = await prisma.whatsappAccount.findFirst({
        where: phoneNumberId
          ? { phoneNumberId }
          : { wabaId: entry.id },
      });

      if (!waAccount) {
        console.warn(`No WhatsApp account found for phoneNumberId=${phoneNumberId} wabaId=${entry.id}`);
        continue;
      }

      if (messages?.length) {
        for (const msg of messages) {
          await handleInboundMessage(msg, waAccount, contacts);
        }
      }

      if (statuses?.length) {
        for (const status of statuses) {
          await handleStatusUpdate(status, waAccount.organizationId);
        }
      }
    }

    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}

async function handleInboundMessage(msg: any, waAccount: any, contacts: any[]) {
  const phone       = msg.from;
  const contactInfo = contacts?.find((c: any) => c.wa_id === phone);
  const contactName = contactInfo?.profile?.name;

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

  const { type, content, mediaUrl, mediaType } = extractMessageContent(msg);

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
    },
  });

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

  const result = await prisma.message.updateMany({ where: { wamid }, data: updateData });

  if (result.count > 0) {
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

function extractMessageContent(msg: any) {
  switch (msg.type) {
    case "text":
      return { type: "TEXT", content: msg.text?.body ?? null, mediaUrl: null, mediaType: null };
    case "image":
      return { type: "IMAGE", content: msg.image?.caption ?? null, mediaUrl: msg.image?.id ?? null, mediaType: "image" };
    case "video":
      return { type: "VIDEO", content: msg.video?.caption ?? null, mediaUrl: msg.video?.id ?? null, mediaType: "video" };
    case "audio":
      return { type: "AUDIO", content: null, mediaUrl: msg.audio?.id ?? null, mediaType: "audio" };
    case "document":
      return { type: "DOCUMENT", content: msg.document?.filename ?? null, mediaUrl: msg.document?.id ?? null, mediaType: "document" };
    case "location":
      return {
        type: "LOCATION",
        content: JSON.stringify({ lat: msg.location?.latitude, lng: msg.location?.longitude }),
        mediaUrl: null, mediaType: null,
      };
    case "interactive":
      return {
        type: "INTERACTIVE",
        content: msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title ?? null,
        mediaUrl: null, mediaType: null,
      };
    default:
      return { type: "TEXT", content: null, mediaUrl: null, mediaType: null };
  }
}
