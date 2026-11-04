// Automation rule definitions shared by the builder UI, the API (validation)
// and the runtime (src/lib/automation-runtime.ts). Client-safe: no server imports.

export const AUTOMATION_EVENTS = [
  "MESSAGE_RECEIVED", "CONVERSATION_CREATED", "CONTACT_CREATED", "BROADCAST_REPLIED",
  "CONVERSATION_ASSIGNED", "CONVERSATION_RESOLVED", "CONTACT_UPDATED",
] as const;
export type AutomationEvent = (typeof AUTOMATION_EVENTS)[number];

/** Events the runtime actually fires (all derived from inbound WhatsApp messages). */
export const SUPPORTED_EVENTS: AutomationEvent[] = ["MESSAGE_RECEIVED", "CONVERSATION_CREATED", "CONTACT_CREATED", "BROADCAST_REPLIED"];

export const EVENT_META: Record<AutomationEvent, { label: string; when: string; description: string; icon: string }> = {
  MESSAGE_RECEIVED: { label: "Message received", when: "a customer sends a message", description: "Every inbound WhatsApp message.", icon: "chat" },
  CONVERSATION_CREATED: { label: "New conversation", when: "a new conversation starts", description: "The first message of a new (or re-opened after resolve) conversation.", icon: "forum" },
  CONTACT_CREATED: { label: "New contact", when: "a brand-new contact messages", description: "Someone who isn't in your contacts yet messages you.", icon: "person_add" },
  BROADCAST_REPLIED: { label: "Broadcast reply", when: "a customer replies to a broadcast", description: "First reply within 7 days of receiving a broadcast.", icon: "campaign" },
  CONVERSATION_ASSIGNED: { label: "Conversation assigned", when: "a conversation is assigned", description: "Not available yet.", icon: "support_agent" },
  CONVERSATION_RESOLVED: { label: "Conversation resolved", when: "a conversation is resolved", description: "Not available yet.", icon: "task_alt" },
  CONTACT_UPDATED: { label: "Contact updated", when: "a contact is updated", description: "Not available yet.", icon: "contacts" },
};

export const STAGES = ["LEAD", "PROSPECT", "CUSTOMER", "CHURNED"] as const;
export type Stage = (typeof STAGES)[number];
export const CONV_STATUSES = ["OPEN", "PENDING", "RESOLVED", "SNOOZED"] as const;
export type ConvStatus = (typeof CONV_STATUSES)[number];
export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const cap = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export type Condition =
  | { type: "keyword"; match: "contains" | "equals" | "starts_with"; keywords: string[] }
  | { type: "business_hours"; when: "inside" | "outside"; days: number[]; start: string; end: string }
  | { type: "contact_tag"; op: "has" | "not_has"; tag: string }
  | { type: "contact_stage"; op: "is" | "is_not"; stage: Stage }
  | { type: "first_conversation" }
  | { type: "unassigned" };

export type Action =
  | { type: "send_text"; text: string; cooldownHours: number }
  | { type: "assign_agent"; mode: "specific" | "round_robin" | "least_busy"; userIds: string[]; overwrite: boolean }
  | { type: "add_tag"; tag: string }
  | { type: "remove_tag"; tag: string }
  | { type: "set_stage"; stage: Stage }
  | { type: "set_status"; status: ConvStatus };

export type ConditionType = Condition["type"];
export type ActionType = Action["type"];

export const CONDITION_META: Record<ConditionType, { label: string; icon: string }> = {
  keyword: { label: "Message contains keyword", icon: "search" },
  business_hours: { label: "Business hours", icon: "schedule" },
  contact_tag: { label: "Contact tag", icon: "label" },
  contact_stage: { label: "Contact stage", icon: "flag" },
  first_conversation: { label: "Contact's first conversation", icon: "star" },
  unassigned: { label: "Conversation is unassigned", icon: "person_remove" },
};

export const ACTION_META: Record<ActionType, { label: string; icon: string }> = {
  send_text: { label: "Send text reply", icon: "send" },
  assign_agent: { label: "Assign to agent", icon: "support_agent" },
  add_tag: { label: "Add tag to contact", icon: "sell" },
  remove_tag: { label: "Remove tag from contact", icon: "remove" },
  set_stage: { label: "Change contact stage", icon: "trending_up" },
  set_status: { label: "Set conversation status", icon: "check_circle" },
};

export function defaultCondition(type: ConditionType): Condition {
  switch (type) {
    case "keyword": return { type, match: "contains", keywords: [] };
    case "business_hours": return { type, when: "outside", days: [1, 2, 3, 4, 5], start: "09:00", end: "18:00" };
    case "contact_tag": return { type, op: "has", tag: "" };
    case "contact_stage": return { type, op: "is", stage: "LEAD" };
    case "first_conversation": return { type };
    case "unassigned": return { type };
  }
}

export function defaultAction(type: ActionType): Action {
  switch (type) {
    case "send_text": return { type, text: "", cooldownHours: 12 };
    case "assign_agent": return { type, mode: "round_robin", userIds: [], overwrite: false };
    case "add_tag": return { type, tag: "" };
    case "remove_tag": return { type, tag: "" };
    case "set_stage": return { type, stage: "PROSPECT" };
    case "set_status": return { type, status: "PENDING" };
  }
}

// ─── Validation ──────────────────────────────────────────────────────────────
export interface AutomationInput { name: string; triggerEvent: AutomationEvent; isActive: boolean; conditions: Condition[]; actions: Action[] }
type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): v is T => allowed.includes(v as T);

function cleanTag(v: unknown): string | null {
  const t = str(v).replace(/\s+/g, " ");
  return t && t.length <= 40 ? t : null;
}

export function sanitizeCondition(raw: unknown, i: number): Result<Condition> {
  const at = `Condition ${i + 1}`;
  if (!isObj(raw)) return { ok: false, error: `${at} is invalid` };
  switch (raw.type) {
    case "keyword": {
      const list = Array.isArray(raw.keywords) ? raw.keywords : [];
      const keywords = [...new Set(list.map((k) => str(k).toLowerCase()).filter(Boolean))];
      if (!keywords.length) return { ok: false, error: `${at}: add at least one keyword` };
      if (keywords.length > 20 || keywords.some((k) => k.length > 60)) return { ok: false, error: `${at}: up to 20 keywords, 60 characters each` };
      return { ok: true, value: { type: "keyword", match: pick(raw.match, ["contains", "equals", "starts_with"] as const, "contains"), keywords } };
    }
    case "business_hours": {
      const days = [...new Set((Array.isArray(raw.days) ? raw.days : []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
      const start = str(raw.start), end = str(raw.end);
      if (!days.length) return { ok: false, error: `${at}: pick at least one working day` };
      if (!TIME.test(start) || !TIME.test(end)) return { ok: false, error: `${at}: enter valid opening and closing times` };
      if (start === end) return { ok: false, error: `${at}: opening and closing times can't be the same` };
      return { ok: true, value: { type: "business_hours", when: pick(raw.when, ["inside", "outside"] as const, "outside"), days, start, end } };
    }
    case "contact_tag": {
      const tag = cleanTag(raw.tag);
      if (!tag) return { ok: false, error: `${at}: enter a tag (max 40 characters)` };
      return { ok: true, value: { type: "contact_tag", op: pick(raw.op, ["has", "not_has"] as const, "has"), tag } };
    }
    case "contact_stage":
      if (!oneOf(raw.stage, STAGES)) return { ok: false, error: `${at}: choose a stage` };
      return { ok: true, value: { type: "contact_stage", op: pick(raw.op, ["is", "is_not"] as const, "is"), stage: raw.stage } };
    case "first_conversation": return { ok: true, value: { type: "first_conversation" } };
    case "unassigned": return { ok: true, value: { type: "unassigned" } };
    default: return { ok: false, error: `${at} has an unknown type` };
  }
}

export function sanitizeAction(raw: unknown, i: number): Result<Action> {
  const at = `Action ${i + 1}`;
  if (!isObj(raw)) return { ok: false, error: `${at} is invalid` };
  switch (raw.type) {
    case "send_text": {
      const text = typeof raw.text === "string" ? raw.text.trim() : "";
      if (!text) return { ok: false, error: `${at}: write the reply message` };
      if (text.length > 4096) return { ok: false, error: `${at}: reply can be at most 4096 characters` };
      const h = Number(raw.cooldownHours ?? 0);
      if (!Number.isFinite(h) || h < 0 || h > 720) return { ok: false, error: `${at}: repeat limit must be between 0 and 720 hours` };
      return { ok: true, value: { type: "send_text", text, cooldownHours: Math.round(h) } };
    }
    case "assign_agent": {
      const mode = pick(raw.mode, ["specific", "round_robin", "least_busy"] as const, "round_robin");
      const userIds = [...new Set((Array.isArray(raw.userIds) ? raw.userIds : []).map(str).filter(Boolean))].slice(0, 50);
      if (!userIds.length) return { ok: false, error: `${at}: choose ${mode === "specific" ? "an agent" : "at least one agent"}` };
      if (mode === "specific" && userIds.length !== 1) return { ok: false, error: `${at}: choose exactly one agent` };
      return { ok: true, value: { type: "assign_agent", mode, userIds, overwrite: raw.overwrite === true } };
    }
    case "add_tag":
    case "remove_tag": {
      const tag = cleanTag(raw.tag);
      if (!tag) return { ok: false, error: `${at}: enter a tag (max 40 characters)` };
      return { ok: true, value: { type: raw.type, tag } };
    }
    case "set_stage":
      if (!oneOf(raw.stage, STAGES)) return { ok: false, error: `${at}: choose a stage` };
      return { ok: true, value: { type: "set_stage", stage: raw.stage } };
    case "set_status":
      if (!oneOf(raw.status, CONV_STATUSES)) return { ok: false, error: `${at}: choose a status` };
      return { ok: true, value: { type: "set_status", status: raw.status } };
    default: return { ok: false, error: `${at} has an unknown type` };
  }
}

/** Validates and normalises a full automation definition. */
export function sanitizeAutomation(raw: unknown): Result<AutomationInput> {
  if (!isObj(raw)) return { ok: false, error: "Invalid request" };
  const name = str(raw.name);
  if (name.length < 2 || name.length > 80) return { ok: false, error: "Name must be 2–80 characters" };
  if (!oneOf(raw.triggerEvent, AUTOMATION_EVENTS)) return { ok: false, error: "Choose a trigger" };
  if (!SUPPORTED_EVENTS.includes(raw.triggerEvent)) return { ok: false, error: `"${EVENT_META[raw.triggerEvent].label}" automations aren't available yet. Choose another trigger.` };

  const rc = Array.isArray(raw.conditions) ? raw.conditions : [];
  const ra = Array.isArray(raw.actions) ? raw.actions : [];
  if (rc.length > 10) return { ok: false, error: "Up to 10 conditions" };
  if (!ra.length) return { ok: false, error: "Add at least one action" };
  if (ra.length > 10) return { ok: false, error: "Up to 10 actions" };

  const conditions: Condition[] = [];
  for (const [i, c] of rc.entries()) {
    const r = sanitizeCondition(c, i);
    if (!r.ok) return r;
    if (r.value.type !== "contact_tag" && conditions.some((x) => x.type === r.value.type)) return { ok: false, error: `Condition ${i + 1}: "${CONDITION_META[r.value.type].label}" is used twice` };
    conditions.push(r.value);
  }
  const actions: Action[] = [];
  for (const [i, a] of ra.entries()) {
    const r = sanitizeAction(a, i);
    if (!r.ok) return r;
    if ((r.value.type === "send_text" || r.value.type === "assign_agent" || r.value.type === "set_stage" || r.value.type === "set_status") && actions.some((x) => x.type === r.value.type)) {
      return { ok: false, error: `Action ${i + 1}: only one "${ACTION_META[r.value.type].label}" per automation` };
    }
    actions.push(r.value);
  }
  return { ok: true, value: { name, triggerEvent: raw.triggerEvent, isActive: raw.isActive !== false, conditions, actions } };
}

/** Lenient parse of stored JSON (skips invalid entries instead of failing). */
export function parseConditions(json: unknown): Condition[] {
  return (Array.isArray(json) ? json : []).flatMap((c, i) => { const r = sanitizeCondition(c, i); return r.ok ? [r.value] : []; });
}
export function parseActions(json: unknown): Action[] {
  return (Array.isArray(json) ? json : []).flatMap((a, i) => { const r = sanitizeAction(a, i); return r.ok ? [r.value] : []; });
}

export const assigneeIds = (actions: Action[]) => [...new Set(actions.flatMap((a) => (a.type === "assign_agent" ? a.userIds : [])))];

// ─── Human-readable summaries ────────────────────────────────────────────────
const quote = (s: string, n = 60) => `“${s.length > n ? `${s.slice(0, n - 1)}…` : s}”`;

export function describeCondition(c: Condition): string {
  switch (c.type) {
    case "keyword": return `message ${c.match === "equals" ? "is" : c.match === "starts_with" ? "starts with" : "contains"} ${c.keywords.map((k) => `“${k}”`).join(" or ")}`;
    case "business_hours": return `${c.when === "outside" ? "outside" : "during"} business hours (${formatDays(c.days)} ${c.start}–${c.end})`;
    case "contact_tag": return `contact ${c.op === "has" ? "has" : "doesn't have"} tag “${c.tag}”`;
    case "contact_stage": return `stage ${c.op === "is" ? "is" : "is not"} ${cap(c.stage)}`;
    case "first_conversation": return "it's the contact's first conversation";
    case "unassigned": return "conversation is unassigned";
  }
}

export function describeAction(a: Action, nameOf: (id: string) => string = () => "agent"): string {
  switch (a.type) {
    case "send_text": return `Reply ${quote(a.text)}`;
    case "assign_agent":
      if (a.mode === "specific") return `Assign to ${nameOf(a.userIds[0])}`;
      return `Assign ${a.mode === "round_robin" ? "round-robin" : "to least busy"} among ${a.userIds.length} agent${a.userIds.length === 1 ? "" : "s"}`;
    case "add_tag": return `Add tag “${a.tag}”`;
    case "remove_tag": return `Remove tag “${a.tag}”`;
    case "set_stage": return `Set stage to ${cap(a.stage)}`;
    case "set_status": return `Mark conversation ${cap(a.status)}`;
  }
}

export function formatDays(days: number[]): string {
  const s = [...days].sort().join(",");
  if (s === "1,2,3,4,5") return "Mon–Fri";
  if (s === "1,2,3,4,5,6") return "Mon–Sat";
  if (s === "0,1,2,3,4,5,6") return "Every day";
  return days.map((d) => DAY_NAMES[d]).join(", ");
}

export const stageLabel = cap;

// ─── Ready-made recipes ──────────────────────────────────────────────────────
export interface Recipe { key: string; name: string; blurb: string; icon: string; color: string; triggerEvent: AutomationEvent; conditions: Condition[]; actions: Action[] }

export const RECIPES: Recipe[] = [
  {
    key: "welcome", name: "Welcome first-time contacts", icon: "celebration", color: "#25D366",
    blurb: "Greet people the first time they ever message you.",
    triggerEvent: "CONVERSATION_CREATED", conditions: [{ type: "first_conversation" }],
    actions: [{ type: "send_text", text: "Hi {{first_name}}! Thanks for reaching out. A member of our team will reply shortly.", cooldownHours: 24 }],
  },
  {
    key: "away", name: "Out-of-office auto-reply", icon: "schedule", color: "#8b5cf6",
    blurb: "Let customers know when you're closed. Sent at most once every 12 hours.",
    triggerEvent: "MESSAGE_RECEIVED", conditions: [{ type: "business_hours", when: "outside", days: [1, 2, 3, 4, 5], start: "09:00", end: "18:00" }],
    actions: [{ type: "send_text", text: "Thanks for your message! We're closed right now. Our hours are Mon–Fri, 9 AM–6 PM, and we'll get back to you as soon as we open.", cooldownHours: 12 }],
  },
  {
    key: "round-robin", name: "Auto-assign new conversations", icon: "support_agent", color: "#0ea5e9",
    blurb: "Share new chats evenly between your agents (round-robin).",
    triggerEvent: "CONVERSATION_CREATED", conditions: [{ type: "unassigned" }],
    actions: [{ type: "assign_agent", mode: "round_robin", userIds: [], overwrite: false }],
  },
  {
    key: "keyword-tag", name: "Tag contacts by keyword", icon: "sell", color: "#f59e0b",
    blurb: "Tag people who ask about pricing and mark them as prospects.",
    triggerEvent: "MESSAGE_RECEIVED", conditions: [{ type: "keyword", match: "contains", keywords: ["price", "pricing", "cost"] }],
    actions: [{ type: "add_tag", tag: "pricing" }, { type: "set_stage", stage: "PROSPECT" }],
  },
  {
    key: "broadcast-reply", name: "Route broadcast replies", icon: "campaign", color: "#ef4444",
    blurb: "Tag campaign replies and hand them to the least busy agent.",
    triggerEvent: "BROADCAST_REPLIED", conditions: [],
    actions: [{ type: "add_tag", tag: "broadcast-reply" }, { type: "assign_agent", mode: "least_busy", userIds: [], overwrite: false }],
  },
];

/** Placeholders usable in text replies. */
export const TEXT_VARIABLES = [
  { key: "{{first_name}}", label: "First name" },
  { key: "{{name}}", label: "Full name" },
  { key: "{{phone}}", label: "Phone" },
];
