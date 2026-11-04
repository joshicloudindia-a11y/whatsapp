"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

type StepState = "done" | "in_progress" | "todo" | "locked";
interface Step {
  key: string; title: string; description: string; state: StepState; status: string;
  cta: { label: string; href: string } | null;
}
interface Onboarding { organizationId: string; steps: Step[]; completed: number; total: number; percent: number; nextKey: string | null }

const STEP_ICON: Record<string, string> = {
  whatsapp: "smartphone", contacts: "contacts", template: "description", broadcast: "campaign", chatbot: "smart_toy",
};

const STATE_BADGE: Record<StepState, { label: string; cls: string; icon: string }> = {
  done:        { label: "Done",        cls: "bg-green-50 text-green-700 ring-green-600/15", icon: "check_circle" },
  in_progress: { label: "In progress", cls: "bg-amber-50 text-amber-700 ring-amber-600/15", icon: "hourglass_top" },
  todo:        { label: "To do",       cls: "bg-slate-100 text-slate-600 ring-slate-500/10", icon: "radio_button_unchecked" },
  locked:      { label: "Needs admin", cls: "bg-slate-100 text-slate-500 ring-slate-500/10", icon: "lock" },
};

function ProgressRing({ percent, size = 56 }: { percent: number; size?: number }) {
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${percent}% complete`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#25D366" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - percent / 100)} className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-900 tabular-nums">{percent}%</span>
    </div>
  );
}

function StepMarker({ step, index }: { step: Step; index: number }) {
  if (step.state === "done") {
    return <span className="w-8 h-8 rounded-full bg-[#25D366] text-white flex items-center justify-center shrink-0"><Icon name="check" className="w-4 h-4" /></span>;
  }
  if (step.state === "locked") {
    return <span className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center shrink-0"><Icon name="lock" className="w-3.5 h-3.5" /></span>;
  }
  return (
    <span className={cn(
      "w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold border-2",
      step.state === "in_progress" ? "border-amber-400 text-amber-600 bg-amber-50" : "border-slate-200 text-slate-500 bg-white"
    )}>
      {index + 1}
    </span>
  );
}

export function OnboardingChecklist() {
  const { data, isLoading } = useQuery<Onboarding>({
    queryKey: ["onboarding"],
    queryFn: () => axios.get("/api/onboarding").then((r) => r.data),
    refetchInterval: 60_000,
  });

  const storageKey = data ? `cf:onboarding:hidden:${data.organizationId}` : null;
  const [hidden, setHidden] = useState<boolean | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  // Read the persisted "hidden" preference once we know the organization.
  useEffect(() => {
    if (!storageKey) return;
    const stored = window.localStorage.getItem(storageKey) === "1";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHidden(stored);
  }, [storageKey]);

  const setHiddenPersisted = (v: boolean) => {
    setHidden(v);
    if (storageKey) {
      if (v) window.localStorage.setItem(storageKey, "1");
      else window.localStorage.removeItem(storageKey);
    }
  };

  if (isLoading || !data || hidden === null) {
    return isLoading ? <div className="h-[132px] rounded-2xl border border-slate-200/70 bg-white animate-pulse" /> : null;
  }

  const allDone = data.completed === data.total;
  const next = data.steps.find((s) => s.key === data.nextKey) ?? null;
  const nextIndex = next ? data.steps.indexOf(next) : -1;

  if (hidden) {
    if (allDone) return null;
    return (
      <button onClick={() => setHiddenPersisted(false)}
        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm hover:border-green-300 hover:text-green-700">
        <Icon name="task_alt" className="w-4 h-4 text-green-600" />
        Setup {data.completed}/{data.total} · Resume guide
      </button>
    );
  }

  if (allDone) {
    return (
      <section className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-2xl border border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 p-4 sm:p-5">
        <span className="w-12 h-12 rounded-2xl bg-[#25D366] text-white flex items-center justify-center shrink-0"><Icon name="celebration" className="w-6 h-6" /></span>
        <div className="flex-1">
          <h2 className="text-sm font-bold text-slate-900">You&apos;re all set up!</h2>
          <p className="text-xs text-slate-600 mt-0.5">Your number, contacts, templates, broadcasts and chatbot are all live.</p>
        </div>
        <button onClick={() => setHiddenPersisted(true)} className="self-start sm:self-auto rounded-xl border border-green-200 bg-white px-4 py-2 text-xs font-semibold text-green-700 hover:bg-green-50">
          Dismiss
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200/70 bg-white shadow-sm overflow-hidden" aria-labelledby="onboarding-title">
      {/* Header */}
      <div className="flex items-center gap-3 sm:gap-4 p-4 sm:p-5">
        <ProgressRing percent={data.percent} />
        <div className="flex-1 min-w-0">
          <h2 id="onboarding-title" className="text-sm sm:text-base font-bold text-slate-900">Finish setting up ChatFlow</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {data.completed} of {data.total} steps complete
            {next && <span className="hidden sm:inline"> · Next: {next.title.toLowerCase()}</span>}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setCollapsed((c) => !c)} aria-expanded={!collapsed} aria-label={collapsed ? "Expand setup guide" : "Collapse setup guide"}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <Icon name={collapsed ? "expand_more" : "expand_less"} className="w-5 h-5" />
          </button>
          <button onClick={() => setHiddenPersisted(true)} className="px-2 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            Hide
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="border-t border-slate-100 p-4 sm:p-5 space-y-4">
          {/* Up next */}
          {next && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 rounded-2xl border border-green-200 bg-green-50/60 p-4">
              <span className="w-11 h-11 rounded-xl bg-white text-green-600 border border-green-200 flex items-center justify-center shrink-0">
                <Icon name={STEP_ICON[next.key] ?? "task_alt"} className="w-5 h-5" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-green-700">Up next · Step {nextIndex + 1}</p>
                <p className="text-sm font-bold text-slate-900 mt-0.5">{next.title}</p>
                <p className="text-xs text-slate-600 mt-0.5">{next.description}</p>
              </div>
              {next.cta ? (
                <Link href={next.cta.href}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-green-500/25 hover:bg-[#1fb857] shrink-0">
                  {next.cta.label} <Icon name="arrow_forward" className="w-4 h-4" />
                </Link>
              ) : (
                <span className="text-xs font-medium text-slate-500 shrink-0">{next.status}</span>
              )}
            </div>
          )}

          {/* All steps */}
          <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {data.steps.map((step, i) => {
              const badge = STATE_BADGE[step.state];
              const isNext = step.key === data.nextKey;
              const inner = (
                <div className={cn(
                  "h-full flex gap-3 rounded-xl border p-3 transition-colors xl:flex-col",
                  step.state === "done" ? "border-green-100 bg-green-50/40" :
                  isNext ? "border-green-300 bg-white ring-2 ring-green-500/10" :
                  "border-slate-200 bg-white",
                  step.cta && step.state !== "locked" && "hover:border-green-300"
                )}>
                  <StepMarker step={step} index={i} />
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-[13px] font-semibold leading-snug", step.state === "done" ? "text-slate-700" : "text-slate-900")}>{step.title}</p>
                    <p className="mt-1 text-[11px] text-slate-500 leading-snug">{step.status}</p>
                    <span className={cn("mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1", badge.cls)}>
                      <Icon name={badge.icon} filled={step.state === "done"} className="w-3 h-3" /> {badge.label}
                    </span>
                  </div>
                </div>
              );
              return (
                <li key={step.key}>
                  {step.cta && step.state !== "locked" ? <Link href={step.cta.href} className="block h-full">{inner}</Link> : inner}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}
