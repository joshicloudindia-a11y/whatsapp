// Shared (client + server) helpers for WhatsApp message templates.
// Pure TypeScript — no server or React imports — so API routes and the page agree on
// validation rules and on the exact Graph API `components` payload.

export const TEMPLATE_CATEGORIES = ["MARKETING", "UTILITY", "AUTHENTICATION"] as const;
export type TemplateCategoryT = (typeof TEMPLATE_CATEGORIES)[number];

export const TEMPLATE_STATUSES = ["DRAFT", "PENDING", "APPROVED", "REJECTED", "PAUSED", "DELETED"] as const;
export type TemplateStatusT = (typeof TEMPLATE_STATUSES)[number];

/** Roles allowed to create, submit, edit and delete templates. Everyone in the org can view. */
export const TEMPLATE_MANAGER_ROLES = ["ADMIN", "TEMPLATE_MANAGER"];

/** Language codes accepted by the WhatsApp Business Management API (common subset). */
export const TEMPLATE_LANGUAGES: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "en_US", label: "English (US)" },
  { code: "en_GB", label: "English (UK)" },
  { code: "hi", label: "Hindi" },
  { code: "bn", label: "Bengali" },
  { code: "gu", label: "Gujarati" },
  { code: "kn", label: "Kannada" },
  { code: "ml", label: "Malayalam" },
  { code: "mr", label: "Marathi" },
  { code: "pa", label: "Punjabi" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
  { code: "ur", label: "Urdu" },
  { code: "ar", label: "Arabic" },
  { code: "id", label: "Indonesian" },
  { code: "ms", label: "Malay" },
  { code: "th", label: "Thai" },
  { code: "vi", label: "Vietnamese" },
  { code: "fil", label: "Filipino" },
  { code: "zh_CN", label: "Chinese (China)" },
  { code: "zh_HK", label: "Chinese (Hong Kong)" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "es", label: "Spanish" },
  { code: "es_MX", label: "Spanish (Mexico)" },
  { code: "es_ES", label: "Spanish (Spain)" },
  { code: "pt_BR", label: "Portuguese (Brazil)" },
  { code: "pt_PT", label: "Portuguese (Portugal)" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "nl", label: "Dutch" },
  { code: "ru", label: "Russian" },
  { code: "tr", label: "Turkish" },
  { code: "sw", label: "Swahili" },
];
export const LANGUAGE_CODES = new Set(TEMPLATE_LANGUAGES.map((l) => l.code));
export const languageLabel = (code: string) => TEMPLATE_LANGUAGES.find((l) => l.code === code)?.label ?? code;

// Meta limits
export const LIMITS = {
  name: 512,
  header: 60,
  body: 1024,
  footer: 60,
  buttonText: 25,
  url: 2000,
  phone: 20,
  buttons: 10,
  urlButtons: 2,
  phoneButtons: 1,
  example: 200,
} as const;

export type TemplateButton =
  | { type: "QUICK_REPLY"; text: string }
  | { type: "URL"; text: string; url: string }
  | { type: "PHONE_NUMBER"; text: string; phone_number: string }
  // Anything else imported from Meta (OTP, COPY_CODE, FLOW, CATALOG…) is kept verbatim for display.
  | { type: "OTP" | "COPY_CODE" | "FLOW" | "CATALOG" | "MPM" | "VOICE_CALL" | "OTHER"; text?: string; [k: string]: unknown };

export interface AuthOptions {
  securityRecommendation: boolean;
  codeExpiryMinutes: number | null;
  copyButtonText: string;
}

/** Shape stored in MessageTemplate.buttons (Json). Older rows may hold a bare button array. */
export interface StoredExtras {
  buttons: TemplateButton[];
  examples: string[];
  headerExamples?: string[];
  auth?: AuthOptions;
  /** Media header format (IMAGE/VIDEO/DOCUMENT/LOCATION) for templates imported from Meta. */
  mediaHeader?: string;
}

export function parseExtras(raw: unknown): StoredExtras {
  if (Array.isArray(raw)) return { buttons: raw as TemplateButton[], examples: [] };
  if (raw && typeof raw === "object") {
    const o = raw as Partial<StoredExtras>;
    return {
      buttons: Array.isArray(o.buttons) ? o.buttons : [],
      examples: Array.isArray(o.examples) ? o.examples.map(String) : [],
      headerExamples: Array.isArray(o.headerExamples) ? o.headerExamples.map(String) : undefined,
      auth: o.auth,
      mediaHeader: typeof o.mediaHeader === "string" ? o.mediaHeader : undefined,
    };
  }
  return { buttons: [], examples: [] };
}

/** Editable template draft (what the builder edits and the API accepts). */
export interface TemplateDraft {
  name: string;
  category: TemplateCategoryT;
  language: string;
  headerText: string;
  body: string;
  footer: string;
  buttons: TemplateButton[];
  examples: string[];
  auth: AuthOptions;
}

export const DEFAULT_AUTH: AuthOptions = { securityRecommendation: true, codeExpiryMinutes: 10, copyButtonText: "Copy code" };

export const emptyDraft = (): TemplateDraft => ({
  name: "", category: "MARKETING", language: "en", headerText: "", body: "", footer: "", buttons: [], examples: [], auth: { ...DEFAULT_AUTH },
});

export const NAME_RE = /^[a-z0-9_]+$/;
export const normalizeName = (s: string) => s.toLowerCase().replace(/[\s-]+/g, "_").replace(/[^a-z0-9_]/g, "").slice(0, LIMITS.name);

/** Variable numbers used in text, sorted and de-duplicated: "Hi {{2}} {{1}}" -> [1, 2]. */
export function variablesOf(text: string): number[] {
  return [...new Set((text.match(/\{\{\s*(\d+)\s*\}\}/g) ?? []).map((m) => Number(m.replace(/\D/g, ""))))].sort((a, b) => a - b);
}

export function authBodyText(a: AuthOptions) {
  return `*{{1}}* is your verification code.${a.securityRecommendation ? " For your security, do not share this code." : ""}`;
}
export function authFooterText(a: AuthOptions) {
  return a.codeExpiryMinutes ? `This code expires in ${a.codeExpiryMinutes} minutes.` : "";
}

/** Returns the first validation problem, or null when the draft can be submitted to Meta. */
export function validateDraft(d: TemplateDraft): string | null {
  if (!d.name) return "Template name is required";
  if (d.name.length > LIMITS.name) return `Name must be at most ${LIMITS.name} characters`;
  if (!NAME_RE.test(d.name)) return "Name can only contain lowercase letters, numbers and underscores";
  if (!TEMPLATE_CATEGORIES.includes(d.category)) return "Choose a valid category";
  if (!LANGUAGE_CODES.has(d.language)) return "Choose a supported language";

  if (d.category === "AUTHENTICATION") {
    const a = d.auth;
    if (a.codeExpiryMinutes !== null && (!Number.isInteger(a.codeExpiryMinutes) || a.codeExpiryMinutes < 1 || a.codeExpiryMinutes > 90))
      return "Code expiry must be between 1 and 90 minutes";
    if (!a.copyButtonText.trim()) return "Copy-code button text is required";
    if (a.copyButtonText.length > LIMITS.buttonText) return `Button text must be at most ${LIMITS.buttonText} characters`;
    return null;
  }

  if (d.headerText.length > LIMITS.header) return `Header must be at most ${LIMITS.header} characters`;
  if (/\{\{/.test(d.headerText)) return "Header variables aren't supported here — use a plain text header";
  if (/[\n*_~]/.test(d.headerText)) return "Header can't contain new lines or formatting characters";

  const body = d.body.trim();
  if (!body) return "Body text is required";
  if (d.body.length > LIMITS.body) return `Body must be at most ${LIMITS.body} characters`;
  if (/\{\{(?!\d+\}\})/.test(d.body)) return "Variables must look like {{1}}, {{2}} … (no spaces)";
  const vars = variablesOf(d.body);
  for (let i = 0; i < vars.length; i++) if (vars[i] !== i + 1) return `Variables must be numbered in order starting at {{1}} (missing {{${i + 1}}})`;
  if (vars.length) {
    if (/^\{\{\s*\d+\s*\}\}/.test(body) || /\{\{\s*\d+\s*\}\}[.!?]?$/.test(body)) return "Meta doesn't allow the body to start or end with a variable — add some text around it";
    if (/\}\}\s*\{\{/.test(body)) return "Two variables can't sit next to each other — put some text between them";
    const words = body.replace(/\{\{\s*\d+\s*\}\}/g, " ").split(/\s+/).filter(Boolean).length;
    if (words < vars.length * 2) return "Too many variables for this message length — add more text";
    for (const n of vars) {
      const ex = (d.examples[n - 1] ?? "").trim();
      if (!ex) return `Add a sample value for {{${n}}} — Meta rejects templates without examples`;
      if (ex.length > LIMITS.example) return `Sample for {{${n}}} is too long`;
      if (/[\n\t]| {4,}/.test(ex)) return `Sample for {{${n}}} can't contain new lines, tabs or 4+ spaces`;
    }
  }

  if (d.footer.length > LIMITS.footer) return `Footer must be at most ${LIMITS.footer} characters`;
  if (/\{\{/.test(d.footer)) return "Footer can't contain variables";

  if (d.buttons.length > LIMITS.buttons) return `At most ${LIMITS.buttons} buttons`;
  let urls = 0, phones = 0;
  const seen = new Set<string>();
  for (const b of d.buttons) {
    const text = (b.text ?? "").trim();
    if (!text) return "Every button needs a label";
    if (text.length > LIMITS.buttonText) return `Button labels must be at most ${LIMITS.buttonText} characters`;
    if (seen.has(text.toLowerCase())) return "Button labels must be unique";
    seen.add(text.toLowerCase());
    if (b.type === "URL") {
      urls++;
      const url = String(b.url ?? "").trim();
      if (!/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(url)) return `"${text}" needs a valid https:// link`;
      if (url.length > LIMITS.url) return "Link is too long";
      if (/\{\{/.test(url)) return "Dynamic URL variables aren't supported — use a fixed link";
    } else if (b.type === "PHONE_NUMBER") {
      phones++;
      const p = String(b.phone_number ?? "").trim();
      if (!/^\+?[1-9]\d{6,18}$/.test(p.replace(/[\s-]/g, ""))) return `"${text}" needs a phone number with country code, e.g. +919876543210`;
    } else if (b.type !== "QUICK_REPLY") {
      return "Unsupported button type";
    }
  }
  if (urls > LIMITS.urlButtons) return `At most ${LIMITS.urlButtons} website buttons`;
  if (phones > LIMITS.phoneButtons) return `At most ${LIMITS.phoneButtons} phone button`;
  return null;
}

/** Quick replies must be grouped together; Meta rejects interleaving with call-to-action buttons. */
function orderButtons(buttons: TemplateButton[]) {
  return [...buttons.filter((b) => b.type === "QUICK_REPLY"), ...buttons.filter((b) => b.type !== "QUICK_REPLY")];
}

/** Builds the exact Graph API `components` array for POST /{waba}/message_templates. */
export function buildComponents(d: TemplateDraft): object[] {
  if (d.category === "AUTHENTICATION") {
    const comps: object[] = [{ type: "BODY", add_security_recommendation: d.auth.securityRecommendation }];
    if (d.auth.codeExpiryMinutes) comps.push({ type: "FOOTER", code_expiration_minutes: d.auth.codeExpiryMinutes });
    comps.push({ type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE", text: d.auth.copyButtonText.trim() }] });
    return comps;
  }
  const comps: object[] = [];
  if (d.headerText.trim()) comps.push({ type: "HEADER", format: "TEXT", text: d.headerText.trim() });
  const body = d.body.trim();
  const vars = variablesOf(body);
  comps.push(vars.length ? { type: "BODY", text: body, example: { body_text: [vars.map((n) => d.examples[n - 1].trim())] } } : { type: "BODY", text: body });
  if (d.footer.trim()) comps.push({ type: "FOOTER", text: d.footer.trim() });
  if (d.buttons.length) {
    comps.push({
      type: "BUTTONS",
      buttons: orderButtons(d.buttons).map((b) =>
        b.type === "URL" ? { type: "URL", text: b.text!.trim(), url: String(b.url).trim() }
          : b.type === "PHONE_NUMBER" ? { type: "PHONE_NUMBER", text: b.text!.trim(), phone_number: String(b.phone_number).replace(/[\s-]/g, "") }
          : { type: "QUICK_REPLY", text: b.text!.trim() }
      ),
    });
  }
  return comps;
}

/** Maps a draft to MessageTemplate columns. */
export function draftToColumns(d: TemplateDraft) {
  const auth = d.category === "AUTHENTICATION";
  const header = auth ? "" : d.headerText.trim();
  const body = auth ? authBodyText(d.auth) : d.body.trim();
  const vars = variablesOf(body);
  const extras: StoredExtras = auth
    ? { buttons: [{ type: "OTP", otp_type: "COPY_CODE", text: d.auth.copyButtonText.trim() }], examples: [], auth: d.auth }
    : { buttons: orderButtons(d.buttons), examples: vars.map((n) => (d.examples[n - 1] ?? "").trim()) };
  return {
    name: d.name,
    category: d.category,
    language: d.language,
    headerType: header ? "TEXT" : null,
    headerContent: header || null,
    body,
    footer: (auth ? authFooterText(d.auth) : d.footer.trim()) || null,
    buttons: extras as unknown as object,
  };
}

/** Rebuilds a draft from a stored row (for edit / duplicate). */
export function rowToDraft(t: {
  name: string; category: string; language: string; headerType: string | null; headerContent: string | null;
  body: string; footer: string | null; buttons: unknown;
}): TemplateDraft {
  const x = parseExtras(t.buttons);
  const category = (TEMPLATE_CATEGORIES as readonly string[]).includes(t.category) ? (t.category as TemplateCategoryT) : "MARKETING";
  return {
    name: t.name,
    category,
    language: t.language,
    headerText: t.headerType === "TEXT" ? t.headerContent ?? "" : "",
    body: t.body,
    footer: t.footer ?? "",
    buttons: x.buttons.filter((b) => b.type === "QUICK_REPLY" || b.type === "URL" || b.type === "PHONE_NUMBER"),
    examples: x.examples,
    auth: x.auth ?? { ...DEFAULT_AUTH, copyButtonText: String(x.buttons.find((b) => b.type === "OTP")?.text ?? DEFAULT_AUTH.copyButtonText) },
  };
}

/** Coerces untrusted JSON into a draft (server side) — unknown keys are dropped. */
export function coerceDraft(input: unknown): TemplateDraft {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const str = (v: unknown, max = 4096) => (typeof v === "string" ? v : "").slice(0, max);
  const a = (o.auth && typeof o.auth === "object" ? o.auth : {}) as Record<string, unknown>;
  const exp = a.codeExpiryMinutes === null || a.codeExpiryMinutes === "" ? null : Number(a.codeExpiryMinutes ?? DEFAULT_AUTH.codeExpiryMinutes);
  const buttons: TemplateButton[] = (Array.isArray(o.buttons) ? o.buttons : []).slice(0, 20).map((b) => {
    const r = (b && typeof b === "object" ? b : {}) as Record<string, unknown>;
    const text = str(r.text, 100);
    if (r.type === "URL") return { type: "URL", text, url: str(r.url, LIMITS.url + 10) };
    if (r.type === "PHONE_NUMBER") return { type: "PHONE_NUMBER", text, phone_number: str(r.phone_number, 40) };
    if (r.type === "QUICK_REPLY") return { type: "QUICK_REPLY", text };
    return { type: "OTHER", text };
  });
  return {
    name: str(o.name, LIMITS.name + 10).trim(),
    category: str(o.category, 32).toUpperCase() as TemplateCategoryT,
    language: str(o.language, 16).trim(),
    headerText: str(o.headerText, 200),
    body: str(o.body, 2000),
    footer: str(o.footer, 200),
    buttons,
    examples: (Array.isArray(o.examples) ? o.examples : []).slice(0, 50).map((e) => str(e, 500)),
    auth: {
      securityRecommendation: a.securityRecommendation === undefined ? true : Boolean(a.securityRecommendation),
      codeExpiryMinutes: exp === null || Number.isNaN(exp) ? null : exp,
      copyButtonText: str(a.copyButtonText ?? DEFAULT_AUTH.copyButtonText, 60),
    },
  };
}

// ─── Meta → local mapping (sync / import) ────────────────────────────────────

export interface MetaTemplate {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  rejected_reason?: string;
  components?: {
    type: string; format?: string; text?: string;
    add_security_recommendation?: boolean; code_expiration_minutes?: number;
    example?: { body_text?: string[][]; header_text?: string[] };
    buttons?: Record<string, unknown>[];
  }[];
}

export function mapMetaStatus(s: string): TemplateStatusT {
  switch ((s || "").toUpperCase()) {
    case "APPROVED": return "APPROVED";
    case "PENDING": case "IN_APPEAL": return "PENDING";
    case "REJECTED": case "LIMIT_EXCEEDED": return "REJECTED";
    case "PAUSED": case "DISABLED": return "PAUSED";
    case "DELETED": case "PENDING_DELETION": case "ARCHIVED": return "DELETED";
    default: return "PENDING";
  }
}

const REJECTION_TEXT: Record<string, string> = {
  ABUSIVE_CONTENT: "Abusive content",
  INCORRECT_CATEGORY: "Incorrect category for this content",
  INVALID_FORMAT: "Invalid format (check variables, samples and buttons)",
  SCAM: "Flagged as a possible scam",
  PROMOTIONAL: "Promotional content in a non-marketing category",
  TAG_CONTENT_MISMATCH: "Content doesn't match the selected category",
};
export const rejectionText = (r?: string | null) => (r ? REJECTION_TEXT[r] ?? r.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase()) : null);

/** Converts a Meta template into MessageTemplate columns. */
export function metaToColumns(m: MetaTemplate) {
  const comps = m.components ?? [];
  const header = comps.find((c) => c.type === "HEADER");
  const body = comps.find((c) => c.type === "BODY");
  const footer = comps.find((c) => c.type === "FOOTER");
  const btns = comps.find((c) => c.type === "BUTTONS")?.buttons ?? [];
  const category = (TEMPLATE_CATEGORIES as readonly string[]).includes(m.category) ? (m.category as TemplateCategoryT) : "UTILITY";
  const buttons: TemplateButton[] = btns.map((b) => {
    const type = String(b.type ?? "OTHER").toUpperCase();
    const text = typeof b.text === "string" ? b.text : undefined;
    if (type === "URL") return { type: "URL", text: text ?? "", url: String(b.url ?? "") };
    if (type === "PHONE_NUMBER") return { type: "PHONE_NUMBER", text: text ?? "", phone_number: String(b.phone_number ?? "") };
    if (type === "QUICK_REPLY") return { type: "QUICK_REPLY", text: text ?? "" };
    return { ...b, type: (["OTP", "COPY_CODE", "FLOW", "CATALOG", "MPM", "VOICE_CALL"].includes(type) ? type : "OTHER") as "OTHER", text };
  });
  const bodyText = body?.text ?? "";
  const footerText = footer?.text ?? (footer?.code_expiration_minutes ? `This code expires in ${footer.code_expiration_minutes} minutes.` : "");
  const extras: StoredExtras = {
    buttons,
    examples: (body?.example?.body_text?.[0] ?? []).map(String),
    headerExamples: header?.example?.header_text?.map(String),
  };
  if (category === "AUTHENTICATION") {
    const exp = footerText.match(/(\d+)\s*minute/i);
    extras.auth = {
      securityRecommendation: /for your security/i.test(bodyText),
      codeExpiryMinutes: exp ? Number(exp[1]) : null,
      copyButtonText: String(buttons.find((b) => b.type === "OTP")?.text ?? DEFAULT_AUTH.copyButtonText),
    };
  }
  const fmt = header?.format?.toUpperCase();
  if (fmt && fmt !== "TEXT") extras.mediaHeader = fmt;
  const status = mapMetaStatus(m.status);
  return {
    name: m.name,
    language: m.language,
    category,
    status,
    metaTemplateId: m.id,
    headerType: fmt ?? null,
    headerContent: fmt === "TEXT" ? header?.text ?? null : null,
    body: bodyText || "(no body)",
    footer: footerText || null,
    buttons: extras as unknown as object,
    rejectionReason: status === "REJECTED" || status === "PAUSED" ? rejectionText(m.rejected_reason && m.rejected_reason !== "NONE" ? m.rejected_reason : m.status === "DISABLED" ? "Disabled by Meta" : null) : null,
  };
}

/** True when a stored template uses parts this builder can't edit (media header, OTP/flow buttons…). */
export function hasUnsupportedParts(t: { category: string; headerType: string | null; body?: string; headerContent?: string | null; buttons: unknown }) {
  if (t.category === "AUTHENTICATION") return false;
  const x = parseExtras(t.buttons);
  if (x.mediaHeader || (t.headerType && t.headerType !== "TEXT")) return true;
  if (t.headerContent && /\{\{/.test(t.headerContent)) return true;
  return x.buttons.some((b) => b.type !== "QUICK_REPLY" && b.type !== "URL" && b.type !== "PHONE_NUMBER" || (b.type === "URL" && /\{\{/.test(String(b.url))));
}
