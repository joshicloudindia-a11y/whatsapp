/**
 * Rule-based automation runtime.
 *
 * Invoked once per *new* inbound WhatsApp message from the webhook
 * (`handleInboundMessage` in src/app/api/webhook/whatsapp/route.ts), after the
 * message row is stored and after any chatbot runtime has run.
 *
 * Events fired for an inbound message (an automation runs at most once per message):
 *   CONTACT_CREATED      – contact row was created moments ago and this is its first inbound message
 *   CONVERSATION_CREATED – this message is the first one in its conversation
 *   BROADCAST_REPLIED    – first inbound message within 7 days after a broadcast was sent to the contact
 *   MESSAGE_RECEIVED     – every inbound message
 *
 * Safety rules:
 *   - Never throws (everything is caught and logged).
 *   - Text replies are only sent while the 24h customer-service window is open,
 *     never to blocked / opted-out contacts, and at most ONE automated text reply
 *     per inbound message (keyword-specific automations are evaluated first).
 *   - If a chatbot already replied to this inbound message, automations skip their
 *     text reply but still run non-message actions (assign, tag, stage, status).
 *     Order: chatbot (keyword-triggered bots) first, then automations (events).
 *   - Per-automation repeat limit (`cooldownHours`) per contact, tracked via
 *     Message.templateData.automationId on the stored outbound reply.
 *   - Outbound messages never produce inbound webhooks, so replies can't loop.
 */
import { prisma } from "@/lib/prisma";
import { sendTextMessage } from "@/lib/whatsapp";
import { pusherServer, PUSHER_EVENTS, conversationChannel, orgChannel } from "@/lib/pusher";
import {
  parseActions, parseConditions, SUPPORTED_EVENTS,
  type Action, type AutomationEvent, type Condition,
} from "@/components/automation/schema";

export const AUTOMATION_MANAGER_ROLES: string[] = ["ADMIN", "AUTOMATION_MANAGER"];

/** Returns an error message unless every id is an active member of the organization. */
export async function validateAssignees(organizationId: string, ids: string[]): Promise<string | null> {
  if (!ids.length) return null;
  const count = await prisma.organizationMember.count({ where: { organizationId, userId: { in: ids }, isActive: true } });
  return count === ids.length ? null : "One of the selected agents is no longer an active team member";
}

export interface InboundAutomationInput {
  organizationId: string;
  whatsappAccount: { id: string; phoneNumberId: string; accessToken: string; isActive: boolean };
  contactId: string;
  conversationId: string;
  messageId: string;
  text: string | null;
}

const HOUR = 60 * 60 * 1000;
const EVENT_ORDER: AutomationEvent[] = ["CONTACT_CREATED", "CONVERSATION_CREATED", "BROADCAST_REPLIED", "MESSAGE_RECEIVED"];

/** Entry point for the webhook. Never throws. */
export async function runInboundAutomations(input: InboundAutomationInput): Promise<void> {
  try {
    await run(input);
  } catch (err) {
    console.error("[automation] run failed", input.conversationId, err);
  }
}

interface State {
  assignedAgentId: string | null;
  status: string;
  stage: string;
  tags: Set<string>;
  sessionOpen: boolean;
  textBudget: number;
}

async function run(input: InboundAutomationInput) {
  const { organizationId, conversationId, contactId, messageId } = input;

  const automations = await prisma.automation.findMany({
    where: { organizationId, isActive: true, triggerEvent: { in: SUPPORTED_EVENTS as never } },
    orderBy: { createdAt: "asc" },
  });
  if (!automations.length) return;

  const [message, conversation, contact, org] = await Promise.all([
    prisma.message.findFirst({ where: { id: messageId, organizationId }, select: { createdAt: true } }),
    prisma.conversation.findFirst({ where: { id: conversationId, organizationId }, select: { status: true, assignedAgentId: true, sessionExpiresAt: true } }),
    prisma.contact.findFirst({ where: { id: contactId, organizationId }, include: { tags: { select: { tag: true } } } }),
    prisma.organization.findUnique({ where: { id: organizationId }, select: { timezone: true } }),
  ]);
  if (!message || !conversation || !contact || contact.isBlocked) return;

  const now = new Date();
  const triggers = new Set(automations.map((a) => a.triggerEvent as AutomationEvent));
  const inboundCount = (where: object) => prisma.message.count({ where: { organizationId, direction: "INBOUND", conversation: { contactId }, ...where } });

  // Which events does this inbound message represent?
  const events = new Set<AutomationEvent>(["MESSAGE_RECEIVED"]);
  if (triggers.has("CONVERSATION_CREATED") && (await prisma.message.count({ where: { conversationId } })) === 1) events.add("CONVERSATION_CREATED");
  if (triggers.has("CONTACT_CREATED") && message.createdAt.getTime() - contact.createdAt.getTime() < 5 * 60 * 1000 && (await inboundCount({})) === 1) events.add("CONTACT_CREATED");
  if (triggers.has("BROADCAST_REPLIED")) {
    const recipient = await prisma.broadcastRecipient.findFirst({
      where: { contactId, status: { in: ["SENT", "DELIVERED", "READ"] }, sentAt: { gte: new Date(now.getTime() - 7 * 24 * HOUR) } },
      orderBy: { sentAt: "desc" }, select: { sentAt: true },
    });
    if (recipient?.sentAt && (await inboundCount({ createdAt: { gt: recipient.sentAt }, id: { not: messageId } })) === 0) events.add("BROADCAST_REPLIED");
  }

  const matching = automations
    .filter((a) => events.has(a.triggerEvent as AutomationEvent))
    .map((a) => ({ row: a, conditions: parseConditions(a.conditions), actions: parseActions(a.actions) }))
    .filter((a) => a.actions.length > 0)
    // Most specific first: keyword rules win the single text reply, then event order, then oldest.
    .sort((a, b) =>
      Number(b.conditions.some((c) => c.type === "keyword")) - Number(a.conditions.some((c) => c.type === "keyword")) ||
      EVENT_ORDER.indexOf(a.row.triggerEvent as AutomationEvent) - EVENT_ORDER.indexOf(b.row.triggerEvent as AutomationEvent) ||
      a.row.createdAt.getTime() - b.row.createdAt.getTime());
  if (!matching.length) return;

  // Did a chatbot (or anything else automated) already answer this message?
  const botReplies = await prisma.message.findMany({
    where: { conversationId, direction: "OUTBOUND", isBotMessage: true, createdAt: { gte: message.createdAt } },
    select: { templateData: true }, take: 20,
  });
  const chatbotReplied = botReplies.some((m) => !automationIdOf(m.templateData));

  const state: State = {
    assignedAgentId: conversation.assignedAgentId,
    status: conversation.status,
    stage: contact.stage,
    tags: new Set(contact.tags.map((t) => t.tag.toLowerCase())),
    sessionOpen: !!conversation.sessionExpiresAt && conversation.sessionExpiresAt > now,
    textBudget: chatbotReplied ? 0 : 1,
  };

  let firstConversation: boolean | null = null;
  const isFirstConversation = async () => {
    firstConversation ??= (await prisma.conversation.count({ where: { organizationId, contactId } })) <= 1;
    return firstConversation;
  };

  for (const a of matching) {
    try {
      let pass = true;
      for (const c of a.conditions) {
        if (!(await conditionMatches(c, { text: input.text, state, timezone: org?.timezone ?? "UTC", now, isFirstConversation }))) { pass = false; break; }
      }
      if (!pass) continue;

      let performed = 0;
      for (const action of a.actions) {
        try {
          if (await executeAction(action, { input, automation: a.row, contact, state, now })) performed++;
        } catch (err) {
          console.error("[automation] action failed", a.row.id, action.type, err);
        }
      }
      if (performed > 0) await recordRun(organizationId, a.row.id);
    } catch (err) {
      console.error("[automation] automation failed", a.row.id, err);
    }
  }
}

function automationIdOf(templateData: unknown): string | null {
  const v = templateData as { source?: string; automationId?: string } | null;
  return v && v.source === "automation" && typeof v.automationId === "string" ? v.automationId : null;
}

async function recordRun(organizationId: string, automationId: string) {
  await prisma.automation.update({ where: { id: automationId }, data: { runCount: { increment: 1 } } });
  await prisma.usageLog.create({ data: { organizationId, type: "AUTOMATION_TRIGGER", metadata: { automationId } } });
  await prisma.subscription.updateMany({ where: { organizationId }, data: { automationTriggersUsed: { increment: 1 } } });
}

// ─── Conditions ──────────────────────────────────────────────────────────────
const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

async function conditionMatches(
  c: Condition,
  ctx: { text: string | null; state: State; timezone: string; now: Date; isFirstConversation: () => Promise<boolean> },
): Promise<boolean> {
  switch (c.type) {
    case "keyword": {
      if (!ctx.text) return false;
      const raw = ctx.text.toLowerCase();
      const text = normalize(ctx.text);
      return c.keywords.some((k) => {
        const kw = normalize(k);
        if (c.match === "equals") return text === kw;
        if (c.match === "starts_with") return !!kw && (text === kw || text.startsWith(`${kw} `) || raw.trim().startsWith(k));
        return raw.includes(k) || (!!kw && text.includes(kw));
      });
    }
    case "business_hours": {
      const inside = isWithinHours(c, ctx.timezone, ctx.now);
      return c.when === "inside" ? inside : !inside;
    }
    case "contact_tag": {
      const has = ctx.state.tags.has(c.tag.toLowerCase());
      return c.op === "has" ? has : !has;
    }
    case "contact_stage": return c.op === "is" ? ctx.state.stage === c.stage : ctx.state.stage !== c.stage;
    case "first_conversation": return ctx.isFirstConversation();
    case "unassigned": return !ctx.state.assignedAgentId;
  }
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function localTime(timezone: string, now: Date) {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  } catch {
    parts = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { day: Math.max(0, WEEKDAYS.indexOf(get("weekday"))), minutes: (Number(get("hour")) % 24) * 60 + Number(get("minute")) };
}

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** True when `now` falls in the working hours. Supports overnight shifts (e.g. 22:00–06:00). */
export function isWithinHours(c: { days: number[]; start: string; end: string }, timezone: string, now: Date): boolean {
  const { day, minutes } = localTime(timezone, now);
  const start = toMinutes(c.start), end = toMinutes(c.end);
  if (start < end) return c.days.includes(day) && minutes >= start && minutes < end;
  const prev = (day + 6) % 7;
  return (c.days.includes(day) && minutes >= start) || (c.days.includes(prev) && minutes < end);
}

// ─── Actions ─────────────────────────────────────────────────────────────────
type ContactRow = { id: string; name: string | null; phone: string; optedOut: boolean };
interface ActionCtx { input: InboundAutomationInput; automation: { id: string; name: string }; contact: ContactRow; state: State; now: Date }

/** Returns true when the action changed something / sent something. */
async function executeAction(action: Action, ctx: ActionCtx): Promise<boolean> {
  const { input, state, contact } = ctx;
  const { organizationId, conversationId } = input;

  switch (action.type) {
    case "send_text":
      return sendReply(action, ctx);

    case "assign_agent": {
      if (state.assignedAgentId && !action.overwrite) return false;
      const active = await prisma.organizationMember.findMany({
        where: { organizationId, isActive: true, userId: { in: action.userIds } }, select: { userId: true },
      });
      const activeIds = new Set(active.map((m) => m.userId));
      const pool = action.userIds.filter((id) => activeIds.has(id));
      if (!pool.length) return false;

      let agentId = pool[0];
      if (action.mode === "round_robin" && pool.length > 1) {
        const last = await prisma.conversation.findFirst({
          where: { organizationId, id: { not: conversationId }, assignedAgentId: { in: pool } },
          orderBy: { createdAt: "desc" }, select: { assignedAgentId: true },
        });
        const idx = last?.assignedAgentId ? pool.indexOf(last.assignedAgentId) : -1;
        agentId = pool[(idx + 1) % pool.length];
      } else if (action.mode === "least_busy" && pool.length > 1) {
        const loads = await prisma.conversation.groupBy({
          by: ["assignedAgentId"],
          where: { organizationId, assignedAgentId: { in: pool }, status: { in: ["OPEN", "PENDING"] }, id: { not: conversationId } },
          _count: { _all: true },
        });
        const load = new Map(loads.map((l) => [l.assignedAgentId, l._count._all]));
        agentId = pool.reduce((best, id) => ((load.get(id) ?? 0) < (load.get(best) ?? 0) ? id : best), pool[0]);
      }
      if (agentId === state.assignedAgentId) return false;

      await prisma.conversation.update({ where: { id: conversationId }, data: { assignedAgentId: agentId } });
      state.assignedAgentId = agentId;
      await pusherServer.trigger(orgChannel(organizationId), PUSHER_EVENTS.CONVERSATION_ASSIGNED, { conversationId, agentId });
      return true;
    }

    case "add_tag": {
      if (state.tags.has(action.tag.toLowerCase())) return false;
      await prisma.contactTag.upsert({
        where: { contactId_tag: { contactId: contact.id, tag: action.tag } },
        create: { contactId: contact.id, tag: action.tag },
        update: {},
      });
      state.tags.add(action.tag.toLowerCase());
      await pusherServer.trigger(orgChannel(organizationId), PUSHER_EVENTS.CONTACT_UPDATED, { contactId: contact.id });
      return true;
    }

    case "remove_tag": {
      if (!state.tags.has(action.tag.toLowerCase())) return false;
      const res = await prisma.contactTag.deleteMany({ where: { contactId: contact.id, tag: action.tag } });
      state.tags.delete(action.tag.toLowerCase());
      if (res.count) await pusherServer.trigger(orgChannel(organizationId), PUSHER_EVENTS.CONTACT_UPDATED, { contactId: contact.id });
      return res.count > 0;
    }

    case "set_stage": {
      if (state.stage === action.stage) return false;
      await prisma.contact.update({ where: { id: contact.id }, data: { stage: action.stage } });
      state.stage = action.stage;
      await pusherServer.trigger(orgChannel(organizationId), PUSHER_EVENTS.CONTACT_UPDATED, { contactId: contact.id });
      return true;
    }

    case "set_status": {
      if (state.status === action.status) return false;
      await prisma.conversation.update({ where: { id: conversationId }, data: { status: action.status } });
      state.status = action.status;
      await pusherServer.trigger(orgChannel(organizationId), PUSHER_EVENTS.CONVERSATION_UPDATED, { conversationId });
      return true;
    }
  }
}

function renderText(text: string, contact: ContactRow) {
  const name = contact.name?.trim() || "there";
  return text
    .replace(/\{\{\s*first_name\s*\}\}/gi, name.split(/\s+/)[0])
    .replace(/\{\{\s*name\s*\}\}/gi, name)
    .replace(/\{\{\s*phone\s*\}\}/gi, contact.phone);
}

async function sendReply(action: Extract<Action, { type: "send_text" }>, ctx: ActionCtx): Promise<boolean> {
  const { input, state, contact, automation, now } = ctx;
  const { organizationId, conversationId, whatsappAccount } = input;

  if (state.textBudget <= 0 || !state.sessionOpen || contact.optedOut || !whatsappAccount.isActive) return false;

  if (action.cooldownHours > 0) {
    const recent = await prisma.message.findMany({
      where: {
        organizationId, direction: "OUTBOUND", isBotMessage: true,
        createdAt: { gte: new Date(now.getTime() - action.cooldownHours * HOUR) },
        conversation: { contactId: contact.id },
      },
      select: { templateData: true }, take: 200,
    });
    if (recent.some((m) => automationIdOf(m.templateData) === automation.id)) return false;
  }

  // Reserve the reply before the network call so a parallel action can't double-send.
  state.textBudget--;
  const content = renderText(action.text, contact);
  let wamid: string | undefined;
  let failureReason: string | undefined;
  try {
    const res = await sendTextMessage({ to: contact.phone, text: content, accessToken: whatsappAccount.accessToken, phoneNumberId: whatsappAccount.phoneNumberId });
    wamid = res?.messages?.[0]?.id;
  } catch (err) {
    failureReason = (err instanceof Error ? err.message : String(err)).slice(0, 180);
    console.error("[automation] send failed", automation.id, failureReason);
  }

  const message = await prisma.message.create({
    data: {
      conversationId, organizationId, wamid,
      direction: "OUTBOUND", type: "TEXT", status: failureReason ? "FAILED" : "SENT",
      content, isBotMessage: true, failureReason,
      templateData: { source: "automation", automationId: automation.id, automationName: automation.name },
    },
  });
  await prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } });
  await pusherServer.trigger(conversationChannel(conversationId), PUSHER_EVENTS.NEW_MESSAGE, { message });
  await pusherServer.trigger(orgChannel(organizationId), PUSHER_EVENTS.CONVERSATION_UPDATED, { conversationId, lastMessage: content });
  if (!failureReason) await prisma.usageLog.create({ data: { organizationId, type: "MESSAGE_SENT" } });
  return !failureReason;
}
