"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheck, faCrown, faLock, faArrowRightFromBracket, faCreditCard,
} from "@fortawesome/free-solid-svg-icons";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";

type Plan = {
  id: string; name: string; slug: string; description?: string;
  monthlyPrice: number; annualPrice: number; currency: string;
  isPopular: boolean; features: string[];
};

type Gateways = { stripe: boolean; razorpay: boolean };

const CURRENCY_SYMBOL: Record<string, string> = { USD: "$", INR: "₹", EUR: "€", GBP: "£" };

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if ((window as any).Razorpay) { resolve(true); return; }
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

// ─── Individual plan card ─────────────────────────────────────────────────────
function PlanCard({
  plan, annual, isAdmin, gateways, loadingKey, onStripe, onRazorpay,
}: {
  plan: Plan; annual: boolean; isAdmin: boolean; gateways: Gateways;
  loadingKey: string | null;
  onStripe: (p: Plan) => void;
  onRazorpay: (p: Plan) => void;
}) {
  const price = annual ? plan.annualPrice : plan.monthlyPrice;
  const sym = CURRENCY_SYMBOL[plan.currency] ?? "$";
  const hasAny = gateways.stripe || gateways.razorpay;

  return (
    <div
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

        <div className="mt-auto space-y-2">
          {isAdmin ? (
            hasAny ? (
              <>
                {gateways.stripe && (
                  <button
                    onClick={() => onStripe(plan)}
                    disabled={!!loadingKey}
                    className={cn(
                      "w-full py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-60 flex items-center justify-center gap-2",
                      plan.isPopular ? "text-white hover:brightness-110" : "border-2 text-slate-700 hover:bg-slate-50"
                    )}
                    style={plan.isPopular ? { background: "#25D366" } : { borderColor: "#e2e8f0" }}
                  >
                    {loadingKey === `stripe-${plan.slug}` ? (
                      <><span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />Redirecting…</>
                    ) : (
                      <><FontAwesomeIcon icon={faCreditCard} className="w-3.5 h-3.5" />Pay with Stripe</>
                    )}
                  </button>
                )}

                {gateways.razorpay && (
                  <button
                    onClick={() => onRazorpay(plan)}
                    disabled={!!loadingKey}
                    className="w-full py-2.5 rounded-xl text-sm font-bold border-2 transition-all disabled:opacity-60 flex items-center justify-center gap-2 hover:opacity-90"
                    style={{ borderColor: "#2d6ae0", color: "#2d6ae0" }}
                  >
                    {loadingKey === `rzp-${plan.slug}` ? (
                      <><span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />Opening…</>
                    ) : (
                      <>
                        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                          <path d="M0 0l4.5 15.9L10.1 9H6.7L9.9 0H0zm24 0H14.1L9.9 9h3.4l-5.6 15.9L24 0z" />
                        </svg>
                        Pay with Razorpay
                      </>
                    )}
                  </button>
                )}
              </>
            ) : (
              <div className="w-full py-2.5 rounded-xl text-xs font-medium text-center text-slate-500 bg-slate-50 border border-slate-100">
                Payment not configured yet
              </div>
            )
          ) : (
            <div className="w-full py-2.5 rounded-xl text-xs font-medium text-center text-slate-500 bg-slate-50 border border-slate-100">
              Ask your admin to select this plan
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function UpgradeRequired({
  orgName, userName, isAdmin,
}: {
  orgName: string; userName: string; isAdmin: boolean;
}) {
  const [annual, setAnnual] = useState(false);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  const { data: plansData, isLoading: plansLoading } = useQuery({
    queryKey: ["public-plans"],
    queryFn: () => axios.get("/api/plans").then((r) => r.data),
  });

  const { data: gatewayData } = useQuery({
    queryKey: ["billing-gateways"],
    queryFn: () => axios.get("/api/billing/gateways").then((r) => r.data),
  });

  const plans: Plan[] = plansData?.plans ?? [];
  const gateways: Gateways = gatewayData ?? { stripe: false, razorpay: false };

  // ── Stripe ──
  const handleStripe = async (plan: Plan) => {
    setLoadingKey(`stripe-${plan.slug}`);
    try {
      const res = await axios.post("/api/billing/checkout", {
        planSlug: plan.slug,
        interval: annual ? "annual" : "monthly",
      });
      window.location.href = res.data.url;
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? "Failed to start Stripe checkout");
      setLoadingKey(null);
    }
  };

  // ── Razorpay ──
  const handleRazorpay = async (plan: Plan) => {
    setLoadingKey(`rzp-${plan.slug}`);
    try {
      const loaded = await loadRazorpayScript();
      if (!loaded) {
        toast.error("Could not load Razorpay. Check your internet connection.");
        setLoadingKey(null);
        return;
      }

      const res = await axios.post("/api/billing/razorpay/order", {
        planSlug: plan.slug,
        interval: annual ? "annual" : "monthly",
      });
      const { orderId, amount, currency, keyId, planName } = res.data;

      const rzp = new (window as any).Razorpay({
        key: keyId,
        amount,
        currency,
        name: "ChatFlow",
        description: `${planName} — ${annual ? "Annual" : "Monthly"} Plan`,
        order_id: orderId,
        prefill: { name: userName },
        theme: { color: "#25D366" },
        handler: async (response: any) => {
          try {
            await axios.post("/api/billing/razorpay/verify", {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              planSlug: plan.slug,
              interval: annual ? "annual" : "monthly",
            });
            toast.success("Payment successful! Loading your dashboard…");
            window.location.href = "/dashboard?payment=success";
          } catch {
            toast.error("Payment received but verification failed. Contact support.");
            setLoadingKey(null);
          }
        },
        modal: { ondismiss: () => setLoadingKey(null) },
      });

      rzp.on("payment.failed", (resp: any) => {
        toast.error(resp.error?.description ?? "Payment failed. Please try again.");
        setLoadingKey(null);
      });
      rzp.open();
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? "Failed to initiate payment");
      setLoadingKey(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-100 px-4 sm:px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#25D366" }}>
            <svg viewBox="0 0 24 24" fill="white" className="w-4 h-4">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
          </div>
          <span className="font-bold text-slate-900 text-sm">ChatFlow</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400 hidden sm:block truncate max-w-[200px]">{userName} · {orgName}</span>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            <FontAwesomeIcon icon={faArrowRightFromBracket} className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto py-10 px-4">
        <div className="max-w-5xl mx-auto space-y-8">

          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
              <FontAwesomeIcon icon={faLock} className="w-3 h-3" />
              Select a plan to unlock your dashboard
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
              Welcome, {userName.split(" ")[0]}!
            </h1>
            <p className="text-slate-500 text-sm sm:text-base max-w-lg mx-auto">
              {isAdmin
                ? `Choose a plan for ${orgName} to start using ChatFlow.`
                : `Your workspace admin needs to select a plan before you can continue.`}
            </p>
          </div>

          {/* Monthly / Annual toggle */}
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
          {plansLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-2xl border border-slate-100 p-7 animate-pulse h-80" />
              ))}
            </div>
          ) : plans.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-slate-100">
              <p className="text-slate-500 font-medium">Plans coming soon</p>
              <p className="text-slate-400 text-sm mt-1">Contact us for pricing information</p>
            </div>
          ) : (
            <div className={cn(
              "grid gap-5",
              plans.length === 1 ? "max-w-sm mx-auto" :
              plans.length === 2 ? "grid-cols-1 md:grid-cols-2 max-w-2xl mx-auto" :
              "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
            )}>
              {plans.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  annual={annual}
                  isAdmin={isAdmin}
                  gateways={gateways}
                  loadingKey={loadingKey}
                  onStripe={handleStripe}
                  onRazorpay={handleRazorpay}
                />
              ))}
            </div>
          )}

          <p className="text-center text-xs text-slate-400 pb-6">
            Secure payments via Stripe &amp; Razorpay · Cancel anytime · Need help? Contact support
          </p>
        </div>
      </div>
    </div>
  );
}
