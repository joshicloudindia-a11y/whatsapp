"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheck, faCrown, faRocket, faArrowRightFromBracket, faLock,
} from "@fortawesome/free-solid-svg-icons";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";

type Plan = {
  id: string; name: string; slug: string; description?: string;
  monthlyPrice: number; annualPrice: number; currency: string;
  isPopular: boolean; features: string[];
  maxUsers: number; maxBroadcasts: number; maxAutomations: number;
  maxApiCalls: number; maxAiCredits: number; maxWhatsappNumbers: number;
  stripePriceMonthly?: string; stripePriceAnnual?: string;
};

const CURRENCY_SYMBOL: Record<string, string> = { USD: "$", INR: "₹", EUR: "€", GBP: "£" };

export default function UpgradeRequired({
  orgName,
  userName,
  isAdmin,
}: {
  orgName: string;
  userName: string;
  isAdmin: boolean;
}) {
  const [annual, setAnnual] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["public-plans"],
    queryFn: () => axios.get("/api/plans").then((r) => r.data),
  });

  const plans: Plan[] = data?.plans ?? [];

  const handleSelectPlan = async (plan: Plan) => {
    if (!isAdmin) return;
    const priceId = annual ? plan.stripePriceAnnual : plan.stripePriceMonthly;
    if (!priceId) {
      toast.error("This plan is not configured for online payment yet. Contact support.");
      return;
    }
    setLoadingPlan(plan.slug);
    try {
      const res = await axios.post("/api/billing/checkout", {
        planSlug: plan.slug,
        interval: annual ? "annual" : "monthly",
      });
      window.location.href = res.data.url;
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? "Failed to start checkout");
      setLoadingPlan(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top bar */}
      <header className="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#25D366" }}>
            <svg viewBox="0 0 24 24" fill="white" className="w-4 h-4">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
          </div>
          <span className="font-bold text-slate-900 text-sm">ChatFlow</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500 hidden sm:block">{userName} · {orgName}</span>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            <FontAwesomeIcon icon={faArrowRightFromBracket} className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      {/* Main */}
      <div className="flex-1 overflow-y-auto py-10 px-4">
        <div className="max-w-5xl mx-auto space-y-8">

          {/* Hero */}
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
              <FontAwesomeIcon icon={faLock} className="w-3 h-3" />
              Choose a plan to unlock your dashboard
            </div>
            <h1 className="text-3xl font-extrabold text-slate-900">
              Welcome to ChatFlow, {userName.split(" ")[0]}!
            </h1>
            <p className="text-slate-500 text-base max-w-lg mx-auto">
              {isAdmin
                ? `Select a plan for ${orgName} to start managing your WhatsApp inbox.`
                : `Your workspace admin needs to select a plan. Contact them to get started.`}
            </p>
          </div>

          {/* Billing toggle */}
          {isAdmin && (
            <div className="flex items-center justify-center gap-4">
              <span className={cn("text-sm font-medium", !annual ? "text-slate-900" : "text-slate-400")}>Monthly</span>
              <button
                onClick={() => setAnnual(!annual)}
                className="relative inline-flex h-6 w-12 rounded-full transition-colors"
                style={{ background: annual ? "#25D366" : "#cbd5e1" }}
              >
                <span className={cn(
                  "inline-block w-5 h-5 bg-white rounded-full shadow transform transition-transform mt-0.5",
                  annual ? "translate-x-6 ml-0.5" : "translate-x-0.5"
                )} />
              </button>
              <span className={cn("text-sm font-medium", annual ? "text-slate-900" : "text-slate-400")}>
                Annual
                <span className="ml-1.5 px-1.5 py-0.5 text-xs font-semibold text-white rounded-full" style={{ background: "#25D366" }}>
                  Save 20%
                </span>
              </span>
            </div>
          )}

          {/* Plan cards */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-2xl border border-slate-100 p-7 animate-pulse h-80" />
              ))}
            </div>
          ) : plans.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-slate-100">
              <p className="text-slate-500">Plans coming soon. Contact us to get started.</p>
            </div>
          ) : (
            <div className={cn(
              "grid gap-5",
              plans.length === 1 ? "max-w-sm mx-auto" :
              plans.length === 2 ? "grid-cols-1 md:grid-cols-2 max-w-2xl mx-auto" :
              "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
            )}>
              {plans.map((plan) => {
                const price = annual ? plan.annualPrice : plan.monthlyPrice;
                const sym = CURRENCY_SYMBOL[plan.currency] ?? "$";
                const hasStripe = annual ? !!plan.stripePriceAnnual : !!plan.stripePriceMonthly;
                const isLoading = loadingPlan === plan.slug;

                return (
                  <div
                    key={plan.id}
                    className={cn(
                      "relative bg-white rounded-2xl border flex flex-col overflow-hidden transition-shadow hover:shadow-lg",
                      plan.isPopular ? "border-2 shadow-md" : "border-slate-100"
                    )}
                    style={{ borderColor: plan.isPopular ? "#25D366" : undefined }}
                  >
                    {plan.isPopular && (
                      <div className="flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-white" style={{ background: "#25D366" }}>
                        <FontAwesomeIcon icon={faCrown} className="w-3 h-3" />
                        MOST POPULAR
                      </div>
                    )}

                    <div className="p-6 flex flex-col flex-1 gap-4">
                      <div>
                        <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
                        {plan.description && (
                          <p className="text-xs text-slate-400 mt-1 leading-relaxed">{plan.description}</p>
                        )}
                      </div>

                      <div>
                        <span className="text-4xl font-extrabold text-slate-900">{sym}{price}</span>
                        <span className="text-slate-400 text-sm ml-1">/ {annual ? "year" : "month"}</span>
                        {annual && plan.monthlyPrice > 0 && (
                          <p className="text-xs text-green-600 mt-1 font-medium">
                            Save {sym}{Math.round(plan.monthlyPrice * 12 - plan.annualPrice)} vs monthly
                          </p>
                        )}
                      </div>

                      <ul className="space-y-2 flex-1">
                        {plan.features.slice(0, 5).map((f, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                            <FontAwesomeIcon icon={faCheck} className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "#25D366" }} />
                            {f}
                          </li>
                        ))}
                      </ul>

                      {isAdmin ? (
                        <button
                          onClick={() => handleSelectPlan(plan)}
                          disabled={isLoading}
                          className={cn(
                            "mt-auto w-full py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-60",
                            plan.isPopular ? "text-white hover:brightness-110" : "border-2 text-slate-700 hover:bg-slate-50"
                          )}
                          style={plan.isPopular ? { background: "#25D366" } : { borderColor: "#e2e8f0" }}
                        >
                          {isLoading ? (
                            <span className="flex items-center justify-center gap-2">
                              <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                              Redirecting…
                            </span>
                          ) : hasStripe ? (
                            <span className="flex items-center justify-center gap-2">
                              <FontAwesomeIcon icon={faRocket} className="w-3.5 h-3.5" />
                              Select Plan
                            </span>
                          ) : (
                            "Contact Us to Purchase"
                          )}
                        </button>
                      ) : (
                        <div className="mt-auto w-full py-3 rounded-xl text-xs font-medium text-center text-slate-500 bg-slate-50 border border-slate-100">
                          Ask your admin to select this plan
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-center text-xs text-slate-400">
            Secure payments powered by Stripe · Cancel anytime · Questions? Contact us
          </p>
        </div>
      </div>
    </div>
  );
}
