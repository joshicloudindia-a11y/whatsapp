import { NextRequest, NextResponse, after } from "next/server";
import { emitMessageSent } from "@/lib/outgoing-webhooks";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendTextMessage, sendMediaMessage, sendTemplateMessage } from "@/lib/whatsapp";
import { pusherServer, PUSHER_EVENTS, conversationChannel, orgChannel } from "@/lib/pusher";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") ?? "1"));
  const limit = 50;

  const messages = await prisma.message.findMany({
    where: {
      conversationId: id,
      conversation: { organizationId: session.user.organizationId },
    },
    include: {
      sentByUser: { select: { id: true, name: true, avatar: true } },
    },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * limit,
    take: limit,
  });

  return NextResponse.json({ messages: messages.reverse(), page });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    const body = await req.json();
    const { type = "text", content, mediaUrl, mediaType, caption, templateName, languageCode, components } = body;

    const conversation = await prisma.conversation.findFirst({
      where: { id, organizationId: session.user.organizationId },
      include: { contact: true, whatsappAccount: true },
    });

    if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { whatsappAccount, contact } = conversation;
    let wamid: string | undefined;

    if (!["text", "template", "image", "video", "audio", "document"].includes(type)) {
      return NextResponse.json({ error: "Unsupported message type" }, { status: 400 });
    }
    if (type === "text" && !String(content ?? "").trim()) {
      return NextResponse.json({ error: "Message can't be empty" }, { status: 400 });
    }
    if (type === "template" && !templateName) {
      return NextResponse.json({ error: "Choose a template" }, { status: 400 });
    }
    // [compliance] Contact replied STOP – nothing may be sent until they reply START.
    if (contact.optedOut) {
      return NextResponse.json({ error: "This contact unsubscribed (STOP). They must message START to receive messages again.", code: "OPTED_OUT" }, { status: 400 });
    }
    if (!whatsappAccount.isActive) {
      return NextResponse.json({ error: "This WhatsApp number is disabled. Enable it in Settings → WhatsApp." }, { status: 400 });
    }
    // WhatsApp only allows free-form replies within 24h of the customer's last message.
    const windowOpen = !!conversation.sessionExpiresAt && conversation.sessionExpiresAt > new Date();
    if (type !== "template" && !windowOpen) {
      return NextResponse.json({ error: "The 24-hour reply window has closed. Send an approved template to restart the conversation.", code: "WINDOW_CLOSED" }, { status: 400 });
    }

    const phoneNumberId = whatsappAccount.phoneNumberId;

    if (type === "text") {
      const res = await sendTextMessage({
        to: contact.phone,
        text: content,
        accessToken: whatsappAccount.accessToken,
        phoneNumberId,
      });
      wamid = res.messages?.[0]?.id;
    } else if (type === "template") {
      const res = await sendTemplateMessage({
        to: contact.phone,
        templateName,
        languageCode: languageCode ?? "en",
        components,
        accessToken: whatsappAccount.accessToken,
        phoneNumberId,
      });
      wamid = res.messages?.[0]?.id;
    } else if (["image", "video", "audio", "document"].includes(type)) {
      const res = await sendMediaMessage({
        to: contact.phone,
        type: type as any,
        url: mediaUrl,
        caption,
        accessToken: whatsappAccount.accessToken,
        phoneNumberId,
      });
      wamid = res.messages?.[0]?.id;
    }

    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        organizationId: session.user.organizationId,
        wamid,
        direction: "OUTBOUND",
        type: type.toUpperCase() as any,
        status: "SENT",
        content,
        mediaUrl,
        mediaType,
        mediaCaption: caption,
        templateName,
        sentByUserId: session.user.id,
      },
      include: { sentByUser: { select: { id: true, name: true, avatar: true } } },
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        isRead: true,
        // Replying re-opens a resolved chat and claims it if nobody owns it yet.
        ...(conversation.status !== "OPEN" && { status: "OPEN" }),
        ...(!conversation.assignedAgentId && { assignedAgentId: session.user.id }),
      },
    });

    await pusherServer.trigger(conversationChannel(conversation.id), PUSHER_EVENTS.NEW_MESSAGE, { message });
    await pusherServer.trigger(orgChannel(session.user.organizationId), PUSHER_EVENTS.CONVERSATION_UPDATED, {
      conversationId: conversation.id,
    });

    await prisma.usageLog.create({
      data: { organizationId: session.user.organizationId, type: "MESSAGE_SENT" },
    });
    after(() => emitMessageSent(message.id)); // [webhooks]

    return NextResponse.json({ message });
  } catch (error: any) {
    console.error("Send message error:", error);
    return NextResponse.json({ error: error.message ?? "Failed to send" }, { status: 500 });
  }
}
