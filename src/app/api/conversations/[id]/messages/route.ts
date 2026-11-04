import { NextRequest, NextResponse } from "next/server";
import { Prisma, type MessageType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { sendRichMessage, sendTemplateMessage } from "@/lib/whatsapp";
import { asExtras, buildInteractive, LIMITS, type InteractiveDraft, type MessageExtras, type WaContact } from "@/components/inbox/message-extras";
import { bad, errMessage, guardSend, loadConversation, resolveReplyContext, sentByUserSelect, storeOutbound } from "../_lib/outbound";

const PAGE_SIZE = 50;
const SEND_TYPES = ["text", "template", "image", "video", "audio", "document", "location", "contacts", "interactive"] as const;
type SendType = (typeof SEND_TYPES)[number];

const hiddenForMe = (m: { interactive: unknown }, userId: string) => !!asExtras(m.interactive).hiddenFor?.includes(userId);

/**
 * GET                → { messages, page, hasMore }   newest page first (?page=N), "Delete for me" rows removed
 * GET ?q=text        → { results }                   up to 50 server-side matches (search within chat)
 * GET ?starred=1     → { messages }                  messages the current user starred in this chat
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOrgMember();
  if ("response" in auth) return auth.response;
  const { member } = auth;
  const { id } = await params;
  const sp = req.nextUrl.searchParams;

  const conv = await prisma.conversation.findFirst({ where: { id, organizationId: member.organizationId }, select: { id: true } });
  if (!conv) return bad("Not found", 404);
  const base: Prisma.MessageWhereInput = { conversationId: id, organizationId: member.organizationId };

  const q = (sp.get("q") ?? "").trim().slice(0, 100);
  if (q) {
    const rows = await prisma.message.findMany({
      where: { ...base, OR: [{ content: { contains: q } }, { mediaCaption: { contains: q } }] },
      select: { id: true, createdAt: true, direction: true, type: true, content: true, mediaCaption: true, interactive: true },
      orderBy: { createdAt: "desc" },
      take: 60,
    });
    const results = rows.filter((m) => !hiddenForMe(m, member.userId)).slice(0, 50).map((m) => ({
      id: m.id, createdAt: m.createdAt, direction: m.direction, type: m.type,
      snippet: (m.content ?? m.mediaCaption ?? "").slice(0, 200),
    }));
    return NextResponse.json({ results });
  }

  if (sp.get("starred") === "1") {
    // Starred ids live in JSON; scan the most recent messages that carry extras (bounded).
    const rows = await prisma.message.findMany({
      where: { ...base, interactive: { not: Prisma.DbNull } },
      include: { sentByUser: { select: sentByUserSelect } },
      orderBy: { createdAt: "desc" },
      take: 2000,
    });
    const messages = rows.filter((m) => {
      const x = asExtras(m.interactive);
      return x.starredBy?.includes(member.userId) && !x.hiddenFor?.includes(member.userId);
    });
    return NextResponse.json({ messages });
  }

  const page = Math.max(1, parseInt(sp.get("page") ?? "1") || 1);
  const rows = await prisma.message.findMany({
    where: base,
    include: { sentByUser: { select: sentByUserSelect } },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });
  const messages = rows.filter((m) => !hiddenForMe(m, member.userId)).reverse();
  return NextResponse.json({ messages, page, hasMore: rows.length === PAGE_SIZE });
}

const isHttps = (u: unknown): u is string => typeof u === "string" && /^https:\/\/[^\s]+$/i.test(u) && u.length <= 2000;
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * POST { type, ...fields, replyToId? }
 *  text         { content }
 *  template     { templateName, languageCode, components, content? }
 *  image|video|audio|document { mediaUrl (https), caption?, mediaType? }
 *  location     { location: { latitude, longitude, name?, address? } }
 *  contacts     { contactIds: string[] }   existing org contacts → WhatsApp contact cards
 *  interactive  { interactive: InteractiveDraft }   reply buttons (≤3) or list
 * `replyToId` (a Message id in this chat with a wamid) sends it as a quoted reply (context.message_id).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOrgMember();
  if ("response" in auth) return auth.response;
  const { member } = auth;
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    body = parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return bad("Invalid JSON");
  }
  const type = String(body.type ?? "text") as SendType;
  if (!SEND_TYPES.includes(type)) return bad("Unsupported message type");

  try {
    const conversation = await loadConversation(id, member.organizationId);
    if (!conversation) return bad("Not found", 404);
    const blocked = guardSend(conversation, type !== "template");
    if (blocked) return blocked;

    const { whatsappAccount, contact } = conversation;
    const creds = { to: contact.phone, accessToken: whatsappAccount.accessToken, phoneNumberId: whatsappAccount.phoneNumberId };

    // Quoted reply (templates can't show a quote bubble, so context is ignored for them).
    const context = type === "template" ? null : await resolveReplyContext(conversation.id, member.organizationId, body.replyToId);
    if (context === "invalid") return bad("The message you're replying to can't be quoted (it may not have reached WhatsApp).");
    const extras: MessageExtras = context ? { context } : {};
    const contextMessageId = context?.wamid;

    let res: { messages?: { id?: string }[] };
    let stored: { type: MessageType; content?: string | null; mediaUrl?: string | null; mediaType?: string | null; mediaCaption?: string | null; templateName?: string | null };

    if (type === "text") {
      const content = typeof body.content === "string" ? body.content : "";
      if (!content.trim()) return bad("Message can't be empty");
      if (content.length > LIMITS.text) return bad(`Messages can be at most ${LIMITS.text} characters.`);
      res = await sendRichMessage({ ...creds, type: "text", content: { preview_url: false, body: content }, contextMessageId });
      stored = { type: "TEXT", content };
    } else if (type === "template") {
      const templateName = str(body.templateName, 512);
      if (!templateName) return bad("Choose a template");
      const components = Array.isArray(body.components) ? (body.components as object[]) : [];
      res = await sendTemplateMessage({ ...creds, templateName, languageCode: str(body.languageCode, 20) || "en", components });
      stored = { type: "TEMPLATE", content: typeof body.content === "string" ? body.content : null, templateName };
    } else if (type === "image" || type === "video" || type === "audio" || type === "document") {
      if (!isHttps(body.mediaUrl)) return bad("A public https:// media URL is required. To send a file from your device use the attach button.");
      const caption = type === "audio" ? "" : str(body.caption, 1024);
      const media: Record<string, string> = { link: body.mediaUrl };
      if (caption) media.caption = caption;
      res = await sendRichMessage({ ...creds, type, content: media, contextMessageId });
      stored = { type: type.toUpperCase() as MessageType, content: null, mediaUrl: body.mediaUrl, mediaType: str(body.mediaType, 100) || type, mediaCaption: caption || null };
    } else if (type === "location") {
      const loc = (body.location ?? {}) as Record<string, unknown>;
      const latitude = num(loc.latitude), longitude = num(loc.longitude);
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        return bad("Enter a valid latitude (−90 to 90) and longitude (−180 to 180).");
      }
      const name = str(loc.name, 200), address = str(loc.address, 500);
      const location = { latitude, longitude, ...(name && { name }), ...(address && { address }) };
      res = await sendRichMessage({ ...creds, type: "location", content: location, contextMessageId });
      extras.location = location;
      // `content` keeps the legacy {lat,lng} JSON that older readers parse.
      stored = { type: "LOCATION", content: JSON.stringify({ lat: latitude, lng: longitude, ...(name && { name }), ...(address && { address }) }) };
    } else if (type === "contacts") {
      const ids = Array.isArray(body.contactIds) ? [...new Set(body.contactIds.filter((v): v is string => typeof v === "string"))].slice(0, 10) : [];
      if (!ids.length) return bad("Choose at least one contact to share.");
      const rows = await prisma.contact.findMany({ where: { id: { in: ids }, organizationId: member.organizationId }, select: { name: true, phone: true, email: true } });
      if (!rows.length) return bad("Contact not found", 404);
      const cards: WaContact[] = rows.map((c) => {
        const digits = c.phone.replace(/\D/g, "");
        const formatted = (c.name?.trim() || `+${digits}`).slice(0, 200);
        return {
          name: { formatted_name: formatted, first_name: formatted.split(" ")[0] },
          phones: [{ phone: `+${digits}`, wa_id: digits, type: "Mobile" }],
          ...(c.email && { emails: [{ email: c.email, type: "Work" }] }),
        };
      });
      res = await sendRichMessage({ ...creds, type: "contacts", content: cards, contextMessageId });
      extras.contacts = cards;
      stored = { type: "CONTACTS", content: `Contact: ${cards.map((c) => c.name.formatted_name).join(", ")}` };
    } else {
      const built = buildInteractive((body.interactive ?? {}) as InteractiveDraft);
      if (!built.ok) return bad(built.error);
      res = await sendRichMessage({ ...creds, type: "interactive", content: built.payload, contextMessageId });
      Object.assign(extras, built.payload);
      stored = { type: "INTERACTIVE", content: built.payload.body.text ?? null };
    }

    const message = await storeOutbound(conversation, member.userId, {
      ...stored,
      wamid: res.messages?.[0]?.id,
      ...(Object.keys(extras).length && { interactive: extras as Prisma.InputJsonValue }),
    });
    return NextResponse.json({ message });
  } catch (error) {
    console.error("Send message error:", error);
    return bad(errMessage(error), 502, "SEND_FAILED");
  }
}
