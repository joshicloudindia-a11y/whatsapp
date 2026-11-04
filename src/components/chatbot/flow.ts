/**
 * Shared chatbot flow model: node catalogue, sanitising, validation and
 * starter templates. Pure TypeScript — imported by the builder (client),
 * the chatbot API routes and the runtime (server).
 */

export const NODE_TYPES = [
  "sendMessage", "askQuestion", "condition", "setAttribute", "assignAgent", "httpRequest", "delay", "endFlow",
] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export const TRIGGER_TYPES = ["KEYWORD", "NEW_CONVERSATION", "ANY_MESSAGE", "TEMPLATE_RECEIVED", "INBOUND_AD"] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];

export const OPERATORS = ["equals", "not_equals", "contains", "starts_with", "is_empty", "not_empty"] as const;
export type Operator = (typeof OPERATORS)[number];

export interface NodeData {
  nodeType: NodeType;
  /** Message / question / handoff / closing text. */
  content?: string;
  /** askQuestion: variable the answer is stored in. condition: variable to test. */
  variable?: string;
  /** askQuestion: reply buttons (up to 10). */
  options?: string[];
  /** askQuestion: also save the answer as a contact attribute. */
  saveToContact?: boolean;
  operator?: Operator;
  value?: string;
  /** setAttribute */
  key?: string;
  /** assignAgent: user id, "" = leave for the team. */
  agentId?: string;
  /** delay */
  seconds?: number;
  /** httpRequest (not executed by the live runtime) */
  url?: string;
  method?: "GET" | "POST";
  [k: string]: unknown;
}

export interface FlowNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: NodeData;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  /** "true" / "false" for condition branches, null otherwise. */
  sourceHandle?: string | null;
}

export const NODE_META: Record<NodeType, { label: string; color: string; icon: string; hint: string; terminal?: boolean; live: boolean }> = {
  sendMessage: { label: "Send message", color: "#25D366", icon: "chat", hint: "Reply with a text message", live: true },
  askQuestion: { label: "Ask question", color: "#3b82f6", icon: "help", hint: "Ask and wait for the answer", live: true },
  condition: { label: "Condition", color: "#f59e0b", icon: "alt_route", hint: "Branch on an answer", live: true },
  setAttribute: { label: "Set attribute", color: "#8b5cf6", icon: "label", hint: "Save a value on the contact", live: true },
  assignAgent: { label: "Hand off to agent", color: "#06b6d4", icon: "support_agent", hint: "Assign the chat and stop the bot", terminal: true, live: true },
  httpRequest: { label: "HTTP request", color: "#ef4444", icon: "http", hint: "Call an external URL (skipped live)", live: false },
  delay: { label: "Delay", color: "#64748b", icon: "timer", hint: "Pause for a few seconds", live: true },
  endFlow: { label: "End flow", color: "#374151", icon: "flag", hint: "Stop the bot", terminal: true, live: true },
};

export const TRIGGER_META: Record<TriggerType, { label: string; icon: string; hint: string }> = {
  KEYWORD: { label: "Keyword", icon: "key", hint: "Message is or contains one of your keywords" },
  NEW_CONVERSATION: { label: "New conversation", icon: "forum", hint: "First message of a new conversation" },
  ANY_MESSAGE: { label: "Any message", icon: "chat", hint: "Every message when no agent is assigned" },
  TEMPLATE_RECEIVED: { label: "Template button reply", icon: "move_to_inbox", hint: "Customer taps a quick-reply button on a template" },
  INBOUND_AD: { label: "Click-to-WhatsApp ad", icon: "campaign", hint: "Customer arrives from a Meta ad" },
};

export const OPERATOR_LABEL: Record<Operator, string> = {
  equals: "equals", not_equals: "does not equal", contains: "contains", starts_with: "starts with", is_empty: "is empty", not_empty: "is not empty",
};

export const LIMITS = { nodes: 60, text: 4096, question: 1024, option: 24, options: 10, delay: 10, name: 80, description: 300, trigger: 500 };
export const VAR_RE = /^[A-Za-z_][A-Za-z0-9_]{0,39}$/;
export const BUILTIN_VARS = ["name", "phone", "message"];

export const isTerminal = (t: NodeType) => !!NODE_META[t].terminal;
export const isNodeType = (t: unknown): t is NodeType => typeof t === "string" && (NODE_TYPES as readonly string[]).includes(t);
export const isTriggerType = (t: unknown): t is TriggerType => typeof t === "string" && (TRIGGER_TYPES as readonly string[]).includes(t);

export function newId(prefix = "n") {
  const rnd = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rnd}`;
}

export function parseKeywords(v: string | null | undefined): string[] {
  return [...new Set((v ?? "").split(",").map((k) => k.trim().toLowerCase()).filter(Boolean))];
}

export function triggerSummary(type: string, value: string | null | undefined) {
  const t = isTriggerType(type) ? type : "KEYWORD";
  const kws = parseKeywords(value);
  if (t === "KEYWORD") return kws.length ? `Keyword: ${kws.join(", ")}` : "Keyword (none set)";
  if (t === "TEMPLATE_RECEIVED" && kws.length) return `Template reply: ${kws.join(", ")}`;
  return TRIGGER_META[t].label;
}

// ─── Sanitising (server-side allowlist; also used when loading) ─────────────
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);

export function sanitizeFlow(rawNodes: unknown, rawEdges: unknown): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes: FlowNode[] = [];
  const ids = new Set<string>();
  for (const n of Array.isArray(rawNodes) ? rawNodes.slice(0, LIMITS.nodes) : []) {
    if (!n || typeof n !== "object") continue;
    const r = n as Record<string, unknown>;
    const d = (r.data && typeof r.data === "object" ? r.data : {}) as Record<string, unknown>;
    const type = isNodeType(d.nodeType) ? d.nodeType : isNodeType(r.type) ? r.type : null;
    const id = str(r.id, 64);
    if (!type || !id || ids.has(id)) continue;
    ids.add(id);
    const pos = (r.position && typeof r.position === "object" ? r.position : {}) as Record<string, unknown>;
    const data: NodeData = { nodeType: type };
    const content = str(d.content, type === "askQuestion" ? LIMITS.question : LIMITS.text);
    if (content) data.content = content;
    if (type === "askQuestion") {
      data.variable = str(d.variable, 40);
      data.options = (Array.isArray(d.options) ? d.options : []).slice(0, LIMITS.options).map((o) => str(o, LIMITS.option));
      data.saveToContact = d.saveToContact === true;
    } else if (type === "condition") {
      data.variable = str(d.variable, 40);
      data.operator = (OPERATORS as readonly string[]).includes(d.operator as string) ? (d.operator as Operator) : "equals";
      data.value = str(d.value, 200);
    } else if (type === "setAttribute") {
      data.key = str(d.key, 40);
      data.value = str(d.value, 500);
    } else if (type === "assignAgent") {
      data.agentId = str(d.agentId, 64);
    } else if (type === "delay") {
      data.seconds = Math.min(LIMITS.delay, Math.max(1, Math.round(num(d.seconds, 3))));
    } else if (type === "httpRequest") {
      data.url = str(d.url, 500);
      data.method = d.method === "GET" ? "GET" : "POST";
    }
    nodes.push({ id, type, position: { x: Math.round(num(pos.x, 0)), y: Math.round(num(pos.y, 0)) }, data });
  }

  const edges: FlowEdge[] = [];
  const seen = new Set<string>();
  const typeOf = new Map(nodes.map((n) => [n.id, n.type]));
  for (const e of Array.isArray(rawEdges) ? rawEdges.slice(0, LIMITS.nodes * 3) : []) {
    if (!e || typeof e !== "object") continue;
    const r = e as Record<string, unknown>;
    const source = str(r.source, 64), target = str(r.target, 64);
    const st = typeOf.get(source);
    if (!st || !typeOf.has(target) || source === target || isTerminal(st)) continue;
    const handle = st === "condition" ? (r.sourceHandle === "false" ? "false" : "true") : null;
    const key = `${source}:${handle}`;
    if (seen.has(key)) continue; // one next step per output
    seen.add(key);
    edges.push({ id: str(r.id, 80) || `e_${source}_${handle ?? "out"}`, source, target, sourceHandle: handle });
  }
  return { nodes, edges };
}

// ─── Graph helpers ──────────────────────────────────────────────────────────
export function outEdge(edges: FlowEdge[], source: string, handle: string | null = null) {
  return edges.find((e) => e.source === source && (e.sourceHandle ?? null) === handle);
}

export function findStart(nodes: FlowNode[], edges: FlowEdge[]): FlowNode | null {
  const incoming = new Set(edges.map((e) => e.target));
  const roots = nodes.filter((n) => !incoming.has(n.id));
  return roots.length === 1 ? roots[0] : roots.length === 0 ? null : roots[0];
}

export function collectVariables(nodes: FlowNode[]): string[] {
  const v = new Set<string>();
  for (const n of nodes) {
    if (n.type === "askQuestion" && n.data.variable && VAR_RE.test(n.data.variable)) v.add(n.data.variable);
    if (n.type === "setAttribute" && n.data.key && VAR_RE.test(n.data.key)) v.add(n.data.key);
  }
  return [...v];
}

// ─── Validation ─────────────────────────────────────────────────────────────
export interface FlowIssue { level: "error" | "warning"; message: string; nodeId?: string }

export function validateFlow(nodes: FlowNode[], edges: FlowEdge[]): FlowIssue[] {
  const issues: FlowIssue[] = [];
  if (nodes.length === 0) return [{ level: "error", message: "Add at least one step." }];

  const incoming = new Set(edges.map((e) => e.target));
  const roots = nodes.filter((n) => !incoming.has(n.id));
  if (roots.length === 0) issues.push({ level: "error", message: "The flow has no starting step (every step has an incoming link)." });
  if (roots.length > 1) {
    for (const r of roots.slice(1)) issues.push({ level: "error", nodeId: r.id, message: "Not connected — link a previous step to it, or delete it." });
  }
  if (roots.length >= 1) {
    const reach = new Set<string>([roots[0].id]);
    const stack = [roots[0].id];
    while (stack.length) {
      const id = stack.pop()!;
      for (const e of edges) if (e.source === id && !reach.has(e.target)) { reach.add(e.target); stack.push(e.target); }
    }
    for (const n of nodes) {
      if (!reach.has(n.id) && !roots.slice(1).some((r) => r.id === n.id)) issues.push({ level: "error", nodeId: n.id, message: "Can't be reached from the start step." });
    }
  }

  const known = new Set([...BUILTIN_VARS, ...collectVariables(nodes)]);
  for (const n of nodes) {
    const d = n.data, c = (d.content ?? "").trim();
    const err = (message: string) => issues.push({ level: "error", nodeId: n.id, message });
    const warn = (message: string) => issues.push({ level: "warning", nodeId: n.id, message });
    switch (n.type) {
      case "sendMessage":
        if (!c) err("Message is empty.");
        break;
      case "askQuestion": {
        if (!c) err("Question is empty.");
        if (!d.variable || !VAR_RE.test(d.variable)) err("Pick a variable name to save the answer (letters, numbers, _).");
        const opts = (d.options ?? []).map((o) => o.trim());
        if (opts.some((o) => !o)) err("Remove empty answer buttons.");
        if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) err("Answer buttons must be unique.");
        break;
      }
      case "condition": {
        if (!d.variable) err("Choose what to check.");
        else if (!known.has(d.variable)) warn(`"${d.variable}" isn't set by any step — it will be empty.`);
        if (d.operator !== "is_empty" && d.operator !== "not_empty" && !(d.value ?? "").trim()) err("Enter a value to compare with.");
        if (!outEdge(edges, n.id, "true")) warn("The \"Yes\" branch isn't connected — the bot will stop there.");
        if (!outEdge(edges, n.id, "false")) warn("The \"No\" branch isn't connected — the bot will stop there.");
        break;
      }
      case "setAttribute":
        if (!d.key || !VAR_RE.test(d.key)) err("Attribute name is required (letters, numbers, _).");
        if (!(d.value ?? "").trim()) err("Attribute value is empty.");
        break;
      case "httpRequest":
        warn("HTTP requests aren't executed by the live bot yet — this step is skipped.");
        break;
      case "delay":
        if (!d.seconds || d.seconds < 1 || d.seconds > LIMITS.delay) err(`Delay must be 1–${LIMITS.delay} seconds.`);
        break;
    }
  }
  return issues;
}

export function validateTrigger(type: string, value: string | null | undefined): string | null {
  if (!isTriggerType(type)) return "Unknown trigger type.";
  if (type === "KEYWORD" && parseKeywords(value).length === 0) return "Add at least one keyword.";
  return null;
}

// ─── Starter templates ──────────────────────────────────────────────────────
export interface StarterTemplate {
  id: string; name: string; description: string; icon: string; color: string;
  triggerType: TriggerType; triggerValue: string;
  build: () => { nodes: FlowNode[]; edges: FlowEdge[] };
}

type Spec = [id: string, type: NodeType, x: number, y: number, data: Omit<NodeData, "nodeType">];
function make(specs: Spec[], links: [string, string, ("true" | "false")?][]) {
  const map = new Map<string, string>();
  const nodes: FlowNode[] = specs.map(([k, type, x, y, data]) => {
    const id = newId();
    map.set(k, id);
    return { id, type, position: { x, y }, data: { nodeType: type, ...data } };
  });
  const edges: FlowEdge[] = links.map(([s, t, h]) => ({ id: newId("e"), source: map.get(s)!, target: map.get(t)!, sourceHandle: h ?? null }));
  return { nodes, edges };
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: "welcome", name: "Welcome menu", icon: "forum", color: "#25D366",
    description: "Greets new chats and routes them with reply buttons.",
    triggerType: "NEW_CONVERSATION", triggerValue: "",
    build: () => make([
      ["hi", "sendMessage", 0, 0, { content: "Hi {{name}}, welcome! Thanks for reaching out." }],
      ["ask", "askQuestion", 0, 140, { content: "How can we help you today?", variable: "choice", options: ["Pricing", "Support", "Talk to a person"] }],
      ["c1", "condition", 0, 300, { variable: "choice", operator: "equals", value: "Pricing" }],
      ["p", "sendMessage", -260, 460, { content: "Our plans start at an affordable monthly price. Reply \"demo\" any time to book a walkthrough." }],
      ["c2", "condition", 160, 460, { variable: "choice", operator: "equals", value: "Support" }],
      ["s", "sendMessage", -60, 620, { content: "Please describe the issue and an agent will pick it up shortly." }],
      ["h", "assignAgent", 340, 620, { agentId: "", content: "Connecting you with our team now." }],
      ["e1", "endFlow", -260, 620, {}],
      ["e2", "endFlow", -60, 780, {}],
    ], [["hi", "ask"], ["ask", "c1"], ["c1", "p", "true"], ["c1", "c2", "false"], ["p", "e1"], ["c2", "s", "true"], ["c2", "h", "false"], ["s", "e2"]]),
  },
  {
    id: "faq", name: "FAQ", icon: "help", color: "#3b82f6",
    description: "Answers common questions about hours, delivery and returns.",
    triggerType: "KEYWORD", triggerValue: "faq, help, hours",
    build: () => make([
      ["ask", "askQuestion", 0, 0, { content: "What would you like to know?", variable: "topic", options: ["Opening hours", "Delivery", "Returns"] }],
      ["c1", "condition", 0, 160, { variable: "topic", operator: "equals", value: "Opening hours" }],
      ["a1", "sendMessage", -260, 320, { content: "We're open Monday to Saturday, 9am to 7pm." }],
      ["c2", "condition", 160, 320, { variable: "topic", operator: "equals", value: "Delivery" }],
      ["a2", "sendMessage", -60, 480, { content: "Orders are delivered in 2–4 business days. You'll get a tracking link on WhatsApp." }],
      ["a3", "sendMessage", 340, 480, { content: "You can return any item within 7 days. Reply \"agent\" if you need help with a return." }],
      ["end", "endFlow", 140, 660, { content: "Anything else? Just type \"faq\" to see the menu again." }],
    ], [["ask", "c1"], ["c1", "a1", "true"], ["c1", "c2", "false"], ["c2", "a2", "true"], ["c2", "a3", "false"], ["a1", "end"], ["a2", "end"], ["a3", "end"]]),
  },
  {
    id: "lead", name: "Lead capture", icon: "person_add", color: "#8b5cf6",
    description: "Collects name, email and interest, then hands off to sales.",
    triggerType: "KEYWORD", triggerValue: "demo, quote, pricing",
    build: () => make([
      ["hi", "sendMessage", 0, 0, { content: "Great, let's get you a quote. It takes 30 seconds." }],
      ["n", "askQuestion", 0, 140, { content: "What's your full name?", variable: "lead_name", saveToContact: true, options: [] }],
      ["e", "askQuestion", 0, 280, { content: "Thanks {{lead_name}}! What's your email address?", variable: "lead_email", saveToContact: true, options: [] }],
      ["i", "askQuestion", 0, 420, { content: "Which plan are you interested in?", variable: "interest", saveToContact: true, options: ["Starter", "Growth", "Enterprise"] }],
      ["tag", "setAttribute", 0, 560, { key: "lead_source", value: "WhatsApp chatbot" }],
      ["ty", "sendMessage", 0, 680, { content: "Thanks {{lead_name}}! Our team will reach out at {{lead_email}} shortly." }],
      ["h", "assignAgent", 0, 800, { agentId: "", content: "" }],
    ], [["hi", "n"], ["n", "e"], ["e", "i"], ["i", "tag"], ["tag", "ty"], ["ty", "h"]]),
  },
];

// ─── Editing operations (shared by canvas and step list) ────────────────────
type G<N extends FlowNode, E extends FlowEdge> = { nodes: N[]; edges: E[] };
const edge = (source: string, target: string, sourceHandle: string | null = null): FlowEdge => ({ id: newId("e"), source, target, sourceHandle });

export function createNode(type: NodeType, position = { x: 0, y: 0 }): FlowNode {
  const data: NodeData = { nodeType: type };
  if (type === "askQuestion") Object.assign(data, { content: "", variable: "", options: [], saveToContact: false });
  if (type === "condition") Object.assign(data, { variable: "", operator: "equals", value: "" });
  if (type === "delay") data.seconds = 3;
  if (type === "httpRequest") Object.assign(data, { url: "", method: "POST" });
  if (type === "assignAgent") data.agentId = "";
  return { id: newId(), type, position, data };
}

/** Inserts `node` after `afterId` (or at the end) and wires it into the flow. */
export function insertAfter<N extends FlowNode, E extends FlowEdge>(g: G<N, E>, afterId: string | null, node: N): G<N, FlowEdge> {
  const idx = afterId ? g.nodes.findIndex((n) => n.id === afterId) : g.nodes.length - 1;
  const prev = idx >= 0 ? g.nodes[idx] : null;
  const nodes = [...g.nodes.slice(0, idx + 1), node, ...g.nodes.slice(idx + 1)];
  let edges: FlowEdge[] = g.edges;
  if (prev && !isTerminal(prev.type)) {
    if (prev.type === "condition") {
      const free = !outEdge(edges, prev.id, "true") ? "true" : !outEdge(edges, prev.id, "false") ? "false" : null;
      if (free) edges = [...edges, edge(prev.id, node.id, free)];
    } else {
      const old = outEdge(edges, prev.id);
      edges = [...edges.filter((e) => e !== old), edge(prev.id, node.id)];
      if (old && !isTerminal(node.type)) edges.push(edge(node.id, old.target, node.type === "condition" ? "true" : null));
    }
  }
  return { nodes, edges };
}

/** Deletes a step; a simple step's incoming links are re-pointed to its next step. */
export function removeNode<N extends FlowNode, E extends FlowEdge>(g: G<N, E>, id: string): G<N, FlowEdge> {
  const node = g.nodes.find((n) => n.id === id);
  if (!node) return g;
  const bridge = node.type !== "condition" ? outEdge(g.edges, id)?.target : undefined;
  const edges: FlowEdge[] = [];
  for (const e of g.edges) {
    if (e.source === id) continue;
    if (e.target === id) { if (bridge && bridge !== e.source) edges.push({ ...e, target: bridge }); continue; }
    edges.push(e);
  }
  return { nodes: g.nodes.filter((n) => n.id !== id), edges };
}

export function setNext<E extends FlowEdge>(edges: E[], source: string, handle: string | null, target: string | null): FlowEdge[] {
  const rest: FlowEdge[] = edges.filter((e) => !(e.source === source && (e.sourceHandle ?? null) === handle));
  return target && target !== source ? [...rest, edge(source, target, handle)] : rest;
}

export const hasBranches = (nodes: FlowNode[]) => nodes.some((n) => n.type === "condition");

/** Re-links a branch-free flow so steps run in list order. */
export function relinkLinear<N extends FlowNode>(nodes: N[]): FlowEdge[] {
  const out: FlowEdge[] = [];
  for (let i = 0; i < nodes.length - 1; i++) if (!isTerminal(nodes[i].type)) out.push(edge(nodes[i].id, nodes[i + 1].id));
  return out;
}

export function moveNode<N extends FlowNode, E extends FlowEdge>(g: G<N, E>, id: string, dir: -1 | 1): G<N, FlowEdge> & { relinked: boolean } {
  const i = g.nodes.findIndex((n) => n.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= g.nodes.length) return { ...g, relinked: false };
  const nodes = [...g.nodes];
  [nodes[i], nodes[j]] = [nodes[j], nodes[i]];
  if (hasBranches(nodes)) return { nodes, edges: g.edges, relinked: false };
  return { nodes, edges: relinkLinear(nodes), relinked: true };
}

/** Plain JSON for saving (drops React Flow's runtime fields). */
export function serializeFlow(nodes: FlowNode[], edges: FlowEdge[]) {
  return {
    nodes: nodes.map((n) => ({ id: n.id, type: n.type, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) }, data: n.data })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null })),
  };
}

export function nodePreview(n: FlowNode): string {
  const d = n.data;
  switch (n.type) {
    case "askQuestion": return d.content || "";
    case "condition": return d.variable ? `If ${d.variable} ${OPERATOR_LABEL[d.operator ?? "equals"]}${d.operator === "is_empty" || d.operator === "not_empty" ? "" : ` "${d.value ?? ""}"`}` : "";
    case "setAttribute": return d.key ? `${d.key} = ${d.value ?? ""}` : "";
    case "assignAgent": return d.content || (d.agentId ? "Assign to a specific agent" : "Hand off to the team");
    case "delay": return `Wait ${d.seconds ?? 3}s`;
    case "httpRequest": return d.url ? `${d.method ?? "POST"} ${d.url}` : "";
    case "endFlow": return d.content || "Bot stops";
    default: return d.content || "";
  }
}
