"use client";

import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { asExtras, readLocation, type MessageExtras, type ReactionEntry } from "./message-extras";
import type { ChatMessage } from "./types";

/** [chat] Pieces rendered inside / around chat bubbles. */

/** Wraps case-insensitive matches of `q` in <mark>. */
export function highlight(text: string, q?: string): ReactNode {
  const needle = q?.trim();
  if (!needle || needle.length < 2) return text;
  const lower = text.toLowerCase();
  const n = needle.toLowerCase();
  const out: ReactNode[] = [];
  let i = 0;
  for (let at = lower.indexOf(n); at !== -1; at = lower.indexOf(n, i)) {
    if (at > i) out.push(text.slice(i, at));
    out.push(<mark key={at} className="rounded bg-yellow-200 px-0.5 text-slate-900">{text.slice(at, at + needle.length)}</mark>);
    i = at + needle.length;
  }
  if (i < text.length) out.push(text.slice(i));
  return out;
}

export function QuotedBlock({ ctx, own, resolvedPreview, resolvedDirection, contactName, onJump }: {
  ctx: NonNullable<MessageExtras["context"]>; own: boolean; resolvedPreview?: string | null; resolvedDirection?: string | null;
  contactName: string; onJump?: () => void;
}) {
  const dir = resolvedDirection ?? ctx.direction;
  const who = dir === "OUTBOUND" ? "You" : dir === "INBOUND" ? contactName : "Quoted message";
  const text = resolvedPreview ?? ctx.preview ?? "Original message isn't available";
  const Tag = onJump ? "button" : "div";
  return (
    <Tag type={onJump ? "button" : undefined} onClick={onJump} aria-label={onJump ? `Go to quoted message from ${who}` : undefined}
      className={cn("mb-1 w-full min-w-0 text-left rounded-lg border-l-4 px-2 py-1.5 block", own ? "bg-[#c7f0bf]/70 border-emerald-600" : "bg-slate-100 border-sky-500", onJump && "hover:brightness-95")}>
      <span className={cn("block text-[11px] font-semibold", dir === "OUTBOUND" ? "text-emerald-700" : "text-sky-700")}>{who}</span>
      <span className="block text-[12px] text-slate-600 line-clamp-2 break-words">{text}</span>
    </Tag>
  );
}

export function ForwardedLabel() {
  return (
    <p className="mb-0.5 flex items-center gap-1 text-[11px] italic text-slate-500">
      <Icon name="forward" className="w-3 h-3" /> Forwarded
    </p>
  );
}

export function ReactionChips({ reactions, own, myUserId, onToggle }: {
  reactions?: Record<string, ReactionEntry>; own: boolean; myUserId?: string; onToggle?: (emoji: string, mine: boolean) => void;
}) {
  const list = Object.entries(reactions ?? {}).filter(([, r]) => r.count > 0);
  if (!list.length) return null;
  return (
    <div className={cn("-mt-2 mb-1 flex gap-1 relative z-[1]", own ? "justify-end pr-2" : "justify-start pl-2")}>
      {list.map(([emoji, r]) => {
        const business = !!r.byUserIds?.length;
        const mine = !!myUserId && !!r.byUserIds?.includes(myUserId);
        const who = [r.byContact && "Customer", business && (mine ? "You" : "Your team")].filter(Boolean).join(" and ");
        return (
          <button key={emoji} type="button" onClick={() => onToggle?.(emoji, business)} disabled={!onToggle}
            title={`${who} reacted ${emoji}${business ? " · click to remove" : ""}`} aria-label={`${emoji} reaction by ${who}`}
            className={cn("inline-flex items-center gap-0.5 rounded-full border bg-white px-1.5 py-0.5 text-[13px] leading-none shadow-sm",
              business ? "border-green-300" : "border-slate-200", onToggle && "hover:bg-slate-50")}>
            {emoji}{r.count > 1 && <span className="text-[10px] font-semibold text-slate-500">{r.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function LocationCard({ m }: { m: ChatMessage }) {
  const loc = readLocation(m);
  if (!loc) return <p className="text-sm text-slate-500">Location</p>;
  const href = `https://maps.google.com/?q=${loc.latitude},${loc.longitude}`;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="flex items-start gap-2.5 rounded-xl bg-black/5 p-2.5 w-64 max-w-full hover:bg-black/10">
      <span className="w-10 h-10 shrink-0 rounded-lg bg-white flex items-center justify-center text-red-500 shadow-sm"><Icon name="location_on" filled className="w-5 h-5" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-slate-800 truncate">{loc.name || "Shared location"}</span>
        {loc.address && <span className="block text-[11px] text-slate-500 line-clamp-2">{loc.address}</span>}
        <span className="block text-[11px] text-sky-700 underline">Open in Maps</span>
      </span>
    </a>
  );
}

export function ContactsCard({ m }: { m: ChatMessage }) {
  const cards = asExtras(m.interactive).contacts ?? [];
  if (!cards.length) return <p className="text-sm">{m.content ?? "Contact card"}</p>;
  return (
    <div className="space-y-1.5 w-64 max-w-full">
      {cards.map((c, i) => {
        const phone = c.phones?.find((p) => p.phone || p.wa_id);
        return (
          <div key={i} className="flex items-center gap-2.5 rounded-xl bg-black/5 p-2.5">
            <span className="w-10 h-10 shrink-0 rounded-full bg-white flex items-center justify-center text-slate-500 shadow-sm"><Icon name="person" className="w-5 h-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-slate-800 truncate">{c.name?.formatted_name ?? "Contact"}</span>
              {phone && <span className="block text-[11px] text-slate-500 truncate">{phone.phone ?? `+${phone.wa_id}`}</span>}
              {c.org?.company && <span className="block text-[11px] text-slate-400 truncate">{c.org.company}</span>}
            </span>
            {phone?.wa_id && (
              <a href={`https://wa.me/${phone.wa_id}`} target="_blank" rel="noreferrer" aria-label={`Message ${c.name?.formatted_name ?? "contact"} on WhatsApp`}
                className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full border border-slate-300 text-slate-600 hover:bg-white">
                <Icon name="chat" className="w-4 h-4" />
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Outbound reply-buttons / list preview (chatbot or agent sent). */
export function InteractivePreview({ x }: { x: MessageExtras }) {
  const buttons = x.action?.buttons?.map((b) => b.reply?.title).filter(Boolean) as string[] | undefined;
  const rows = x.action?.sections?.flatMap((s) => s.rows ?? []) ?? [];
  if (!buttons?.length && !x.action?.button) return null;
  return (
    <div className="mt-1.5 space-y-1">
      {x.footer?.text && <p className="text-[11px] text-slate-500">{x.footer.text}</p>}
      {buttons?.map((t) => (
        <div key={t} className="flex items-center justify-center gap-1 rounded-lg border-t border-black/5 bg-white/60 py-1.5 text-[13px] font-semibold text-sky-700">
          <Icon name="reply" className="w-3.5 h-3.5" /> {t}
        </div>
      ))}
      {x.action?.button && (
        <details className="rounded-lg bg-white/60">
          <summary className="cursor-pointer list-none flex items-center justify-center gap-1 py-1.5 text-[13px] font-semibold text-sky-700">
            <Icon name="list" className="w-3.5 h-3.5" /> {x.action.button}
          </summary>
          <ul className="px-2 pb-2 space-y-1">
            {rows.map((r, i) => (
              <li key={`${r.id}-${i}`} className="rounded-md bg-white px-2 py-1">
                <span className="block text-[12px] font-semibold text-slate-800">{r.title}</span>
                {r.description && <span className="block text-[11px] text-slate-500">{r.description}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** Inbound button / list selection label. */
export function InboundReplyTag({ x }: { x: MessageExtras }) {
  if (!x.reply) return null;
  const label = x.reply.kind === "list_reply" ? "Selected from list" : x.reply.kind === "button" ? "Tapped template button" : x.reply.kind === "nfm_reply" ? "Form response" : "Tapped button";
  return (
    <p className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
      <Icon name={x.reply.kind === "list_reply" ? "list" : "touch_app"} className="w-3 h-3" /> {label}
    </p>
  );
}

/** [calls] Neutral call-log bubble for SYSTEM messages carrying `templateData.call` (rendered by the calling feature's data). */
export function CallLogBubble({ m }: { m: ChatMessage }) {
  const call = ((m.templateData ?? {}) as { call?: { direction?: string; status?: string; durationSec?: number; duration?: number } }).call ?? {};
  const secs = Number(call.durationSec ?? call.duration ?? 0);
  const time = new Date(m.createdAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  const parts = [
    call.direction ? `${String(call.direction).toLowerCase() === "inbound" || String(call.direction).toLowerCase() === "user_initiated" ? "Incoming" : "Outgoing"} call` : "Call",
    call.status ? String(call.status).toLowerCase().replace(/_/g, " ") : null,
    secs > 0 ? `${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, "0")}` : null,
  ].filter(Boolean);
  return (
    <div className="flex justify-center my-2">
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/90 px-3 py-1.5 text-[12px] text-slate-600 shadow-sm">
        <Icon name="call" className="w-3.5 h-3.5 text-green-600" /> {parts.join(" · ")} <span className="text-[10px] text-slate-400">{time}</span>
      </span>
    </div>
  );
}

export function SystemBubble({ m }: { m: ChatMessage }) {
  return (
    <div className="flex justify-center my-2">
      <span className="max-w-[85%] rounded-lg bg-white/90 px-3 py-1.5 text-center text-[12px] text-slate-600 shadow-sm">{m.content || "System message"}</span>
    </div>
  );
}
