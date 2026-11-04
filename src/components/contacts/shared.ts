/**
 * Contact helpers shared by the Contacts page (client) and /api/contacts (server).
 * Must stay free of server-only and browser-only imports.
 */

export const STAGES = ["LEAD", "PROSPECT", "CUSTOMER", "CHURNED"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_META: Record<Stage, { label: string; cls: string; dot: string; color: string }> = {
  LEAD: { label: "Lead", cls: "bg-amber-50 text-amber-700", dot: "bg-amber-400", color: "#f59e0b" },
  PROSPECT: { label: "Prospect", cls: "bg-blue-50 text-blue-700", dot: "bg-blue-500", color: "#3b82f6" },
  CUSTOMER: { label: "Customer", cls: "bg-green-50 text-green-700", dot: "bg-[#25D366]", color: "#25D366" },
  CHURNED: { label: "Churned", cls: "bg-red-50 text-red-600", dot: "bg-red-400", color: "#ef4444" },
};

export const STATUS_FILTERS = ["all", "active", "optedOut", "blocked"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export const SORTS = ["newest", "oldest", "name", "lastSeen"] as const;
export type Sort = (typeof SORTS)[number];

export const DEFAULT_COUNTRY_CODE = "91";
export const MAX_TAGS = 20;
export const MAX_TAG_LEN = 40;

export interface ContactRow {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  stage: Stage;
  isBlocked: boolean;
  optedOut: boolean;
  notes: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
  tags: { tag: string }[];
  _count: { conversations: number };
}

export interface ContactDetail extends Omit<ContactRow, "_count"> {
  attributes: { key: string; value: string }[];
  _count: { conversations: number; broadcastLogs: number };
  latestConversation: { id: string; status: string; lastMessageAt: string | null } | null;
}

export interface ContactStats {
  total: number;
  newThisWeek: number;
  optedOut: number;
  blocked: number;
  stages: Record<Stage, number>;
  tags: { tag: string; count: number }[];
  canDelete: boolean;
}

/**
 * Normalises user input to WhatsApp's wa_id format: digits only, country code included,
 * no leading "+" / "00". Bare 10-digit numbers (and 0-prefixed 11-digit) get the default
 * country code (India), matching how inbound numbers are stored by the webhook.
 */
export function normalizePhone(input: unknown, defaultCc = DEFAULT_COUNTRY_CODE): { phone: string } | { error: string } {
  if (typeof input !== "string" && typeof input !== "number") return { error: "Phone number is required" };
  const raw = String(input).trim();
  if (!raw) return { error: "Phone number is required" };
  if (/[a-z]/i.test(raw)) return { error: "Phone number can only contain digits" };
  const hasPlus = raw.startsWith("+");
  let d = raw.replace(/\D/g, "");
  if (!hasPlus && d.startsWith("00")) d = d.slice(2);
  else if (!hasPlus && d.length === 11 && d.startsWith("0")) d = defaultCc + d.slice(1);
  else if (!hasPlus && d.length === 10) d = defaultCc + d;
  if (d.startsWith("0")) return { error: "Include the country code, e.g. +91 98765 43210" };
  if (d.length < 8 || d.length > 15) return { error: "Enter a valid phone number with country code" };
  return { phone: d };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const isEmail = (s: string) => s.length <= 191 && EMAIL_RE.test(s);

/** Lower-cases, trims and squashes whitespace so "VIP " and "vip" are the same tag. */
export function cleanTag(t: string): string {
  return t.trim().replace(/^#/, "").replace(/\s+/g, "-").toLowerCase().slice(0, MAX_TAG_LEN);
}

export function cleanTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out = new Set<string>();
  for (const t of input) {
    if (typeof t !== "string") continue;
    const c = cleanTag(t);
    if (c) out.add(c);
    if (out.size >= MAX_TAGS) break;
  }
  return [...out];
}

export const displayName = (c: { name: string | null; phone: string }) => c.name?.trim() || `+${c.phone}`;

/** "+91 98765 43210" for Indian numbers, "+<digits>" otherwise. */
export function prettyPhone(p: string): string {
  if (p.startsWith("91") && p.length === 12) return `+91 ${p.slice(2, 7)} ${p.slice(7)}`;
  return `+${p}`;
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

/** RFC-4180-ish parser: quoted fields, escaped quotes, CRLF/LF, comma or semicolon/tab delimiter. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.slice(0, src.indexOf("\n") === -1 ? src.length : src.indexOf("\n"));
  const delim = [",", ";", "\t"].reduce((best, d) => (firstLine.split(d).length > firstLine.split(best).length ? d : best), ",");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delim) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

/** Escapes a value for CSV and neutralises spreadsheet formula injection. */
export function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
