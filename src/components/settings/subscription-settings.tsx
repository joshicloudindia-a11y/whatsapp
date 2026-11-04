"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Icon } from "@/components/ui/icon";
import { useCheckout } from "@/components/billing/use-checkout";
import { cn } from "@/lib/utils";
import { Meter, SButton, SettingsCard, SettingsHeader } from "./ui";

interface Usage { key: string; label: string; used: number; limit: number; icon: string }
interface Sub {
  plan: string; status: string; trialEndsAt: string | null; trialDaysLeft: number | null;
  planConfig: { id: string; name: string; slug: string; monthlyPrice: number; annualPrice: number; currency: string; features: string[] } | null;
  currentPeriodStart: string | null; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean; paymentProvider: string | null;
  usagePeriodStart: string; usage: Usage[]; gateways: { stripe: boolean; razorpay: boolean }; canManageBilling: boolean;
}
interface Plan {
  id: string; name: string; slug: string; description?: string; monthlyPrice: number; annualPrice: number; currency: string;
  isPopular: boolean; features: string[]; maxUsers: number; maxBroadcasts: number; maxWhatsappNumbers: number; maxAutomations: number;
}

const SYM: Record<string, string> = { USD: "$", INR: "₹", EUR: "€", GBP: "£" };
const money = (n: number, c: string) => `${SYM[c] ?? ""}${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}${SYM[c] ? "" : ` ${c}`}`;
const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const fmtLimit = (n: number) => (n >= 999999 ? "Unlimited" : n.toLocaleString("en-IN"));

const STATUS: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: "Active", cls: "bg-green-50 text-green-700" },
  TRIALING: { label: "Trial", cls: "bg-blue-50 text-blue-700" },
  PAST_DUE: { label: "Payment overdue", cls: "bg-amber-50 text-amber-700" },
  CANCELED: { label: "Cancelled", cls: "bg-red-50 text-red-600" },
  UNPAID: { label: "Unpaid", cls: "bg-red-50 text-red-600" },
};

export function SubscriptionSettings() {
  const { data: session } = useSession();
  const params = useSearchParams();
  const [annual, setAnnual] = useState(false);
  const { stripe, razorpay, loadingKey } = useCheckout(session?.user?.name);

  const { data: sub, isLoading } = useQuery({ queryKey: ["subscription-full"], queryFn: () => axios.get("/api/settings/subscription").then((r) => r.data as Sub) });
  const { data: plansData } = useQuery({ queryKey: ["public-plans"], queryFn: () => axios.get("/api/plans").then((r) => r.data.plans as Plan[]), staleTime: 5 * 60_000 });
  const plans = plansData ?? [];

  if (isLoading || !sub) return <div className="max-w-4xl space-y-4">{[0, 1, 2].map((i) => <div key={i} className="h-40 rounded-2xl bg-white border border-slate-200 animate-pulse" />)}</div>;

  const isTrial = sub.plan === "TRIAL" || sub.status === "TRIALING";
  const st = STATUS[sub.status] ?? STATUS.ACTIVE;
  const current = sub.planConfig;
  const nearLimit = sub.usage.filter((u) => u.limit < 999999 && u.limit > 0 && u.used / u.limit >= 0.8);
  const canPay = sub.canManageBilling && (sub.gateways.stripe || sub.gateways.razorpay);

  return (
    <div className="max-w-4xl space-y-5">
      <SettingsHeader title="My subscription" description="Your plan, usage and upgrades." />

      {params.get("payment") === "success" && (
        <p className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
          <Icon name="check_circle" filled className="w-5 h-5" /> Payment successful. Your plan has been updated.
        </p>
      )}

      {/* Current plan */}
      <section className="relative overflow-hidden rounded-2xl bg-slate-950 text-white p-5 sm:p-6">
        <div className="absolute -right-16 -top-16 w-56 h-56 rounded-full bg-green-500/25 blur-3xl" />
        <div className="relative flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-green-400">Current plan</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <h3 className="text-2xl font-bold">{isTrial ? "Free trial" : current?.name ?? sub.plan}</h3>
              <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold", st.cls)}>{st.label}</span>
            </div>
            <p className="mt-1.5 text-sm text-slate-400">
              {isTrial
                ? sub.trialDaysLeft !== null ? `${sub.trialDaysLeft} day${sub.trialDaysLeft === 1 ? "" : "s"} left in your trial${sub.trialEndsAt ? ` (ends ${fmtDate(sub.trialEndsAt)})` : ""}.` : "Upgrade any time to unlock higher limits."
                : sub.currentPeriodEnd
                  ? sub.cancelAtPeriodEnd ? `Cancels on ${fmtDate(sub.currentPeriodEnd)}.` : `Renews on ${fmtDate(sub.currentPeriodEnd)}.`
                  : "Your subscription is active."}
              {sub.paymentProvider && ` Billed via ${sub.paymentProvider}.`}
            </p>
          </div>
          {current && !isTrial && (
            <div className="sm:text-right">
              <p className="text-3xl font-bold">{money(current.monthlyPrice, current.currency)}<span className="text-sm font-medium text-slate-400">/mo</span></p>
              {current.annualPrice > 0 && <p className="text-xs text-slate-400 mt-1">or {money(current.annualPrice, current.currency)}/year</p>}
            </div>
          )}
        </div>
        {isTrial && sub.trialDaysLeft !== null && (
          <div className="relative mt-4 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full bg-green-400" style={{ width: `${Math.max(4, 100 - (sub.trialDaysLeft / 14) * 100)}%` }} />
          </div>
        )}
      </section>

      {nearLimit.length > 0 && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Icon name="warning" className="w-5 h-5 shrink-0" />
          You&apos;re close to your limit for {nearLimit.map((u) => u.label.toLowerCase()).join(", ")}. Upgrade to avoid interruptions.
        </p>
      )}

      {/* Usage */}
      <SettingsCard title="Usage" description={`Current period since ${fmtDate(sub.usagePeriodStart)}`} icon="monitoring">
        <div className="grid gap-4 sm:grid-cols-2">
          {sub.usage.map((u) => {
            const pct = u.limit >= 999999 || u.limit <= 0 ? 0 : Math.round((u.used / u.limit) * 100);
            return (
              <div key={u.key} className="rounded-xl border border-slate-100 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700"><Icon name={u.icon} className="w-4 h-4 text-slate-400" /> {u.label}</span>
                  <span className={cn("text-[11px] font-semibold tabular-nums", pct >= 90 ? "text-red-600" : pct >= 75 ? "text-amber-600" : "text-slate-500")}>{u.limit >= 999999 ? "∞" : `${pct}%`}</span>
                </div>
                <p className="mt-2 text-lg font-bold text-slate-900 tabular-nums">{u.used.toLocaleString("en-IN")} <span className="text-xs font-medium text-slate-400">/ {fmtLimit(u.limit)}</span></p>
                <Meter used={u.used} limit={u.limit} className="mt-2" />
              </div>
            );
          })}
        </div>
      </SettingsCard>

      {/* Plans */}
      {plans.length > 0 && (
        <SettingsCard title={isTrial ? "Choose a plan" : "Change plan"} icon="workspace_premium">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <p className="text-xs text-slate-500">{canPay ? "Secure payment via Stripe or Razorpay. Cancel any time." : sub.canManageBilling ? "Online payments aren't configured yet. Contact support to upgrade." : "Ask an organization admin or billing manager to change the plan."}</p>
            <div className="inline-flex self-start rounded-xl bg-slate-100 p-1">
              {[false, true].map((a) => (
                <button key={String(a)} onClick={() => setAnnual(a)}
                  className={cn("rounded-lg px-3.5 py-1.5 text-xs font-semibold transition", annual === a ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}>
                  {a ? "Yearly" : "Monthly"}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {plans.map((p) => {
              const isCurrent = !isTrial && current?.id === p.id;
              const price = annual ? p.annualPrice : p.monthlyPrice;
              const saving = p.monthlyPrice > 0 && p.annualPrice > 0 ? Math.round((1 - p.annualPrice / (p.monthlyPrice * 12)) * 100) : 0;
              const interval = annual ? "annual" : "monthly";
              return (
                <div key={p.id} className={cn("relative rounded-2xl border p-4 flex flex-col gap-3", isCurrent ? "border-2 border-green-500 bg-green-50/30" : p.isPopular ? "border-green-300" : "border-slate-200")}>
                  {(p.isPopular || isCurrent) && (
                    <span className={cn("absolute -top-2.5 left-4 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white", isCurrent ? "bg-slate-900" : "bg-[#25D366]")}>
                      {isCurrent ? "Current plan" : "Most popular"}
                    </span>
                  )}
                  <div>
                    <p className="text-sm font-bold text-slate-900">{p.name}</p>
                    {p.description && <p className="text-xs text-slate-500 mt-0.5">{p.description}</p>}
                  </div>
                  <div>
                    <p className="text-2xl font-extrabold text-slate-900">{money(price, p.currency)}<span className="text-xs font-medium text-slate-400">/{annual ? "yr" : "mo"}</span></p>
                    {annual && saving > 0 && <p className="text-[11px] font-semibold text-green-600">Save {saving}% vs monthly</p>}
                  </div>
                  <dl className="grid grid-cols-2 gap-1.5 text-[11px]">
                    {[["Users", p.maxUsers], ["WA numbers", p.maxWhatsappNumbers], ["Broadcasts", p.maxBroadcasts], ["Automations", p.maxAutomations]].map(([l, v]) => (
                      <div key={l as string} className="flex justify-between rounded-lg bg-slate-50 px-2 py-1"><dt className="text-slate-500">{l}</dt><dd className="font-semibold text-slate-800">{fmtLimit(v as number)}</dd></div>
                    ))}
                  </dl>
                  {p.features?.length > 0 && (
                    <ul className="space-y-1">
                      {p.features.slice(0, 4).map((f, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-slate-600"><Icon name="check" className="w-3.5 h-3.5 text-green-500 mt-0.5" /> {f}</li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-auto space-y-2 pt-1">
                    {isCurrent ? (
                      <p className="text-center text-xs font-semibold text-green-700 py-2">You&apos;re on this plan</p>
                    ) : canPay && price > 0 ? (
                      <>
                        {sub.gateways.razorpay && (
                          <SButton className="w-full" loading={loadingKey === `rzp-${p.slug}`} disabled={!!loadingKey} onClick={() => razorpay(p.slug, interval)}>
                            {isTrial ? "Choose" : "Switch to"} {p.name.split(" ")[0]} · UPI / Card
                          </SButton>
                        )}
                        {sub.gateways.stripe && (
                          <SButton variant={sub.gateways.razorpay ? "secondary" : "primary"} className="w-full" loading={loadingKey === `stripe-${p.slug}`} disabled={!!loadingKey} onClick={() => stripe(p.slug, interval)}>
                            Pay with card (Stripe)
                          </SButton>
                        )}
                      </>
                    ) : (
                      <a href="mailto:support@chatflow.ai?subject=Plan%20upgrade" className="block text-center rounded-xl border border-slate-200 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Contact sales</a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </SettingsCard>
      )}
    </div>
  );
}
