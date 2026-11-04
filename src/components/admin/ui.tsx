"use client";

import { Icon } from "@/components/ui/icon";
import { useEffect, useState } from "react";

export const BRAND = "#25D366";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

// ── Layout ───────────────────────────────────────────────────────────────────
export function Page({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-8 space-y-5 sm:space-y-6 max-w-7xl mx-auto w-full">{children}</div>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
        {description && <p className="text-slate-500 text-sm mt-1">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cx("bg-white rounded-2xl border border-slate-200/70 shadow-sm", className)}>{children}</div>;
}

// ── Buttons ──────────────────────────────────────────────────────────────────
type Variant = "primary" | "secondary" | "danger" | "ghost";
const VARIANTS: Record<Variant, string> = {
  primary: "text-white bg-[#25D366] hover:bg-[#1fb857] shadow-sm shadow-green-500/20",
  secondary: "text-slate-700 bg-white border border-slate-200 hover:bg-slate-50",
  danger: "text-white bg-red-500 hover:bg-red-600 shadow-sm shadow-red-500/20",
  ghost: "text-slate-600 hover:bg-slate-100",
};

export function Button({
  variant = "primary", icon, loading, className, children, ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; icon?: string; loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl transition-all",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2",
        "disabled:opacity-50 disabled:cursor-not-allowed active:scale-[.98]",
        VARIANTS[variant], className
      )}
    >
      {loading ? (
        <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
      ) : icon ? (
        <Icon name={icon} className="w-3.5 h-3.5" />
      ) : null}
      {children}
    </button>
  );
}

export function IconButton({
  icon, label, tone = "default", className, ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: string; label: string; tone?: "default" | "danger" | "warn" | "success" }) {
  const tones = {
    default: "border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800",
    danger: "border-red-100 text-red-500 hover:bg-red-50",
    warn: "border-amber-100 text-amber-500 hover:bg-amber-50",
    success: "border-green-100 text-green-600 hover:bg-green-50",
  };
  return (
    <button
      {...props}
      title={label}
      aria-label={label}
      className={cx(
        "w-9 h-9 sm:w-8 sm:h-8 inline-flex items-center justify-center rounded-lg border transition-colors",
        "disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500",
        tones[tone], className
      )}
    >
      <Icon name={icon} className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
    </button>
  );
}

// ── Badges ───────────────────────────────────────────────────────────────────
type Tone = "slate" | "green" | "red" | "amber" | "blue" | "violet";
const TONES: Record<Tone, string> = {
  slate: "bg-slate-100 text-slate-600",
  green: "bg-green-50 text-green-700 ring-1 ring-green-600/10",
  red: "bg-red-50 text-red-600 ring-1 ring-red-600/10",
  amber: "bg-amber-50 text-amber-700 ring-1 ring-amber-600/10",
  blue: "bg-blue-50 text-blue-700 ring-1 ring-blue-600/10",
  violet: "bg-violet-50 text-violet-700 ring-1 ring-violet-600/10",
};

export function Badge({ tone = "slate", dot, children }: { tone?: Tone; dot?: boolean; children: React.ReactNode }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap", TONES[tone])}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/** Role chip using the role's own colour (roles are user-defined). */
export function RoleBadge({ role }: { role: { name: string; color: string } | null | undefined }) {
  if (!role) return <span className="text-xs text-slate-400">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ring-1"
      style={{ color: role.color, background: `${role.color}14`, boxShadow: `inset 0 0 0 1px ${role.color}26` }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: role.color }} />
      {role.name}
    </span>
  );
}

export const PLAN_TONES: Record<string, Tone> = { TRIAL: "slate", GROWTH: "green", PRO: "violet", BUSINESS: "amber" };

export function Avatar({ name, size = "md" }: { name?: string | null; size?: "sm" | "md" | "lg" }) {
  const initials = (name ?? "?").split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  const sizes = { sm: "w-7 h-7 text-[10px]", md: "w-9 h-9 text-xs", lg: "w-11 h-11 text-sm" };
  return (
    <div className={cx("rounded-full flex items-center justify-center font-bold shrink-0 bg-gradient-to-br from-green-400 to-emerald-600 text-white", sizes[size])}>
      {initials || "?"}
    </div>
  );
}

// ── Inputs ───────────────────────────────────────────────────────────────────
export const inputCls =
  "w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm bg-white placeholder:text-slate-400 " +
  "focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500 disabled:bg-slate-50 disabled:text-slate-400";

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative w-full sm:max-w-xs">
      <Icon name={"search"} className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cx(inputCls, "pl-10")}
      />
    </div>
  );
}

export function FilterTabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="flex gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto no-scrollbar">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors",
            value === o.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Debounced value – avoids an API call on every keystroke. */
export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// ── Feedback ─────────────────────────────────────────────────────────────────
export function EmptyState({ icon, title, description, action }: { icon: string; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="py-14 px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mx-auto mb-4">
        <Icon name={icon} className="w-6 h-6" style={{ color: BRAND }} />
      </div>
      <p className="text-slate-800 font-semibold">{title}</p>
      {description && <p className="text-slate-400 text-sm mt-1">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y divide-slate-100">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-5 py-4 animate-pulse">
          <div className="w-9 h-9 rounded-full bg-slate-100" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 rounded bg-slate-100" />
            <div className="h-2.5 w-1/4 rounded bg-slate-100" />
          </div>
          <div className="h-6 w-16 rounded-full bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

export function Pagination({ page, limit, total, onChange }: { page: number; limit: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (total <= limit) return null;
  return (
    <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-t border-slate-100 text-xs text-slate-500">
      <span>
        {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
      </span>
      <div className="flex items-center gap-1.5">
        <IconButton icon={"chevron_left"} label="Previous page" disabled={page <= 1} onClick={() => onChange(page - 1)} />
        <span className="px-2 font-semibold text-slate-700">{page} / {pages}</span>
        <IconButton icon={"chevron_right"} label="Next page" disabled={page >= pages} onClick={() => onChange(page + 1)} />
      </div>
    </div>
  );
}

// ── Overlays ─────────────────────────────────────────────────────────────────
/** Bottom sheet on mobile, centered dialog on ≥sm. Esc closes; body scroll locked. */
export function Modal({
  open, onClose, title, description, icon, children, footer, size = "md",
}: {
  open: boolean; onClose: () => void; title: string; description?: string; icon?: string;
  children: React.ReactNode; footer?: React.ReactNode; size?: "sm" | "md" | "lg";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  const widths = { sm: "sm:max-w-sm", md: "sm:max-w-lg", lg: "sm:max-w-2xl" };
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px] admin-fade" onClick={onClose} />
      <div className={cx(
        "relative bg-white w-full rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh]",
        "admin-pop", widths[size]
      )}>
        <div className="sm:hidden mx-auto mt-2.5 h-1 w-10 rounded-full bg-slate-200" />
        <div className="flex items-start gap-3 px-5 pt-4 pb-3 sm:pt-5 border-b border-slate-100 shrink-0">
          {icon && (
            <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
              <Icon name={icon} className="w-4 h-4" style={{ color: BRAND }} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-slate-900">{title}</h3>
            {description && <p className="text-xs text-slate-500 mt-0.5 truncate">{description}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 -mr-1 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
            <Icon name={"close"} className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4">{children}</div>
        {footer && (
          <div className="flex gap-3 px-5 py-4 border-t border-slate-100 shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

interface ConfirmProps {
  open: boolean; onClose: () => void; onConfirm: () => void; title: string; message: React.ReactNode;
  confirmLabel?: string; confirmText?: string; danger?: boolean; loading?: boolean;
}

/** Confirmation dialog; pass `confirmText` to require typing it (for destructive actions). */
export function ConfirmDialog(props: ConfirmProps) {
  // Mounting the body only while open gives a fresh "typed" state every time.
  return props.open ? <ConfirmDialogBody {...props} /> : null;
}

function ConfirmDialogBody({
  onClose, onConfirm, title, message, confirmLabel = "Confirm", confirmText, danger = true, loading,
}: ConfirmProps) {
  const [typed, setTyped] = useState("");
  const blocked = !!confirmText && typed !== confirmText;
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      size="sm"
      icon={"warning"}
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button variant={danger ? "danger" : "primary"} className="flex-1" disabled={blocked} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm text-slate-600">
        <div>{message}</div>
        {confirmText && (
          <Field label={`Type "${confirmText}" to confirm`}>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} className={inputCls} autoFocus autoComplete="off" />
          </Field>
        )}
      </div>
    </Modal>
  );
}

export function apiError(e: unknown, fallback = "Something went wrong") {
  const err = e as { response?: { data?: { error?: string } } };
  return err?.response?.data?.error ?? fallback;
}
