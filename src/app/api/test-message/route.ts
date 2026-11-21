import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { GRAPH_VERSION } from "@/lib/whatsapp";
import { findOrCreateContact, findOrCreateConversation, parseIntlPhone, renderTemplateBody } from "@/lib/messaging";
import { notArchived } from "@/lib/whatsapp-accounts";
import { pusherServer, PUSHER_EVENTS, conversationChannel, orgChannel } from "@/lib/pusher";

export const dynamic = "force-dynamic";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const vars = (s: string | null | undefined) => [...new Set([...(s ?? "").matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
const MEDIA = ["IMAGE", "VIDEO", "DOCUMENT"];

/** Options for the Send Message console: active numbers + approved templates (with the inputs each needs). */
export async function GET() {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  const [accounts, templates] = await Promise.all([
    prisma.whatsappAccount.findMany({
      where: { organizationId: member.organizationId, isActive: true, ...notArchived },
      select: { id: true, displayName: true, phoneNumber: true, phoneNumberId: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.messageTemplate.findMany({
      where: { organizationId: member.organizationId, status: "APPROVED" },
      select: { id: true, name: true, language: true, category: true, headerType: true, headerContent: true, body: true, footer: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return NextResponse.json({
    accounts,
    templates: templates.map((t) => ({
      ...t,
      bodyVars: vars(t.body).length,
      headerVars: t.headerType?.toUpperCase() === "TEXT" ? vars(t.headerContent).length : 0,
      headerMedia: MEDIA.includes(t.headerType?.toUpperCase() ?? "") ? t.headerType!.toUpperCase() : null,
    })),
  });
}

/**
 * Sends one approved template to one number and returns the exact request and Meta's raw response.
 * The message is also stored (and shown in the inbox) so delivery/read/failed webhooks update its status.
 */
export async function POST(req: NextRequest) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  const orgId = member.organizationId;
  const b = (await req.json().catch(() => null)) ?? {};

  const to = parseIntlPhone(b.to);
  if (!to) return bad("Enter the recipient number with country code, e.g. 919876543210");
  const account = await prisma.whatsappAccount.findFirst({ where: { id: String(b.accountId ?? ""), organizationId: orgId, isActive: true, ...notArchived } });
  if (!account) return bad("Choose an active WhatsApp number");
  const tpl = await prisma.messageTemplate.findFirst({ where: { id: String(b.templateId ?? ""), organizationId: orgId, status: "APPROVED" } });
  if (!tpl) return bad("Choose an approved template");

  const bodyVals: string[] = Array.isArray(b.bodyVariables) ? b.bodyVariables.map((v: unknown) => String(v ?? "").slice(0, 1024)) : [];
  const nBody = vars(tpl.body).length;
  if (bodyVals.length < nBody || bodyVals.slice(0, nBody).some((v) => !v.trim())) return bad(`Fill in all ${nBody} body variable(s)`);

  const components: object[] = [];
  const headerType = tpl.headerType?.toUpperCase();
  if (headerType === "TEXT" && vars(tpl.headerContent).length) {
    const hv = String(b.headerText ?? "").trim();
    if (!hv) return bad("Fill in the header variable");
    components.push({ type: "header", parameters: [{ type: "text", text: hv.slice(0, 60) }] });
  } else if (headerType && MEDIA.includes(headerType)) {
    const link = String(b.headerMediaUrl ?? "").trim();
    if (!/^https:\/\/\S+$/i.test(link)) return bad(`This template has a ${headerType.toLowerCase()} header. Enter a public https:// link to the file.`);
    const kind = headerType.toLowerCase();
    components.push({ type: "header", parameters: [{ type: kind, [kind]: { link } }] });
  }
  if (nBody) components.push({ type: "body", parameters: bodyVals.slice(0, nBody).map((text) => ({ type: "text", text })) });
  if (tpl.category === "AUTHENTICATION" && bodyVals[0]) {
    // One-time-password templates repeat the code in the copy-code button.
    components.push({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: bodyVals[0] }] });
  }

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: { name: tpl.name, language: { code: tpl.language }, components },
  };
  const endpoint = `https://graph.facebook.com/${GRAPH_VERSION}/${account.phoneNumberId}/messages`;

  const started = Date.now();
  let httpStatus = 0;
  let metaResponse: unknown = null;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${account.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    httpStatus = res.status;
    metaResponse = await res.json().catch(() => ({ error: { message: `Non-JSON response (HTTP ${res.status})` } }));
  } catch (e) {
    metaResponse = { error: { message: `Network error: ${(e as Error).message}` } };
  }
  const durationMs = Date.now() - started;
  const r = metaResponse as { messages?: { id: string; message_status?: string }[]; error?: { message?: string; code?: number; error_data?: { details?: string } } };
  const wamid = r?.messages?.[0]?.id;
  const failureReason = wamid ? undefined : (r?.error?.error_data?.details || r?.error?.message || "Send failed").slice(0, 180);

  // Store it like any outbound message so the inbox shows it and webhooks update its status.
  const { contact } = await findOrCreateContact(orgId, to, null);
  const { conversation } = await findOrCreateConversation(orgId, contact.id, account.id);
  const content = renderTemplateBody(tpl.body, bodyVals);
  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      organizationId: orgId,
      wamid,
      direction: "OUTBOUND",
      type: "TEMPLATE",
      status: wamid ? "SENT" : "FAILED",
      content,
      templateName: tpl.name,
      templateData: { source: "console", language: tpl.language, variables: bodyVals } as Prisma.InputJsonValue,
      sentByUserId: member.userId,
      failureReason,
    },
    select: { id: true, status: true, wamid: true, failureReason: true, createdAt: true, updatedAt: true },
  });
  if (wamid) {
    await prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date(), ...(conversation.status !== "OPEN" && { status: "OPEN" }) } });
    await prisma.usageLog.create({ data: { organizationId: orgId, type: "MESSAGE_SENT" } });
  }
  await pusherServer.trigger(conversationChannel(conversation.id), PUSHER_EVENTS.NEW_MESSAGE, { message: { ...message, content } });
  await pusherServer.trigger(orgChannel(orgId), PUSHER_EVENTS.CONVERSATION_UPDATED, { conversationId: conversation.id, lastMessage: content });

  return NextResponse.json({
    ok: !!wamid,
    message,
    conversationId: conversation.id,
    request: {
      method: "POST",
      url: endpoint,
      headers: { Authorization: "Bearer ••••••••", "Content-Type": "application/json" },
      body: payload,
    },
    response: { status: httpStatus, durationMs, body: metaResponse },
  });
}
