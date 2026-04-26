import { NextRequest, NextResponse } from "next/server";
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
      data: { lastMessageAt: new Date() },
    });

    await pusherServer.trigger(conversationChannel(conversation.id), PUSHER_EVENTS.NEW_MESSAGE, { message });
    await pusherServer.trigger(orgChannel(session.user.organizationId), PUSHER_EVENTS.CONVERSATION_UPDATED, {
      conversationId: conversation.id,
    });

    await prisma.usageLog.create({
      data: { organizationId: session.user.organizationId, type: "MESSAGE_SENT" },
    });

    return NextResponse.json({ message });
  } catch (error: any) {
    console.error("Send message error:", error);
    return NextResponse.json({ error: error.message ?? "Failed to send" }, { status: 500 });
  }
}
