"use client";

import { useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { cn, getInitials } from "@/lib/utils";
import { STAGE_META, cleanTag, type Stage } from "./shared";

export const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500";

export const errMsg = (e: unknown, f = "Something went wrong") =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? f;

export const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString("en-IN");

const AVATAR_COLORS = ["#25D366", "#0ea5e9", "#8b5cf6", "#f59e0b", "#ec4899", "#14b8a6", "#6366f1", "#ef4444"];

export function Avatar({ name, seed, size = "md" }: { name: string | null; seed: string; size?: "sm" | "md" | "lg" }) {
  const hash = [...seed].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
  return (
    <span
      className={cn("rounded-full flex items-center justify-center font-bold text-white shrink-0 select-none",
        size === "sm" ? "w-8 h-8 text-[11px]" : size === "lg" ? "w-16 h-16 text-xl" : "w-10 h-10 text-xs")}
      style={{ background: AVATAR_COLORS[hash % AVATAR_COLORS.length] }}
    >
      {name ? getInitials(name) : <Icon name="person" className={size === "lg" ? "w-7 h-7" : "w-4 h-4"} filled />}
    </span>
  );
}

export function StagePill({ stage }: { stage: Stage }) {
  const m = STAGE_META[stage];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap", m.cls)}>
      <span className={cn("w-1.5 h-1.5 rounded-full", m.dot)} /> {m.label}
    </span>
  );
}

export function TagChip({ tag, onRemove }: { tag: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 max-w-[140px]">
      <span className="truncate">#{tag}</span>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove ${tag}`} className="-mr-1 rounded-full p-0.5 text-slate-400 hover:text-slate-700">
          <Icon name="close" className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}

export function Toggle({ checked, onChange, label, hint, danger }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; danger?: boolean }) {
  return (
    <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 cursor-pointer hover:bg-slate-50/60">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-800">{label}</span>
        {hint && <span className="block text-[11px] text-slate-500 mt-0.5">{hint}</span>}
      </span>
      <input type="checkbox" className="sr-only peer" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span aria-hidden className={cn("relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-green-500/40",
        checked ? (danger ? "bg-red-500" : "bg-[#25D366]") : "bg-slate-200")}>
        <span className={cn("absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform", checked && "translate-x-5")} />
      </span>
    </label>
  );
}

/** Bottom sheet on phones, centered dialog on sm+. */
export function Modal({ title, subtitle, onClose, children, footer, wide }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-slate-950/50 admin-fade" onClick={onClose} />
      <div className={cn("relative w-full max-h-[92dvh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white shadow-2xl admin-pop", wide ? "sm:max-w-2xl" : "sm:max-w-lg")}>
        <div className="sm:hidden mx-auto mt-2 h-1.5 w-10 rounded-full bg-slate-200" />
        <div className="flex items-start gap-3 px-5 py-4 border-b border-slate-100">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-slate-900">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
            <Icon name="close" className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex gap-2 px-5 pt-4 border-t border-slate-100 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn("w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin", className)} />;
}

/** Chip input: Enter / comma adds, Backspace removes the last chip; suggestions from existing tags. */
export function TagInput({ value, onChange, suggestions = [], placeholder = "Add a tag…", max = 20 }: { value: string[]; onChange: (v: string[]) => void; suggestions?: string[]; placeholder?: string; max?: number }) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const t = cleanTag(raw);
    if (t && !value.includes(t) && value.length < max) onChange([...value, t]);
    setDraft("");
  };
  const q = cleanTag(draft);
  const matches = suggestions.filter((s) => !value.includes(s) && (!q || s.includes(q))).slice(0, 8);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-2 focus-within:ring-2 focus-within:ring-green-500/30 focus-within:border-green-500">
        {value.map((t) => <TagChip key={t} tag={t} onRemove={() => onChange(value.filter((x) => x !== t))} />)}
        <input
          value={draft}
          onChange={(e) => (e.target.value.endsWith(",") ? add(e.target.value.slice(0, -1)) : setDraft(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); add(draft); }
            else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => draft && add(draft)}
          placeholder={value.length ? "" : placeholder}
          disabled={value.length >= max}
          className="min-w-[90px] flex-1 bg-transparent py-0.5 text-sm focus:outline-none"
          aria-label="Add tag"
        />
      </div>
      {matches.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {matches.map((s) => (
            <button key={s} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => add(s)}
              className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-500 hover:border-green-500 hover:text-green-700">
              <Icon name="add" className="w-3 h-3" /> {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
