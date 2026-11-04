"use client";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export const sInput =
  "w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm bg-white placeholder:text-slate-400 " +
  "focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500 disabled:bg-slate-50 disabled:text-slate-500";

export const settingsError = (e: unknown, fallback = "Something went wrong") =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;

export function SettingsHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
      <div>
        <h2 className="text-lg sm:text-xl font-bold text-slate-900">{title}</h2>
        {description && <p className="text-sm text-slate-500 mt-0.5">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function SettingsCard({ title, description, icon, children, footer, className }: {
  title?: string; description?: string; icon?: string; children: React.ReactNode; footer?: React.ReactNode; className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden", className)}>
      {title && (
        <div className="flex items-start gap-3 px-4 sm:px-5 pt-4 sm:pt-5">
          {icon && <span className="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center shrink-0"><Icon name={icon} className="w-[18px] h-[18px]" /></span>}
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900">{title}</h3>
            {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
          </div>
        </div>
      )}
      <div className="p-4 sm:p-5">{children}</div>
      {footer && <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 px-4 sm:px-5 py-3 bg-slate-50/70 border-t border-slate-100">{footer}</div>}
    </section>
  );
}

export function SField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

export function SButton({ variant = "primary", loading, className, children, ...props }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger"; loading?: boolean }) {
  const v = {
    primary: "bg-[#25D366] text-white hover:bg-[#1fb857] shadow-sm shadow-green-500/20",
    secondary: "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
    danger: "bg-red-500 text-white hover:bg-red-600",
  }[variant];
  return (
    <button {...props} disabled={props.disabled || loading}
      className={cn("inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed", v, className)}>
      {loading && <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />}
      {children}
    </button>
  );
}

export function Meter({ used, limit, className }: { used: number; limit: number; className?: string }) {
  const unlimited = limit >= 999999;
  const pct = unlimited || limit <= 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const color = pct >= 90 ? "bg-red-500" : pct >= 75 ? "bg-amber-500" : "bg-[#25D366]";
  return (
    <div className={cn("h-2 rounded-full bg-slate-100 overflow-hidden", className)} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${unlimited ? 4 : Math.max(pct, used > 0 ? 3 : 0)}%` }} />
    </div>
  );
}
