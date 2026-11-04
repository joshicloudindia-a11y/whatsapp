/**
 * Chatbot runtime — executes active chatbot flows on inbound WhatsApp messages.
 *
 * Entry point: `runChatbotForInbound()` (called once from the WhatsApp webhook
 * after the inbound message is stored). It never throws.
 *
 * Trigger matching (only when the contact isn't already inside a bot):
 *   KEYWORD            message equals / contains (whole word) one of the comma-separated keywords
 *   TEMPLATE_RECEIVED  customer tapped a template quick-reply button (optional comma list of button texts)
 *   INBOUND_AD         message carries a Click-to-WhatsApp ad referral
 *   NEW_CONVERSATION   first inbound message of a conversation, and no agent assigned
 *   ANY_MESSAGE        any message when no agent is assigned (15 min cooldown per contact)
 * Priority: KEYWORD > TEMPLATE_RECEIVED > INBOUND_AD > NEW_CONVERSATION > ANY_MESSAGE.
 * A keyword match always (re)starts its bot, even mid-session.
 *
 * Supported node types:
 *   sendMessage   sends text ({{name}}, {{phone}}, {{message}} and saved variables are substituted)
 *   askQuestion   sends the question (reply buttons / list when options are set) and waits for the reply;
 *                 the answer is stored in the variable (and optionally as a contact attribute)
 *   condition     equals / not_equals / contains / starts_with / is_empty / not_empty → "true"/"false" branch
 *   setAttribute  upserts a ContactAttribute and sets the variable
 *   assignAgent   optional message, assigns the conversation (or leaves it for the team) and ends the bot
 *   delay         waits 1–10 s
 *   endFlow       optional closing message, ends the bot
 *   httpRequest   NOT executed (skipped, flow continues) — no outbound calls to user-supplied URLs
 *
 * Free-form replies are only sent while the 24h customer-service window is open
 * (always true right after an inbound message) and when the WhatsApp number is enabled.
 */
import { prisma } from "@/lib/prisma";
import { sendInteractiveMessage, sendTextMessage } from "@/lib/whatsapp";
import { pusherServer, PUSHER_EVENTS, conversationChannel, orgChannel } from "@/lib/pusher";
import {
  isTerminal, outEdge, parseKeywords, sanitizeFlow, findStart, LIMITS,
  type FlowEdge, type FlowNode, type TriggerType,
} from "@/components/chatbot/flow";

const MAX_STEPS = 25;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const ANY_MESSAGE_COOLDOWN_MS = 15 * 60 * 1000;
const PRIORITY: TriggerType[] = ["KEYWORD", "TEMPLATE_RECEIVED", "INBOUND_AD", "NEW_CONVERSATION", "ANY_MESSAGE"];

interface WaAccount { id: string; organizationId: string; phoneNumberId: string; accessToken: string; isActive?: boolean }
interface InboundMsg {
  id?: string; type?: string;
  text?: { body?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
  button?: { text?: string; payload?: string };
  referral?: unknown;
}
type Vars = Record<string, string>;

interface Ctx {
  orgId: string;
  account: WaAccount;
  conversationId: string;
  contact: { id: string; phone: string; name: string | null };
  vars: Vars;
}

export async function runChatbotForInbound(args: { msg: InboundMsg; waAccount: WaAccount; contactId: string; conversationId: string }) {
  try {
    await run(args);
  } catch (err) {
    console.error("[chatbot] runtime error:", err);
  }
}

function inboundText(msg: InboundMsg): string {
  return (msg.text?.body ?? msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title ?? msg.button?.text ?? "").trim();
}

function keywordMatches(text: string, keywords: string[]) {
  const t = text.toLowerCase();
  if (!t) return false;
  return keywords.some((k) => {
    if (t === k) return true;
    const esc = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^\\p{L}\\p{N}])${esc}($|[^\\p{L}\\p{N}])`, "u").test(t);
  });
}

async function run({ msg, waAccount, contactId, conversationId }: { msg: InboundMsg; waAccount: WaAccount; contactId: string; conversationId: string }) {
  const orgId = waAccount.organizationId;
  if (waAccount.isActive === false) return;

  const [contact, conversation] = await Promise.all([
    prisma.contact.findFirst({ where: { id: contactId, organizationId: orgId }, select: { id: true, phone: true, name: true, isBlocked: true, optedOut: true } }),
    prisma.conversation.findFirst({ where: { id: conversationId, organizationId: orgId }, select: { id: true, assignedAgentId: true, sessionExpiresAt: true } }),
  ]);
  if (!contact || !conversation || contact.isBlocked || contact.optedOut) return;
  if (!conversation.sessionExpiresAt || conversation.sessionExpiresAt.getTime() <= Date.now()) return; // 24h window closed

  const bots = await prisma.chatbot.findMany({ where: { organizationId: orgId, isActive: true }, orderBy: { updatedAt: "desc" } });
  if (bots.length === 0) return;

  const text = inboundText(msg);
  const keywordBot = bots.find((b) => b.triggerType === "KEYWORD" && keywordMatches(text, parseKeywords(b.triggerValue)));

  // Resume an open session unless a keyword explicitly starts a (new) bot.
  const session = await prisma.chatbotSession.findFirst({
    where: { contactId: contact.id, isActive: true, chatbot: { organizationId: orgId } },
    orderBy: { startedAt: "desc" },
  });
  if (session) {
    const bot = bots.find((b) => b.id === session.chatbotId);
    const expired = Date.now() - session.startedAt.getTime() > SESSION_TTL_MS;
    // A human replying in the chat takes over from the bot.
    const humanTookOver = !!(await prisma.message.findFirst({
      where: { conversationId: conversation.id, direction: "OUTBOUND", isBotMessage: false, sentByUserId: { not: null }, createdAt: { gte: session.startedAt } },
      select: { id: true },
    }));
    if (!bot || expired || keywordBot || humanTookOver) {
      await prisma.chatbotSession.updateMany({ where: { contactId: contact.id, isActive: true }, data: { isActive: false, endedAt: new Date() } });
    } else {
      const { nodes, edges } = sanitizeFlow(bot.nodes, bot.edges);
      const vars = { ...(session.variables as Vars | null ?? {}), message: text };
      const ctx: Ctx = { orgId, account: waAccount, conversationId: conversation.id, contact, vars };
      const waiting = nodes.find((n) => n.id === session.currentNodeId);
      if (!waiting || waiting.type !== "askQuestion") {
        await endSession(session.id);
      } else {
        const opts = (waiting.data.options ?? []).filter(Boolean);
        let answer = text;
        if (opts.length) {
          const idx = /^\d+$/.test(text) ? Number(text) - 1 : -1;
          const match = opts.find((o) => o.toLowerCase() === text.toLowerCase()) ?? opts[idx];
          if (!match) {
            await sendBotText(ctx, "Please choose one of the options below.");
            await sendQuestion(ctx, waiting);
            return;
          }
          answer = match;
        }
        if (!answer) return; // e.g. an image when we expect text — keep waiting
        const v = waiting.data.variable;
        if (v) {
          ctx.vars[v] = answer;
          if (waiting.data.saveToContact) await saveAttribute(contact.id, v, answer);
        }
        await execute(ctx, session.id, nodes, edges, outEdge(edges, waiting.id)?.target ?? null);
        return;
      }
    }
  }

  // Pick a bot to start.
  const candidates: Record<TriggerType, typeof bots[number] | undefined> = {
    KEYWORD: keywordBot,
    TEMPLATE_RECEIVED: msg.type === "button"
      ? bots.find((b) => b.triggerType === "TEMPLATE_RECEIVED" && (parseKeywords(b.triggerValue).length === 0 || parseKeywords(b.triggerValue).includes(text.toLowerCase())))
      : undefined,
    INBOUND_AD: msg.referral ? bots.find((b) => b.triggerType === "INBOUND_AD") : undefined,
    NEW_CONVERSATION: undefined,
    ANY_MESSAGE: undefined,
  };
  if (!conversation.assignedAgentId) {
    const newConvBot = bots.find((b) => b.triggerType === "NEW_CONVERSATION");
    if (newConvBot) {
      const inboundCount = await prisma.message.count({ where: { conversationId: conversation.id, direction: "INBOUND" } });
      if (inboundCount <= 1) candidates.NEW_CONVERSATION = newConvBot;
    }
    const anyBot = bots.find((b) => b.triggerType === "ANY_MESSAGE");
    if (anyBot) {
      const recent = await prisma.chatbotSession.findFirst({
        where: { chatbotId: anyBot.id, contactId: contact.id, startedAt: { gte: new Date(Date.now() - ANY_MESSAGE_COOLDOWN_MS) } },
        select: { id: true },
      });
      if (!recent) candidates.ANY_MESSAGE = anyBot;
    }
  }
  const bot = PRIORITY.map((p) => candidates[p]).find(Boolean);
  if (!bot) return;

  const { nodes, edges } = sanitizeFlow(bot.nodes, bot.edges);
  const start = findStart(nodes, edges);
  if (!start) return;

  const created = await prisma.chatbotSession.create({
    data: { chatbotId: bot.id, contactId: contact.id, currentNodeId: start.id, variables: {} },
  });
  await prisma.usageLog.create({ data: { organizationId: orgId, type: "CHATBOT_SESSION" } }).catch(() => undefined);

  const ctx: Ctx = { orgId, account: waAccount, conversationId: conversation.id, contact, vars: { message: text } };
  await execute(ctx, created.id, nodes, edges, start.id);
}

async function execute(ctx: Ctx, sessionId: string, nodes: FlowNode[], edges: FlowEdge[], startId: string | null) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let current = startId ? byId.get(startId) : undefined;

  for (let step = 0; current && step < MAX_STEPS; step++) {
    const node: FlowNode = current;
    const d = node.data;
    let next: string | null = outEdge(edges, node.id)?.target ?? null;

    switch (node.type) {
      case "sendMessage": {
        const body = interpolate(d.content ?? "", ctx).trim();
        if (body && !(await sendBotText(ctx, body))) return endSession(sessionId, ctx.vars);
        break;
      }
      case "askQuestion": {
        if (!(await sendQuestion(ctx, node))) return endSession(sessionId, ctx.vars);
        await prisma.chatbotSession.update({ where: { id: sessionId }, data: { currentNodeId: node.id, variables: ctx.vars } });
        return; // wait for the customer's reply
      }
      case "condition": {
        next = outEdge(edges, node.id, evaluate(node, ctx) ? "true" : "false")?.target ?? null;
        break;
      }
      case "setAttribute": {
        if (d.key) {
          const value = interpolate(d.value ?? "", ctx).trim().slice(0, 500);
          ctx.vars[d.key] = value;
          await saveAttribute(ctx.contact.id, d.key, value);
        }
        break;
      }
      case "assignAgent": {
        const body = interpolate(d.content ?? "", ctx).trim();
        if (body) await sendBotText(ctx, body);
        let agentId: string | null = null;
        if (d.agentId) {
          const m = await prisma.organizationMember.findFirst({ where: { organizationId: ctx.orgId, userId: d.agentId, isActive: true }, select: { userId: true } });
          agentId = m?.userId ?? null;
        }
        await prisma.conversation.update({
          where: { id: ctx.conversationId },
          data: { status: "OPEN", isRead: false, ...(agentId && { assignedAgentId: agentId }) },
        });
        await safeTrigger(orgChannel(ctx.orgId), PUSHER_EVENTS.CONVERSATION_UPDATED, { conversationId: ctx.conversationId });
        return endSession(sessionId, ctx.vars);
      }
      case "delay": {
        const s = Math.min(LIMITS.delay, Math.max(1, d.seconds ?? 1));
        await new Promise((r) => setTimeout(r, s * 1000));
        break;
      }
      case "endFlow": {
        const body = interpolate(d.content ?? "", ctx).trim();
        if (body) await sendBotText(ctx, body);
        return endSession(sessionId, ctx.vars);
      }
      case "httpRequest":
      default:
        break; // not executed by the runtime
    }

    if (isTerminal(node.type)) return endSession(sessionId, ctx.vars);
    current = next ? byId.get(next) : undefined;
  }
  await endSession(sessionId, ctx.vars);
}

function evaluate(node: FlowNode, ctx: Ctx): boolean {
  const key = node.data.variable ?? "";
  const actual = (ctx.vars[key] ?? (key === "name" ? ctx.contact.name ?? "" : key === "phone" ? ctx.contact.phone : "")).trim().toLowerCase();
  const expected = interpolate(node.data.value ?? "", ctx).trim().toLowerCase();
  switch (node.data.operator) {
    case "not_equals": return actual !== expected;
    case "contains": return actual.includes(expected);
    case "starts_with": return actual.startsWith(expected);
    case "is_empty": return actual === "";
    case "not_empty": return actual !== "";
    case "equals":
    default: return actual === expected;
  }
}

function interpolate(text: string, ctx: Ctx) {
  return text.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (_, k: string) => {
    if (ctx.vars[k] !== undefined) return ctx.vars[k];
    if (k === "name") return ctx.contact.name ?? "there";
    if (k === "phone") return ctx.contact.phone;
    return "";
  });
}

async function endSession(id: string, vars?: Vars) {
  await prisma.chatbotSession.update({
    where: { id },
    data: { isActive: false, endedAt: new Date(), currentNodeId: null, ...(vars && { variables: vars }) },
  }).catch(() => undefined);
}

async function saveAttribute(contactId: string, key: string, value: string) {
  await prisma.contactAttribute.upsert({
    where: { contactId_key: { contactId, key } },
    create: { contactId, key, value },
    update: { value },
  }).catch((e) => console.error("[chatbot] attribute save failed:", e));
}

async function safeTrigger(channel: string, event: string, payload: object) {
  try { await pusherServer.trigger(channel, event, payload); } catch { /* realtime is best-effort */ }
}

/** Sends, stores and broadcasts one outbound bot message. Returns false if Meta rejected it. */
async function storeOutbound(ctx: Ctx, kind: "TEXT" | "INTERACTIVE", content: string, send: () => Promise<{ messages?: { id?: string }[] }>, interactive?: object, keepFailed = true) {
  let wamid: string | undefined;
  let failure: string | undefined;
  try {
    const res = await send();
    wamid = res.messages?.[0]?.id;
  } catch (e) {
    failure = e instanceof Error ? e.message : "Send failed";
  }
  if (failure && !keepFailed) {
    console.warn("[chatbot] interactive send failed, falling back to text:", failure);
    return false;
  }
  const message = await prisma.message.create({
    data: {
      conversationId: ctx.conversationId,
      organizationId: ctx.orgId,
      wamid,
      direction: "OUTBOUND",
      type: kind,
      status: failure ? "FAILED" : "SENT",
      failureReason: failure?.slice(0, 190),
      content,
      ...(interactive && { interactive: interactive as never }),
      isBotMessage: true,
    },
  });
  await prisma.conversation.update({ where: { id: ctx.conversationId }, data: { lastMessageAt: new Date() } });
  await safeTrigger(conversationChannel(ctx.conversationId), PUSHER_EVENTS.NEW_MESSAGE, { message });
  await safeTrigger(orgChannel(ctx.orgId), PUSHER_EVENTS.CONVERSATION_UPDATED, { conversationId: ctx.conversationId, lastMessage: content });
  if (!failure) await prisma.usageLog.create({ data: { organizationId: ctx.orgId, type: "MESSAGE_SENT" } }).catch(() => undefined);
  else console.error("[chatbot] send failed:", failure);
  return !failure;
}

function sendBotText(ctx: Ctx, text: string) {
  const body = text.slice(0, LIMITS.text);
  return storeOutbound(ctx, "TEXT", body, () =>
    sendTextMessage({ to: ctx.contact.phone, text: body, accessToken: ctx.account.accessToken, phoneNumberId: ctx.account.phoneNumberId }));
}

async function sendQuestion(ctx: Ctx, node: FlowNode) {
  const question = interpolate(node.data.content ?? "", ctx).trim().slice(0, LIMITS.question) || "Please reply";
  const opts = (node.data.options ?? []).map((o) => o.trim()).filter(Boolean).slice(0, LIMITS.options);
  if (opts.length === 0) return sendBotText(ctx, question);

  const interactive = opts.length <= 3 && opts.every((o) => o.length <= 20)
    ? { type: "button", body: { text: question }, action: { buttons: opts.map((o, i) => ({ type: "reply", reply: { id: `opt_${i}`, title: o } })) } }
    : { type: "list", body: { text: question }, action: { button: "Choose", sections: [{ title: "Options", rows: opts.map((o, i) => ({ id: `opt_${i}`, title: o.slice(0, 24) })) }] } };

  const ok = await storeOutbound(ctx, "INTERACTIVE", question, () =>
    sendInteractiveMessage({ to: ctx.contact.phone, interactive, accessToken: ctx.account.accessToken, phoneNumberId: ctx.account.phoneNumberId }), interactive, false);
  if (ok) return true;
  // Fallback: numbered plain-text menu (the customer can reply with the number or the text).
  return sendBotText(ctx, `${question}\n\n${opts.map((o, i) => `${i + 1}. ${o}`).join("\n")}`);
}
