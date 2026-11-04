import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("bg-white rounded-2xl border border-slate-200/70 shadow-sm", className)}>{children}</div>;
}

export function CardHeader({ title, subtitle, icon, action }: { title: string; subtitle?: string; icon?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 py-4 border-b border-slate-100">
      <div className="flex items-center gap-2.5 min-w-0">
        {icon && (
          <span className="w-8 h-8 rounded-lg bg-slate-50 text-slate-500 flex items-center justify-center shrink-0">
            <Icon name={icon} className="w-4 h-4" />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-900 truncate">{title}</h2>
          {subtitle && <p className="text-xs text-slate-400 mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

/** Green when the change is good, red when bad. `invert` for lower-is-better metrics. */
export function TrendChip({ value, invert = false, className }: { value: number | null | undefined; invert?: boolean; className?: string }) {
  if (value === null || value === undefined) return null;
  if (value === 0) {
    return <span className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold bg-slate-100 text-slate-500", className)}>0%</span>;
  }
  const good = invert ? value < 0 : value > 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
      good ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600", className)}>
      <Icon name={value > 0 ? "trending_up" : "trending_down"} className="w-3 h-3" /> {Math.abs(value)}%
    </span>
  );
}

export function KpiCard({ label, value, icon, color, trend, invert, sub }: {
  label: string; value: string; icon: string; color: string; trend?: number | null; invert?: boolean; sub?: string;
}) {
  return (
    <Card className="p-4 sm:p-5 flex flex-col gap-3 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${color}14`, color }}>
          <Icon name={icon} className="w-[18px] h-[18px]" />
        </div>
        <TrendChip value={trend} invert={invert} />
      </div>
      <div className="min-w-0">
        <p className="text-xl sm:text-2xl font-bold text-slate-900 leading-none tabular-nums truncate">{value}</p>
        <p className="text-xs font-medium text-slate-500 mt-1.5 truncate">{label}</p>
      </div>
      {sub && <p className="text-[11px] text-slate-400 -mt-1 truncate">{sub}</p>}
    </Card>
  );
}

export function KpiSkeleton() {
  return (
    <Card className="p-4 sm:p-5 h-[128px] animate-pulse">
      <div className="w-9 h-9 rounded-xl bg-slate-100" />
      <div className="mt-4 h-6 w-20 rounded bg-slate-100" />
      <div className="mt-2 h-3 w-24 rounded bg-slate-100" />
    </Card>
  );
}

export function BlockSkeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-slate-100", className)} />;
}

export function EmptyState({ icon, title, hint, className }: { icon: string; title: string; hint?: string; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-1.5 py-12 px-4 text-center", className)}>
      <span className="w-11 h-11 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-300">
        <Icon name={icon} className="w-6 h-6" />
      </span>
      <p className="text-sm font-semibold text-slate-600">{title}</p>
      {hint && <p className="text-xs text-slate-400 max-w-xs">{hint}</p>}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-xl bg-slate-100 p-0.5" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={cn("px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap",
            value === o.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Formatters ──────────────────────────────────────────────────────────────

export const fmtNum = (n: number | null | undefined) => (n ?? 0).toLocaleString("en-IN");
export const fmtPct = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n}%`);

export function fmtDuration(secs: number | null | undefined) {
  if (secs === null || secs === undefined) return "—";
  if (secs < 60) return `${Math.round(secs)}s`;
  if (secs < 3600) {
    const m = Math.floor(secs / 60), s = Math.round(secs % 60);
    return s && m < 10 ? `${m}m ${s}s` : `${m}m`;
  }
  if (secs < 86400) {
    const h = Math.floor(secs / 3600), m = Math.round((secs % 3600) / 60);
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(secs / 86400), h = Math.round((secs % 86400) / 3600);
  return h ? `${d}d ${h}h` : `${d}d`;
}

/** "2026-11-04" → "4 Nov" (date-only strings, no timezone shift). */
export function fmtDay(day: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-IN", { ...opts, timeZone: "UTC" });
}
