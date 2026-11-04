import { NextRequest, NextResponse } from "next/server";
import type { MessageType, Prisma } from "@prisma/client";
import { requireOrgMember } from "@/lib/org-auth";
import { downloadMedia, sendRichMessage, uploadMedia } from "@/lib/whatsapp";
import { asExtras, readLocation, type MessageExtras } from "@/components/inbox/message-extras";
import { errMessage, guardSend, loadConversation, storeOutbound, type LoadedConversation } from "@/app/api/conversations/[id]/_lib/outbound";
import { loadOwnMessage, type OwnMessage } from "../_lib";

const MAX_TARGETS = 5;
const MAX_FORWARD_BYTES = 16 * 1024 * 1024;
const MEDIA_KIND: Record<string, "image" | "video" | "audio" | "document" | "sticker"> = {
  IMAGE: "image", VIDEO: "video", AUDIO: "audio", DOCUMENT: "document", STICKER: "sticker",
};

/**
 * POST { conversationIds: string[] } → re-sends a message into other chats of the same org.
 * Each target must pass the normal checks (open 24h window, not blocked/opted out). WhatsApp has no
 * native "forward" for businesses: the copy is a new message, flagged `interactive.forwarded` in-app.
 * WhatsApp-hosted media is downloaded and re-uploaded to the target's number.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ messageId: string }> }) {
  const auth = await requireOrgMember();
  if ("response" in auth) return auth.response;
  const { member } = auth;
  const { messageId } = await params;
  const body = await req.json().catch(() => null);
  const ids = Array.isArray(body?.conversationIds)
    ? [...new Set((body.conversationIds as unknown[]).filter((v): v is string => typeof v === "string" && v.length <= 64))]
    : [];
  if (!ids.length) return NextResponse.json({ error: "Choose a chat to forward to." }, { status: 400 });
  if (ids.length > MAX_TARGETS) return NextResponse.json({ error: `Forward to at most ${MAX_TARGETS} chats at once.` }, { status: 400 });

  const src = await loadOwnMessage(messageId, member.organizationId);
  if (!src) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (["REACTION", "SYSTEM"].includes(src.type)) return NextResponse.json({ error: "This message can't be forwarded." }, { status: 400 });

  // Cache downloaded media between targets.
  let media: { blob: Blob; mimeType: string } | null = null;
  const results: { conversationId: string; ok: boolean; error?: string; code?: string; messageId?: string }[] = [];

  for (const conversationId of ids) {
    try {
      const target = await loadConversation(conversationId, member.organizationId);
      if (!target) { results.push({ conversationId, ok: false, error: "Chat not found" }); continue; }
      const guard = guardSend(target, true);
      if (guard) {
        const j = (await guard.json()) as { error?: string; code?: string };
        results.push({ conversationId, ok: false, error: j.error, code: j.code });
        continue;
      }
      const sourceConv = media || !src.mediaUrl || /^https:\/\//i.test(src.mediaUrl) || !MEDIA_KIND[src.type]
        ? null : await loadConversation(src.conversationId, member.organizationId);
      if (sourceConv && src.mediaUrl) {
        media = await downloadMedia(src.mediaUrl, sourceConv.whatsappAccount.accessToken, sourceConv.whatsappAccount.phoneNumberId);
        if (media.blob.size > MAX_FORWARD_BYTES) throw new Error("This file is too large to forward (over 16 MB).");
      }
      const stored = await forwardOne(src, target, member.userId, media);
      results.push({ conversationId, ok: true, messageId: stored.id });
    } catch (e) {
      results.push({ conversationId, ok: false, error: errMessage(e, "Forward failed") });
    }
  }

  const sent = results.filter((r) => r.ok).length;
  return NextResponse.json({ sent, results }, { status: sent ? 200 : 400 });
}

async function forwardOne(src: OwnMessage, target: LoadedConversation, userId: string, media: { blob: Blob; mimeType: string } | null) {
  const creds = { to: target.contact.phone, accessToken: target.whatsappAccount.accessToken, phoneNumberId: target.whatsappAccount.phoneNumberId };
  const x = asExtras(src.interactive);
  const extras: MessageExtras = { forwarded: true, forwardedFromId: src.id };
  let res: { messages?: { id?: string }[] };
  let data: { type: MessageType; content?: string | null; mediaUrl?: string | null; mediaType?: string | null; mediaCaption?: string | null };

  const kind = MEDIA_KIND[src.type];
  if (kind) {
    if (!src.mediaUrl) throw new Error("This message has no media to forward.");
    const caption = kind === "audio" || kind === "sticker" ? undefined : src.mediaCaption || undefined;
    let ref: Record<string, string>;
    let storedRef: string;
    let mime = src.mediaType;
    if (/^https:\/\//i.test(src.mediaUrl)) {
      ref = { link: src.mediaUrl };
      storedRef = src.mediaUrl;
    } else {
      if (!media) throw new Error("This media is no longer available on WhatsApp.");
      mime = media.mimeType.split(";")[0];
      const filename = kind === "document" ? (src.content || "document") : `forward.${mime.split("/")[1] ?? "bin"}`;
      storedRef = await uploadMedia({ file: media.blob, filename, mimeType: mime, accessToken: creds.accessToken, phoneNumberId: creds.phoneNumberId });
      ref = { id: storedRef };
    }
    if (caption) ref.caption = caption;
    if (kind === "document" && src.content) ref.filename = src.content.slice(0, 200);
    res = await sendRichMessage({ ...creds, type: kind, content: ref });
    data = { type: src.type as MessageType, content: kind === "document" ? src.content : null, mediaUrl: storedRef, mediaType: mime, mediaCaption: caption ?? null };
  } else if (src.type === "LOCATION") {
    const loc = readLocation(src);
    if (!loc) throw new Error("This location can't be read.");
    const location = { latitude: loc.latitude, longitude: loc.longitude, ...(loc.name && { name: loc.name }), ...(loc.address && { address: loc.address }) };
    res = await sendRichMessage({ ...creds, type: "location", content: location });
    extras.location = location;
    data = { type: "LOCATION", content: JSON.stringify({ lat: loc.latitude, lng: loc.longitude, ...(loc.name && { name: loc.name }), ...(loc.address && { address: loc.address }) }) };
  } else if (src.type === "CONTACTS" && x.contacts?.length) {
    res = await sendRichMessage({ ...creds, type: "contacts", content: x.contacts });
    extras.contacts = x.contacts;
    data = { type: "CONTACTS", content: src.content };
  } else {
    // Text, templates and interactive messages are forwarded as plain text.
    const text = (src.content || x.body?.text || "").trim();
    if (!text) throw new Error("This message has no text to forward.");
    res = await sendRichMessage({ ...creds, type: "text", content: { preview_url: false, body: text.slice(0, 4096) } });
    data = { type: "TEXT", content: text.slice(0, 4096) };
  }

  return storeOutbound(target, userId, { ...data, wamid: res.messages?.[0]?.id, interactive: extras as Prisma.InputJsonValue });
}
