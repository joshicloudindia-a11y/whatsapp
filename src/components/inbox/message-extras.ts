/**
 * [chat] Per-message chat extras, shared by the inbox UI, its API routes and the WhatsApp webhook.
 *
 * Storage: everything lives inside `Message.interactive` (JSON) so no schema change is needed.
 * Backwards compatible by design:
 *  - The chatbot runtime stores the raw Meta interactive object (`type`/`header`/`body`/`footer`/`action`)
 *    at the top level of `interactive`; those keys are left untouched and still read the same way.
 *  - `templateData` is NOT used here (automations/API/broadcast write `source`, `automationId`, `language`,
 *    `variables`; the calling feature reserves `templateData.call`).
 *
 * Extra keys (all optional):
 *  context   { wamid, messageId?, preview?, type?, direction? }      quoted reply (outbound and inbound)
 *  reactions { [emoji]: { count, byContact?, byUserIds? } }          at most one emoji per side (WhatsApp rule)
 *  starredBy string[]                                                 userIds who starred it (per user)
 *  hiddenFor string[]                                                 userIds who chose "Delete for me"
 *  forwarded boolean, forwardedFromId?: string                        forwarded by us / by the customer
 *  reply     { kind, id?, title, description? }                       inbound button_reply / list_reply / template button
 *  contacts  WaContact[]                                              CONTACTS message cards
 *  location  { latitude, longitude, name?, address?, url? }           LOCATION (content also keeps legacy {lat,lng})
 *  reactionError string                                               last reaction send failure (shown in UI)
 */

export interface ReplyContext { wamid: string; messageId?: string | null; preview?: string | null; type?: string | null; direction?: "INBOUND" | "OUTBOUND" | null }
export interface ReactionEntry { count: number; byContact?: boolean; byUserIds?: string[] }
export interface WaContact {
  name: { formatted_name: string; first_name?: string; last_name?: string };
  phones?: { phone?: string; wa_id?: string; type?: string }[];
  emails?: { email?: string; type?: string }[];
  org?: { company?: string; title?: string };
}
export interface LocationData { latitude: number; longitude: number; name?: string; address?: string; url?: string }
export interface InboundReply { kind: "button_reply" | "list_reply" | "button" | "nfm_reply"; id?: string; title: string; description?: string }

export interface MessageExtras {
  context?: ReplyContext;
  reactions?: Record<string, ReactionEntry>;
  starredBy?: string[];
  hiddenFor?: string[];
  forwarded?: boolean;
  forwardedFromId?: string;
  reply?: InboundReply;
  contacts?: WaContact[];
  location?: LocationData;
  reactionError?: string;
  // Raw Meta interactive payload keys (chatbot runtime / our button & list sends).
  type?: string;
  header?: { type?: string; text?: string };
  body?: { text?: string };
  footer?: { text?: string };
  action?: {
    button?: string;
    buttons?: { type?: string; reply?: { id?: string; title?: string } }[];
    sections?: { title?: string; rows?: { id?: string; title?: string; description?: string }[] }[];
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Safely reads `Message.interactive` (never throws; non-objects become {}). */
export function asExtras(json: unknown): MessageExtras {
  return isObj(json) ? (json as MessageExtras) : {};
}

/** Returns a new JSON object with `patch` merged in (undefined values delete the key). */
export function mergeExtras(json: unknown, patch: Partial<MessageExtras>): MessageExtras {
  const out: Record<string, unknown> = { ...asExtras(json) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete out[k];
    else out[k] = v;
  }
  return out as MessageExtras;
}

/**
 * Applies one side's reaction. WhatsApp keeps a single reaction per sender per message, and every agent
 * reacts as the same business number – so a new business emoji replaces the previous one.
 * `emoji` null/"" removes that side's reaction.
 */
export function applyReaction(
  reactions: Record<string, ReactionEntry> | undefined,
  emoji: string | null,
  actor: { contact: true } | { userId: string },
): Record<string, ReactionEntry> | undefined {
  const next: Record<string, ReactionEntry> = {};
  for (const [e, r] of Object.entries(reactions ?? {})) {
    const entry: ReactionEntry = { count: 0, byContact: r.byContact, byUserIds: r.byUserIds?.slice() };
    if ("contact" in actor) entry.byContact = false;
    else entry.byUserIds = [];
    next[e] = entry;
  }
  if (emoji) {
    const cur = next[emoji] ?? { count: 0 };
    if ("contact" in actor) cur.byContact = true;
    else cur.byUserIds = [actor.userId];
    next[emoji] = cur;
  }
  for (const [e, r] of Object.entries(next)) {
    if (!r.byUserIds?.length) delete r.byUserIds;
    if (!r.byContact) delete r.byContact;
    r.count = (r.byContact ? 1 : 0) + (r.byUserIds?.length ? 1 : 0);
    if (!r.count) delete next[e];
  }
  return Object.keys(next).length ? next : undefined;
}

/** Toggles a userId in a string list. */
export function toggleId(list: string[] | undefined, id: string, on: boolean): string[] | undefined {
  const set = new Set(list ?? []);
  if (on) set.add(id);
  else set.delete(id);
  return set.size ? [...set] : undefined;
}

const TYPE_LABEL: Record<string, string> = {
  IMAGE: "Photo", VIDEO: "Video", AUDIO: "Voice message", DOCUMENT: "Document", STICKER: "Sticker",
  LOCATION: "Location", CONTACTS: "Contact card", TEMPLATE: "Template message", INTERACTIVE: "Interactive message", SYSTEM: "System message",
};

/** One-line preview for quotes, forwards and exports. */
export function messagePreview(m: { type: string; content?: string | null; mediaCaption?: string | null; templateName?: string | null; interactive?: unknown }, max = 120): string {
  const x = asExtras(m.interactive);
  let s = "";
  if (m.type === "LOCATION") {
    s = `Location${x.location?.name ? `: ${x.location.name}` : ""}`;
  } else if (m.type === "CONTACTS") {
    const names = (x.contacts ?? []).map((c) => c.name?.formatted_name).filter(Boolean);
    s = names.length ? `Contact: ${names.join(", ")}` : "Contact card";
  } else if (m.type === "DOCUMENT") {
    s = m.mediaCaption || m.content || "Document";
  } else {
    s = m.content || m.mediaCaption || x.body?.text || (m.type === "TEMPLATE" && m.templateName ? `Template · ${m.templateName}` : TYPE_LABEL[m.type] ?? "");
  }
  s = s.replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Location from the extras or the legacy `content` JSON ({lat,lng}). */
export function readLocation(m: { content?: string | null; interactive?: unknown }): LocationData | null {
  const x = asExtras(m.interactive);
  if (x.location && Number.isFinite(x.location.latitude) && Number.isFinite(x.location.longitude)) return x.location;
  if (!m.content) return null;
  try {
    const j = JSON.parse(m.content) as { lat?: number; lng?: number; name?: string; address?: string };
    if (Number.isFinite(j.lat) && Number.isFinite(j.lng)) return { latitude: Number(j.lat), longitude: Number(j.lng), name: j.name, address: j.address };
  } catch { /* not JSON */ }
  return null;
}

// ─── Meta limits for interactive messages (reply buttons & list) ──────────────
export const LIMITS = {
  buttonBody: 1024, listBody: 4096, header: 60, footer: 60,
  buttonTitle: 20, buttonId: 256, maxButtons: 3,
  listButton: 20, sectionTitle: 24, rowTitle: 24, rowDescription: 72, rowId: 200, maxSections: 10, maxRows: 10,
  text: 4096,
} as const;

export interface InteractiveDraft {
  kind: "button" | "list";
  header?: string;
  body: string;
  footer?: string;
  buttons?: string[];
  button?: string;
  sections?: { title?: string; rows: { title: string; description?: string }[] }[];
}

const slug = (s: string, i: number) => `${s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "opt"}_${i + 1}`;

/** Validates a draft against Meta's limits and builds the Cloud API `interactive` object. */
export function buildInteractive(d: InteractiveDraft): { ok: true; payload: Required<Pick<MessageExtras, "type" | "body" | "action">> & Pick<MessageExtras, "header" | "footer"> } | { ok: false; error: string } {
  const body = String(d.body ?? "").trim();
  const header = String(d.header ?? "").trim();
  const footer = String(d.footer ?? "").trim();
  if (!body) return { ok: false, error: "Body text is required." };
  if (header.length > LIMITS.header) return { ok: false, error: `Header can be at most ${LIMITS.header} characters.` };
  if (footer.length > LIMITS.footer) return { ok: false, error: `Footer can be at most ${LIMITS.footer} characters.` };
  const base = { ...(header && { header: { type: "text", text: header } }), body: { text: body }, ...(footer && { footer: { text: footer } }) };

  if (d.kind === "button") {
    if (body.length > LIMITS.buttonBody) return { ok: false, error: `Body can be at most ${LIMITS.buttonBody} characters for reply buttons.` };
    const titles = (d.buttons ?? []).map((b) => String(b ?? "").trim()).filter(Boolean);
    if (!titles.length) return { ok: false, error: "Add at least one button." };
    if (titles.length > LIMITS.maxButtons) return { ok: false, error: `WhatsApp allows at most ${LIMITS.maxButtons} reply buttons.` };
    if (titles.some((t) => t.length > LIMITS.buttonTitle)) return { ok: false, error: `Button labels can be at most ${LIMITS.buttonTitle} characters.` };
    if (new Set(titles.map((t) => t.toLowerCase())).size !== titles.length) return { ok: false, error: "Button labels must be unique." };
    return { ok: true, payload: { type: "button", ...base, action: { buttons: titles.map((t, i) => ({ type: "reply", reply: { id: slug(t, i), title: t } })) } } };
  }

  if (body.length > LIMITS.listBody) return { ok: false, error: `Body can be at most ${LIMITS.listBody} characters.` };
  const button = String(d.button ?? "").trim();
  if (!button) return { ok: false, error: "The list button label is required." };
  if (button.length > LIMITS.listButton) return { ok: false, error: `The list button label can be at most ${LIMITS.listButton} characters.` };
  const sections = (d.sections ?? [])
    .map((s) => ({ title: String(s.title ?? "").trim(), rows: (s.rows ?? []).map((r) => ({ title: String(r.title ?? "").trim(), description: String(r.description ?? "").trim() })).filter((r) => r.title) }))
    .filter((s) => s.rows.length);
  if (!sections.length) return { ok: false, error: "Add at least one row." };
  if (sections.length > LIMITS.maxSections) return { ok: false, error: `At most ${LIMITS.maxSections} sections.` };
  const rowCount = sections.reduce((n, s) => n + s.rows.length, 0);
  if (rowCount > LIMITS.maxRows) return { ok: false, error: `WhatsApp allows at most ${LIMITS.maxRows} rows in total.` };
  if (sections.length > 1 && sections.some((s) => !s.title)) return { ok: false, error: "Every section needs a title when there is more than one." };
  if (sections.some((s) => s.title.length > LIMITS.sectionTitle)) return { ok: false, error: `Section titles can be at most ${LIMITS.sectionTitle} characters.` };
  if (sections.some((s) => s.rows.some((r) => r.title.length > LIMITS.rowTitle))) return { ok: false, error: `Row titles can be at most ${LIMITS.rowTitle} characters.` };
  if (sections.some((s) => s.rows.some((r) => r.description.length > LIMITS.rowDescription))) return { ok: false, error: `Row descriptions can be at most ${LIMITS.rowDescription} characters.` };
  let i = 0;
  return {
    ok: true,
    payload: {
      type: "list", ...base,
      action: {
        button,
        sections: sections.map((s) => ({
          title: s.title || "Options", // Meta requires a section title
          rows: s.rows.map((r) => ({ id: slug(r.title, i++), title: r.title, ...(r.description && { description: r.description }) })),
        })),
      },
    },
  };
}
