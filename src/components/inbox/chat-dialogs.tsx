"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { buildInteractive, LIMITS, messagePreview, type InteractiveDraft } from "./message-extras";
import { errText, type ChatMessage } from "./types";

/** [chat] Dialogs used by the inbox chat: info, forward, location, contact card, interactive, starred, confirm. */

const input = "w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500";
const primary = "w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] py-3 text-sm font-semibold text-white hover:bg-[#1fb857] disabled:opacity-50";
const fmt = (d: string | Date) => new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("input, textarea, select, button:not([data-close])")?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); prev?.focus?.({ preventScroll: true }); };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-slate-950/50 admin-fade" onClick={onClose} />
      <div ref={ref} className={cn("relative w-full max-h-[88dvh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white shadow-2xl admin-pop", wide ? "sm:max-w-xl" : "sm:max-w-md")}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <h3 className="flex-1 text-base font-bold text-slate-900">{title}</h3>
          <button data-close onClick={onClose} aria-label="Close" className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"><Icon name="close" className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-slate-100 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, body, confirmLabel, danger, onConfirm, onClose }: {
  title: string; body: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose} footer={
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
        <button onClick={() => { onConfirm(); onClose(); }} className={cn("flex-1 rounded-xl py-2.5 text-sm font-semibold text-white", danger ? "bg-red-600 hover:bg-red-700" : "bg-[#25D366] hover:bg-[#1fb857]")}>{confirmLabel}</button>
      </div>
    }>
      <div className="text-sm text-slate-600">{body}</div>
    </Modal>
  );
}

// ─── Message info ────────────────────────────────────────────────────────────
export function MessageInfoDialog({ m, onClose }: { m: ChatMessage; onClose: () => void }) {
  const own = m.direction === "OUTBOUND";
  const source = (m.templateData as { source?: string } | null)?.source;
  const rows: [string, string, string][] = [];
  rows.push([own ? "Sent" : "Received", fmt(m.createdAt), own ? "check" : "move_to_inbox"]);
  if (own && source !== "broadcast" && m.updatedAt && m.updatedAt !== m.createdAt) {
    // We keep one status per message; updatedAt is the time of the latest status webhook.
    const label = m.status === "READ" ? "Read" : m.status === "DELIVERED" ? "Delivered" : m.status === "FAILED" ? "Failed" : "Last update";
    rows.push([label, fmt(m.updatedAt), m.status === "FAILED" ? "error" : "done_all"]);
  }
  return (
    <Modal title="Message info" onClose={onClose}>
      <div className="rounded-2xl bg-[#efeae2] p-3 mb-4">
        <p className={cn("max-w-[90%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words", own ? "ml-auto bg-[#d9fdd3] rounded-tr-sm" : "bg-white rounded-tl-sm")}>
          {messagePreview(m, 400) || `[${m.type.toLowerCase()}]`}
        </p>
      </div>
      <dl className="space-y-2">
        {rows.map(([k, v, icon]) => (
          <div key={k} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
            <Icon name={icon} className={cn("w-4 h-4", k === "Read" ? "text-sky-500" : k === "Failed" ? "text-red-500" : "text-slate-400")} />
            <dt className="text-xs font-semibold text-slate-600 w-20">{k}</dt>
            <dd className="text-xs text-slate-800">{v}</dd>
          </div>
        ))}
        {own && (
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
            <Icon name="info" className="w-4 h-4 text-slate-400" />
            <dt className="text-xs font-semibold text-slate-600 w-20">Status</dt>
            <dd className="text-xs text-slate-800">{m.status.charAt(0) + m.status.slice(1).toLowerCase()}{m.failureReason ? ` · ${m.failureReason}` : ""}</dd>
          </div>
        )}
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
          <Icon name="person" className="w-4 h-4 text-slate-400" />
          <dt className="text-xs font-semibold text-slate-600 w-20">From</dt>
          <dd className="text-xs text-slate-800">{own ? (m.isBotMessage ? "Chatbot / automation" : m.sentByUser?.name ?? "Your team") : "Customer"}</dd>
        </div>
      </dl>
      {own && <p className="mt-3 text-[11px] text-slate-400">WhatsApp reports one status at a time; earlier steps (sent → delivered → read) are not stored separately.</p>}
    </Modal>
  );
}

// ─── Forward ─────────────────────────────────────────────────────────────────
interface PickConversation { id: string; status: string; sessionExpiresAt: string | null; contact: { name: string | null; phone: string } }

export function ForwardDialog({ m, currentConversationId, onClose, onDone }: { m: ChatMessage; currentConversationId: string; onClose: () => void; onDone: () => void }) {
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["forward-targets", search],
    queryFn: async () => {
      const [open, pending] = await Promise.all(["OPEN", "PENDING"].map((status) =>
        axios.get("/api/conversations", { params: { status, search, limit: 30 } }).then((r) => r.data.conversations as PickConversation[])));
      return [...open, ...pending].filter((c) => c.id !== currentConversationId);
    },
    placeholderData: (p) => p,
  });
  const [now] = useState(() => Date.now());
  const isOpen = (c: PickConversation) => !!c.sessionExpiresAt && new Date(c.sessionExpiresAt).getTime() > now;

  const send = async () => {
    setSending(true);
    try {
      const r = await axios.post(`/api/messages/${m.id}/forward`, { conversationIds: picked });
      const failed = (r.data.results as { ok: boolean; error?: string }[]).filter((x) => !x.ok);
      toast.success(`Forwarded to ${r.data.sent} chat${r.data.sent === 1 ? "" : "s"}`);
      failed.forEach((f) => toast.error(f.error ?? "One forward failed"));
      onDone();
      onClose();
    } catch (e) {
      const results = (e as { response?: { data?: { results?: { error?: string }[] } } }).response?.data?.results;
      toast.error(results?.[0]?.error ?? errText(e, "Forward failed"));
    } finally { setSending(false); }
  };

  return (
    <Modal title="Forward message" onClose={onClose} footer={
      <button onClick={send} disabled={!picked.length || sending} className={primary}>
        {sending && <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />}
        <Icon name="forward" className="w-4 h-4" /> Forward{picked.length ? ` to ${picked.length}` : ""}
      </button>
    }>
      <p className="mb-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600 line-clamp-3">{messagePreview(m, 200) || `[${m.type.toLowerCase()}]`}</p>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search chats…" className={input} aria-label="Search chats" />
      <p className="mt-2 text-[11px] text-slate-400">Only chats with an open 24-hour reply window can receive forwards. Up to 5 at a time.</p>
      <ul className="mt-3 space-y-1">
        {isLoading && <li className="h-12 rounded-xl bg-slate-100 animate-pulse" />}
        {data?.length === 0 && <li className="py-6 text-center text-xs text-slate-500">No open chats found.</li>}
        {data?.map((c) => {
          const open = isOpen(c);
          const on = picked.includes(c.id);
          return (
            <li key={c.id}>
              <button disabled={!open || (!on && picked.length >= 5)} onClick={() => setPicked((p) => (on ? p.filter((x) => x !== c.id) : [...p, c.id]))}
                aria-pressed={on} title={open ? undefined : "The 24-hour window is closed – WhatsApp only allows templates in this chat."}
                className={cn("w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left disabled:opacity-50", on ? "border-green-500 bg-green-50" : "border-slate-200 hover:bg-slate-50")}>
                <span className={cn("w-5 h-5 shrink-0 rounded-md border flex items-center justify-center", on ? "bg-[#25D366] border-[#25D366] text-white" : "border-slate-300")}>
                  {on && <Icon name="check" className="w-3.5 h-3.5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-800 truncate">{c.contact.name || `+${c.contact.phone}`}</span>
                  <span className={cn("block text-[11px]", open ? "text-green-600" : "text-slate-400")}>{open ? "Window open" : "Window closed · template only"}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

// ─── Location ────────────────────────────────────────────────────────────────
export function LocationDialog({ onClose, onSend }: { onClose: () => void; onSend: (loc: { latitude: number; longitude: number; name?: string; address?: string }) => Promise<boolean> }) {
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [locating, setLocating] = useState(false);
  const [sending, setSending] = useState(false);
  const latitude = Number(lat), longitude = Number(lng);
  const valid = lat.trim() !== "" && lng.trim() !== "" && Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;

  const useMine = () => {
    if (!("geolocation" in navigator)) { toast.error("This browser can't share its location."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setLat(p.coords.latitude.toFixed(6)); setLng(p.coords.longitude.toFixed(6)); setLocating(false); },
      (e) => { toast.error(e.code === e.PERMISSION_DENIED ? "Location permission was denied." : "Couldn't get your location."); setLocating(false); },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };
  const send = async () => {
    setSending(true);
    const ok = await onSend({ latitude, longitude, name: name.trim() || undefined, address: address.trim() || undefined });
    setSending(false);
    if (ok) onClose();
  };

  return (
    <Modal title="Send location" onClose={onClose} footer={
      <button onClick={send} disabled={!valid || sending} className={primary}><Icon name="send" className="w-4 h-4" /> Send location</button>
    }>
      <div className="space-y-3">
        <button onClick={useMine} disabled={locating} className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          <Icon name="my_location" className="w-4 h-4" /> {locating ? "Locating…" : "Use my current location"}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1"><span className="text-xs font-semibold text-slate-600">Latitude</span><input inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="28.6139" className={input} /></label>
          <label className="space-y-1"><span className="text-xs font-semibold text-slate-600">Longitude</span><input inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="77.2090" className={input} /></label>
        </div>
        <label className="block space-y-1"><span className="text-xs font-semibold text-slate-600">Place name <span className="font-normal text-slate-400">(optional)</span></span><input value={name} maxLength={200} onChange={(e) => setName(e.target.value)} className={input} /></label>
        <label className="block space-y-1"><span className="text-xs font-semibold text-slate-600">Address <span className="font-normal text-slate-400">(optional)</span></span><input value={address} maxLength={500} onChange={(e) => setAddress(e.target.value)} className={input} /></label>
        {valid && <a href={`https://maps.google.com/?q=${latitude},${longitude}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-sky-700 underline"><Icon name="location_on" className="w-3.5 h-3.5" /> Preview in Maps</a>}
      </div>
    </Modal>
  );
}

// ─── Contact card ────────────────────────────────────────────────────────────
export function ContactCardDialog({ onClose, onSend }: { onClose: () => void; onSend: (contactIds: string[]) => Promise<boolean> }) {
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<{ id: string; label: string }[]>([]);
  const [sending, setSending] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["contact-card-picker", search],
    queryFn: () => axios.get("/api/contacts", { params: { search, limit: 20, sort: "name" } }).then((r) => r.data.contacts as { id: string; name: string | null; phone: string }[]),
    placeholderData: (p) => p,
  });
  const send = async () => {
    setSending(true);
    const ok = await onSend(picked.map((p) => p.id));
    setSending(false);
    if (ok) onClose();
  };
  return (
    <Modal title="Share contact" onClose={onClose} footer={
      <button onClick={send} disabled={!picked.length || sending} className={primary}><Icon name="send" className="w-4 h-4" /> Send {picked.length > 1 ? `${picked.length} contacts` : "contact"}</button>
    }>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search contacts…" className={input} aria-label="Search contacts" />
      {picked.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {picked.map((p) => (
            <button key={p.id} onClick={() => setPicked((x) => x.filter((y) => y.id !== p.id))} className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-[11px] font-semibold text-green-700">
              {p.label} <Icon name="close" className="w-3 h-3" />
            </button>
          ))}
        </div>
      )}
      <ul className="mt-3 space-y-1">
        {isLoading && <li className="h-12 rounded-xl bg-slate-100 animate-pulse" />}
        {data?.length === 0 && <li className="py-6 text-center text-xs text-slate-500">No contacts found.</li>}
        {data?.map((c) => {
          const on = picked.some((p) => p.id === c.id);
          const label = c.name || `+${c.phone}`;
          return (
            <li key={c.id}>
              <button aria-pressed={on} disabled={!on && picked.length >= 10}
                onClick={() => setPicked((x) => (on ? x.filter((y) => y.id !== c.id) : [...x, { id: c.id, label }]))}
                className={cn("w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left disabled:opacity-50", on ? "border-green-500 bg-green-50" : "border-slate-200 hover:bg-slate-50")}>
                <Icon name="person" className="w-4 h-4 text-slate-400" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-800 truncate">{label}</span>
                  <span className="block text-[11px] text-slate-500">+{c.phone}</span>
                </span>
                {on && <Icon name="check" className="w-4 h-4 text-green-600" />}
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

// ─── Interactive (reply buttons / list) ──────────────────────────────────────
function Counter({ v, max }: { v: string; max: number }) {
  return <span className={cn("text-[10px] tabular-nums", v.length > max ? "text-red-600" : "text-slate-400")}>{v.length}/{max}</span>;
}

export function InteractiveDialog({ kind, onClose, onSend }: { kind: "button" | "list"; onClose: () => void; onSend: (draft: InteractiveDraft) => Promise<boolean> }) {
  const [header, setHeader] = useState("");
  const [body, setBody] = useState("");
  const [footer, setFooter] = useState("");
  const [buttons, setButtons] = useState<string[]>(["", ""]);
  const [button, setButton] = useState("Choose");
  const [sections, setSections] = useState<{ title: string; rows: { title: string; description: string }[] }[]>([{ title: "Options", rows: [{ title: "", description: "" }] }]);
  const [sending, setSending] = useState(false);
  const draft: InteractiveDraft = kind === "button" ? { kind, header, body, footer, buttons } : { kind, header, body, footer, button, sections };
  const check = buildInteractive(draft);
  const rowCount = sections.reduce((n, s) => n + s.rows.length, 0);

  const send = async () => {
    setSending(true);
    const ok = await onSend(draft);
    setSending(false);
    if (ok) onClose();
  };
  const setRow = (si: number, ri: number, patch: Partial<{ title: string; description: string }>) =>
    setSections((ss) => ss.map((s, i) => (i !== si ? s : { ...s, rows: s.rows.map((r, j) => (j === ri ? { ...r, ...patch } : r)) })));

  return (
    <Modal wide title={kind === "button" ? "Send reply buttons" : "Send list message"} onClose={onClose} footer={
      <div className="space-y-2">
        {!check.ok && (body.trim() || header || footer) && <p className="text-xs text-red-600">{check.error}</p>}
        <button onClick={send} disabled={!check.ok || sending} className={primary}><Icon name="send" className="w-4 h-4" /> Send</button>
      </div>
    }>
      <div className="space-y-3">
        <label className="block space-y-1">
          <span className="flex justify-between text-xs font-semibold text-slate-600">Header (optional) <Counter v={header} max={LIMITS.header} /></span>
          <input value={header} onChange={(e) => setHeader(e.target.value)} className={input} />
        </label>
        <label className="block space-y-1">
          <span className="flex justify-between text-xs font-semibold text-slate-600">Body <Counter v={body} max={kind === "button" ? LIMITS.buttonBody : LIMITS.listBody} /></span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} className={cn(input, "resize-none")} />
        </label>
        <label className="block space-y-1">
          <span className="flex justify-between text-xs font-semibold text-slate-600">Footer (optional) <Counter v={footer} max={LIMITS.footer} /></span>
          <input value={footer} onChange={(e) => setFooter(e.target.value)} className={input} />
        </label>

        {kind === "button" ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-600">Buttons <span className="font-normal text-slate-400">· up to {LIMITS.maxButtons}, {LIMITS.buttonTitle} characters each</span></p>
            {buttons.map((b, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={b} onChange={(e) => setButtons((x) => x.map((y, j) => (j === i ? e.target.value : y)))} placeholder={`Button ${i + 1}`} className={input} aria-label={`Button ${i + 1}`} />
                <Counter v={b} max={LIMITS.buttonTitle} />
                {buttons.length > 1 && <button onClick={() => setButtons((x) => x.filter((_, j) => j !== i))} aria-label={`Remove button ${i + 1}`} className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"><Icon name="close" className="w-4 h-4" /></button>}
              </div>
            ))}
            {buttons.length < LIMITS.maxButtons && <button onClick={() => setButtons((x) => [...x, ""])} className="inline-flex items-center gap-1 text-xs font-semibold text-green-700"><Icon name="add" className="w-4 h-4" /> Add button</button>}
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="flex justify-between text-xs font-semibold text-slate-600">List button label <Counter v={button} max={LIMITS.listButton} /></span>
              <input value={button} onChange={(e) => setButton(e.target.value)} className={input} />
            </label>
            {sections.map((s, si) => (
              <div key={si} className="rounded-xl border border-slate-200 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input value={s.title} onChange={(e) => setSections((ss) => ss.map((x, i) => (i === si ? { ...x, title: e.target.value } : x)))} placeholder="Section title" className={input} aria-label={`Section ${si + 1} title`} />
                  <Counter v={s.title} max={LIMITS.sectionTitle} />
                  {sections.length > 1 && <button onClick={() => setSections((ss) => ss.filter((_, i) => i !== si))} aria-label={`Remove section ${si + 1}`} className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"><Icon name="close" className="w-4 h-4" /></button>}
                </div>
                {s.rows.map((r, ri) => (
                  <div key={ri} className="grid grid-cols-[1fr_auto] gap-1.5 pl-2 border-l-2 border-slate-100">
                    <input value={r.title} onChange={(e) => setRow(si, ri, { title: e.target.value })} placeholder={`Row ${ri + 1} title (max ${LIMITS.rowTitle})`} className={input} aria-label={`Row ${ri + 1} title`} />
                    <button onClick={() => setSections((ss) => ss.map((x, i) => (i === si ? { ...x, rows: x.rows.filter((_, j) => j !== ri) } : x)))} disabled={s.rows.length === 1}
                      aria-label={`Remove row ${ri + 1}`} className="w-8 h-8 self-center flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-30"><Icon name="close" className="w-4 h-4" /></button>
                    <input value={r.description} onChange={(e) => setRow(si, ri, { description: e.target.value })} placeholder={`Description (optional, max ${LIMITS.rowDescription})`} className={cn(input, "col-span-2 text-xs")} aria-label={`Row ${ri + 1} description`} />
                  </div>
                ))}
                {rowCount < LIMITS.maxRows && <button onClick={() => setSections((ss) => ss.map((x, i) => (i === si ? { ...x, rows: [...x.rows, { title: "", description: "" }] } : x)))} className="inline-flex items-center gap-1 text-xs font-semibold text-green-700"><Icon name="add" className="w-4 h-4" /> Add row</button>}
              </div>
            ))}
            {sections.length < LIMITS.maxSections && rowCount < LIMITS.maxRows && (
              <button onClick={() => setSections((ss) => [...ss, { title: "", rows: [{ title: "", description: "" }] }])} className="inline-flex items-center gap-1 text-xs font-semibold text-green-700"><Icon name="add" className="w-4 h-4" /> Add section</button>
            )}
            <p className="text-[11px] text-slate-400">{rowCount}/{LIMITS.maxRows} rows across all sections.</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─── Starred ─────────────────────────────────────────────────────────────────
export function StarredDialog({ conversationId, onClose, onJump }: { conversationId: string; onClose: () => void; onJump: (id: string) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["starred", conversationId],
    queryFn: () => axios.get(`/api/conversations/${conversationId}/messages`, { params: { starred: 1 } }).then((r) => r.data.messages as ChatMessage[]),
  });
  return (
    <Modal title="Starred messages" onClose={onClose}>
      {isLoading ? <div className="h-16 rounded-xl bg-slate-100 animate-pulse" /> : !data?.length ? (
        <div className="py-8 text-center">
          <Icon name="star" className="w-8 h-8 text-slate-300" />
          <p className="mt-2 text-sm font-semibold text-slate-700">No starred messages</p>
          <p className="text-xs text-slate-500 mt-1">Use the message menu to star important messages. Stars are only visible to you.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {data.map((m) => (
            <li key={m.id}>
              <button onClick={() => { onJump(m.id); onClose(); }} className="w-full text-left rounded-xl border border-slate-200 p-3 hover:bg-slate-50">
                <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <Icon name="star" filled className="w-3 h-3 text-amber-500" /> {m.direction === "OUTBOUND" ? m.sentByUser?.name ?? "You" : "Customer"} · {fmt(m.createdAt)}
                </span>
                <span className="mt-1 block text-sm text-slate-800 line-clamp-3">{messagePreview(m, 300) || `[${m.type.toLowerCase()}]`}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
