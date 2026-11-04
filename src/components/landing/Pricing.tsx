"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { Eyebrow, FOCUS } from "./brand";

type Plan = {
  id: string; name: string; slug: string; description?: string | null;
  monthlyPrice: number; annualPrice: number; currency: string;
  isPopular: boolean; features: unknown;
  maxUsers: number; maxBroadcasts: number; maxAutomations: number;
  maxApiCalls: number; maxAiCredits: number; maxWhatsappNumbers: number;
};

const CURRENCY_SYMBOL: Record<string, string> = { USD: "$", INR: "₹", EUR: "€", GBP: "£" };
const FEATURE_PREVIEW = 6;

const num = (n: number) => n.toLocaleString("en-IN");
const compact = (n: number) =>
  n >= 999999 ? "Unlimited" : new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(n);
const money = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

function featuresOf(plan: Plan): string[] {
  return Array.isArray(plan.features) ? plan.features.filter((f): f is string => typeof f === "string") : [];
}

function savingPct(p: Plan) {
  if (p.monthlyPrice <= 0 || p.annualPrice <= 0) return 0;
  return Math.round((1 - p.annualPrice / (p.monthlyPrice * 12)) * 100);
}

function PlanCard({ plan, annual, isLoggedIn }: { plan: Plan; annual: boolean; isLoggedIn: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const price = annual ? plan.annualPrice : plan.monthlyPrice;
  const sym = CURRENCY_SYMBOL[plan.currency] ?? `${plan.currency} `;
  const features = featuresOf(plan);
  const visible = showAll ? features : features.slice(0, FEATURE_PREVIEW);
  const saved = Math.round(plan.monthlyPrice * 12 - plan.annualPrice);
  const popular = plan.isPopular;

  const limits = [
    { label: "Team users", val: num(plan.maxUsers) },
    { label: "WA numbers", val: num(plan.maxWhatsappNumbers) },
    { label: "Broadcasts / mo", val: compact(plan.maxBroadcasts) },
    { label: "Automations", val: compact(plan.maxAutomations) },
    { label: "API calls / mo", val: compact(plan.maxApiCalls) },
    { label: "AI credits / mo", val: compact(plan.maxAiCredits) },
  ];

  return (
    <article
      className={cn(
        "relative flex flex-col rounded-3xl border p-6 sm:p-7 transition-shadow",
        popular
          ? "border-[#25D366]/60 bg-slate-950 text-white shadow-2xl shadow-green-900/20 lg:-my-3"
          : "border-slate-200 bg-white text-slate-900 hover:shadow-xl"
      )}
    >
      {popular && (
        <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-[#25D366] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-950">
          <Icon name="star" filled className="w-3.5 h-3.5" /> Most popular
        </span>
      )}

      <h3 className="text-lg font-bold">{plan.name}</h3>
      {plan.description && (
        <p className={cn("mt-1.5 text-sm leading-relaxed", popular ? "text-slate-300" : "text-slate-600")}>{plan.description}</p>
      )}

      <div className="my-6">
        <p className="flex items-baseline gap-1.5">
          <span className="text-4xl sm:text-5xl font-extrabold tracking-tight">
            {price === 0 ? "Free" : `${sym}${money(price)}`}
          </span>
          {price > 0 && (
            <span className={cn("text-sm", popular ? "text-slate-400" : "text-slate-500")}>/ {annual ? "year" : "month"}</span>
          )}
        </p>
        {annual && plan.annualPrice > 0 && (
          <p className={cn("mt-1.5 text-xs font-medium", popular ? "text-slate-300" : "text-slate-600")}>
            ≈ {sym}{money(Math.round(plan.annualPrice / 12))} / month, billed yearly
          </p>
        )}
        {annual && plan.monthlyPrice > 0 && saved > 0 && (
          <p className={cn("mt-1 text-xs font-semibold", popular ? "text-[#25D366]" : "text-green-700")}>
            Save {sym}{money(saved)} vs monthly
          </p>
        )}
      </div>

      <dl className="mb-6 grid grid-cols-2 gap-2">
        {limits.map((s) => (
          <div key={s.label} className={cn("rounded-xl p-2.5 text-xs", popular ? "bg-white/5 border border-white/10" : "bg-slate-50")}>
            <dt className={popular ? "text-slate-400" : "text-slate-500"}>{s.label}</dt>
            <dd className="mt-0.5 font-semibold">{s.val}</dd>
          </div>
        ))}
      </dl>

      {features.length > 0 && (
        <div className="mb-6 flex-1">
          <ul className="space-y-2.5" id={`plan-features-${plan.id}`}>
            {visible.map((f, i) => (
              <li key={i} className={cn("flex items-start gap-2.5 text-sm", popular ? "text-slate-200" : "text-slate-700")}>
                <Icon name="check_circle" filled className={cn("w-4 h-4 mt-0.5 shrink-0", popular ? "text-[#25D366]" : "text-green-600")} />
                {f}
              </li>
            ))}
          </ul>
          {features.length > FEATURE_PREVIEW && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              aria-expanded={showAll}
              aria-controls={`plan-features-${plan.id}`}
              className={cn(
                "mt-3 inline-flex items-center gap-1 rounded-md text-sm font-semibold",
                popular ? "text-[#25D366]" : "text-green-700",
                FOCUS
              )}
            >
              {showAll ? "Show less" : `Show all ${features.length} features`}
              <Icon name={showAll ? "expand_less" : "expand_more"} className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      <Link
        href={isLoggedIn ? "/settings?tab=billing" : "/register"}
        className={cn(
          "mt-auto flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-all",
          popular
            ? "bg-[#25D366] text-slate-950 hover:brightness-110"
            : "border-2 border-slate-200 text-slate-800 hover:border-slate-300 hover:bg-slate-50",
          FOCUS
        )}
      >
        {isLoggedIn ? "Select plan" : price === 0 ? "Get started free" : "Start free trial"}
        <Icon name="arrow_forward" className="w-4 h-4" />
      </Link>
    </article>
  );
}

export function Pricing({ isLoggedIn }: { isLoggedIn: boolean }) {
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");

  const { data, isLoading, isError, refetch } = useQuery<{ plans: Plan[] }>({
    queryKey: ["public-plans"],
    queryFn: () => axios.get("/api/plans").then((r) => r.data),
  });

  const plans: Plan[] = data?.plans ?? [];
  const hasAnnual = plans.some((p) => p.annualPrice > 0);
  const annual = hasAnnual && cycle === "annual";
  const bestSaving = Math.max(0, ...plans.map(savingPct));

  return (
    <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-20 bg-slate-50 py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>Pricing</Eyebrow>
          <h2 id="pricing-title" className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
            Simple plans that grow with you
          </h2>
          <p className="mt-3 text-base sm:text-lg text-slate-600">No setup fee. No hidden charges. Cancel anytime.</p>

          {hasAnnual && (
            <div role="group" aria-label="Billing period" className="mt-7 inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm">
              {(["monthly", "annual"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={cycle === c}
                  onClick={() => setCycle(c)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full px-4 sm:px-5 py-2 text-sm font-semibold transition-colors",
                    cycle === c ? "bg-slate-950 text-white" : "text-slate-600 hover:text-slate-900",
                    FOCUS
                  )}
                >
                  {c === "monthly" ? "Monthly" : "Yearly"}
                  {c === "annual" && bestSaving > 0 && (
                    <span className="rounded-full bg-[#25D366] px-2 py-0.5 text-[10px] font-bold text-slate-950">
                      Save up to {bestSaving}%
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-12">
          {isLoading ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading plans">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-[30rem] animate-pulse rounded-3xl border border-slate-200 bg-white p-7">
                  <div className="mb-4 h-5 w-1/3 rounded bg-slate-100" />
                  <div className="mb-6 h-12 w-1/2 rounded bg-slate-100" />
                  <div className="space-y-3">{[1, 2, 3, 4, 5].map((j) => <div key={j} className="h-4 rounded bg-slate-100" />)}</div>
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center">
              <p className="font-semibold text-slate-900">We couldn&apos;t load plans right now</p>
              <button
                type="button"
                onClick={() => refetch()}
                className={cn("mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50", FOCUS)}
              >
                <Icon name="refresh" className="w-4 h-4" /> Try again
              </button>
            </div>
          ) : plans.length === 0 ? (
            <div className="py-16 text-center text-slate-600">
              <p className="text-lg font-semibold text-slate-900">Pricing plans coming soon</p>
              <p className="mt-1 text-sm">Contact us for custom pricing</p>
            </div>
          ) : (
            <div
              className={cn(
                "grid items-start gap-6",
                plans.length === 1
                  ? "mx-auto max-w-md"
                  : plans.length === 2
                    ? "mx-auto max-w-4xl grid-cols-1 md:grid-cols-2"
                    : plans.length === 4
                      ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-4"
                      : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
              )}
            >
              {plans.map((plan) => (
                <PlanCard key={plan.id} plan={plan} annual={annual} isLoggedIn={isLoggedIn} />
              ))}
            </div>
          )}
        </div>

        <p className="mt-10 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-slate-600">
          {["14-day free trial", "No credit card required", "Cancel anytime"].map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5">
              <Icon name="check" className="w-4 h-4 text-green-600" /> {t}
            </span>
          ))}
        </p>
      </div>
    </section>
  );
}
