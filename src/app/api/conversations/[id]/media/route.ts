import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { uploadMedia, sendMediaById, type WaMediaKind } from "@/lib/whatsapp";
import { pusherServer, PUSHER_EVENTS, conversationChannel, orgChannel } from "@/lib/pusher";

/**
 * Hosting platforms cap request bodies (Vercel: 4.5 MB), so uploads are limited to
 * 4 MB even though WhatsApp itself accepts larger files.
 */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const MAX_CAPTION = 1024;

const ALLOWED: Record<string, WaMediaKind> = {
  "image/jpeg": "image", "image/png": "image",
  "video/mp4": "video", "video/3gpp": "video",
  "audio/ogg": "audio", "audio/mpeg": "audio", "audio/aac": "audio", "audio/amr": "audio", "audio/mp4": "audio",
  "application/pdf": "document", "text/plain": "document",
  "application/msword": "document",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "document",
  "application/vnd.ms-excel": "document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "document",
  "application/vnd.ms-powerpoint": "document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "document",
};
// Browsers sometimes send an empty or generic type (common for Office files).
const BY_EXT: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", mp4: "video/mp4", "3gp": "video/3gpp",
  ogg: "audio/ogg", opus: "audio/ogg", mp3: "audio/mpeg", aac: "audio/aac", amr: "audio/amr", m4a: "audio/mp4",
  pdf: "application/pdf", txt: "text/plain", doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

const bad = (error: string, status = 400, code?: string) => NextResponse.json({ error, ...(code && { code }) }, { status });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOrgMember();
  if ("response" in auth) return auth.response;
  const { member } = auth;
  const { id } = await params;

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024) return bad("Files must be 4 MB or smaller.", 413);

  try {
    let form: FormData;
    try { form = await req.formData(); } catch { return bad("Send the file as multipart form-data."); }

    const file = form.get("file");
    if (!file || typeof file === "string") return bad("Choose a file to send.");
    if (file.size === 0) return bad("That file is empty.");
    if (file.size > MAX_UPLOAD_BYTES) return bad("Files must be 4 MB or smaller.", 413);

    const filename = (file.name || "file").replace(/[\r\n\\/]/g, "_").slice(0, 200);
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    let mime = (file.type || "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED[mime]) mime = BY_EXT[ext] ?? mime;
    const kind = ALLOWED[mime];
    if (!kind) return bad("This file type isn't supported. Send JPG/PNG images, MP4 video, OGG/MP3/AAC/AMR audio, or PDF/Office/TXT documents.", 415);

    const rawCaption = form.get("caption");
    const caption = typeof rawCaption === "string" && kind !== "audio" ? rawCaption.trim().slice(0, MAX_CAPTION) : "";

    const conversation = await prisma.conversation.findFirst({
      where: { id, organizationId: member.organizationId },
      include: { contact: true, whatsappAccount: true },
    });
    if (!conversation) return bad("Not found", 404);
    const { whatsappAccount, contact } = conversation;

    if (!whatsappAccount.isActive) return bad("This WhatsApp number is disabled. Enable it in Settings → WhatsApp.");
    if (contact.optedOut) return bad("This contact has opted out of messages.", 400, "OPTED_OUT");
    if (contact.isBlocked) return bad("This contact is blocked.", 400, "BLOCKED");
    const windowOpen = !!conversation.sessionExpiresAt && conversation.sessionExpiresAt > new Date();
    if (!windowOpen) {
      return bad("The 24-hour reply window has closed. Send an approved template to restart the conversation.", 400, "WINDOW_CLOSED");
    }

    const mediaId = await uploadMedia({
      file, filename, mimeType: mime,
      accessToken: whatsappAccount.accessToken,
      phoneNumberId: whatsappAccount.phoneNumberId,
    });
    const res = await sendMediaById({
      to: contact.phone, type: kind, mediaId,
      caption: caption || undefined,
      filename: kind === "document" ? filename : undefined,
      accessToken: whatsappAccount.accessToken,
      phoneNumberId: whatsappAccount.phoneNumberId,
    });
    const wamid: string | undefined = res.messages?.[0]?.id;

    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        organizationId: member.organizationId,
        wamid,
        direction: "OUTBOUND",
        type: kind.toUpperCase() as "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT",
        status: "SENT",
        // Mirrors inbound storage: documents keep their filename in `content`.
        content: kind === "document" ? filename : null,
        mediaUrl: mediaId, // WhatsApp media id; rendered through /api/media/[messageId]
        mediaType: mime,
        mediaCaption: caption || null,
        sentByUserId: member.userId,
      },
      include: { sentByUser: { select: { id: true, name: true, avatar: true } } },
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        isRead: true,
        ...(conversation.status !== "OPEN" && { status: "OPEN" }),
        ...(!conversation.assignedAgentId && { assignedAgentId: member.userId }),
      },
    });

    await pusherServer.trigger(conversationChannel(conversation.id), PUSHER_EVENTS.NEW_MESSAGE, { message });
    await pusherServer.trigger(orgChannel(member.organizationId), PUSHER_EVENTS.CONVERSATION_UPDATED, { conversationId: conversation.id });
    await prisma.usageLog.create({ data: { organizationId: member.organizationId, type: "MESSAGE_SENT" } });

    return NextResponse.json({ message });
  } catch (error) {
    console.error("Send media error:", error);
    return bad(error instanceof Error ? error.message : "Failed to send", 500);
  }
}
