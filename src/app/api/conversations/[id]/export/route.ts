import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { csvCell } from "@/components/contacts/shared";
import { messagePreview } from "@/components/inbox/message-extras";

const BATCH = 500;
const MAX_ROWS = 100_000;

/** GET ?format=txt|csv → streams every message of the conversation (org-scoped), oldest first. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOrgMember();
  if ("response" in auth) return auth.response;
  const { member } = auth;
  const { id } = await params;
  const format = req.nextUrl.searchParams.get("format") === "csv" ? "csv" : "txt";

  const conv = await prisma.conversation.findFirst({
    where: { id, organizationId: member.organizationId },
    select: { id: true, contact: { select: { name: true, phone: true } }, whatsappAccount: { select: { displayName: true } } },
  });
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const contactName = conv.contact.name || `+${conv.contact.phone}`;
  const enc = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(enc.encode(format === "csv"
          ? "﻿" + ["timestamp", "direction", "sender", "type", "status", "content", "caption", "media_type", "template", "wamid"].join(",") + "\r\n"
          : `WhatsApp chat with ${contactName} (+${conv.contact.phone}) via ${conv.whatsappAccount.displayName}\r\nExported ${new Date().toISOString()}\r\n\r\n`));
        let cursor: string | undefined;
        let total = 0;
        for (;;) {
          const batch = await prisma.message.findMany({
            where: { conversationId: id, organizationId: member.organizationId },
            select: {
              id: true, createdAt: true, direction: true, type: true, status: true, content: true, mediaCaption: true,
              mediaType: true, templateName: true, wamid: true, isBotMessage: true, interactive: true,
              sentByUser: { select: { name: true } },
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: BATCH,
            ...(cursor && { skip: 1, cursor: { id: cursor } }),
          });
          let chunk = "";
          for (const m of batch) {
            const sender = m.direction === "INBOUND" ? contactName : m.isBotMessage ? "Bot" : m.sentByUser?.name || conv.whatsappAccount.displayName;
            if (format === "csv") {
              chunk += [m.createdAt.toISOString(), m.direction, sender, m.type, m.status, m.content, m.mediaCaption, m.mediaType, m.templateName, m.wamid]
                .map(csvCell).join(",") + "\r\n";
            } else {
              const when = m.createdAt.toISOString().replace("T", " ").slice(0, 16);
              chunk += `[${when} UTC] ${sender}: ${messagePreview(m, 100_000) || `[${m.type.toLowerCase()}]`}\r\n`;
            }
          }
          if (chunk) controller.enqueue(enc.encode(chunk));
          total += batch.length;
          if (batch.length < BATCH || total >= MAX_ROWS) break;
          cursor = batch[batch.length - 1].id;
        }
      } catch (e) {
        console.error("[export] chat export failed:", e);
        controller.enqueue(enc.encode("\r\n[Export interrupted – please try again]\r\n"));
      } finally {
        controller.close();
      }
    },
  });

  const safe = contactName.replace(/[^\w.-]+/g, "_").slice(0, 60) || "chat";
  return new Response(stream, {
    headers: {
      "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="chat-${safe}-${new Date().toISOString().slice(0, 10)}.${format}"`,
      "Cache-Control": "no-store",
    },
  });
}
