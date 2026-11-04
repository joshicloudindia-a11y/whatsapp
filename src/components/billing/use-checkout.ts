"use client";

import { useState } from "react";
import axios from "axios";
import { toast } from "sonner";

type RazorpayResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayCtor = new (opts: Record<string, unknown>) => { open: () => void; on: (e: string, cb: (r: { error?: { description?: string } }) => void) => void };

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if ((window as unknown as { Razorpay?: unknown }).Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

/** Shared Stripe / Razorpay checkout used by the upgrade wall and the subscription settings. */
export function useCheckout(userName?: string | null) {
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  const stripe = async (planSlug: string, interval: "monthly" | "annual") => {
    setLoadingKey(`stripe-${planSlug}`);
    try {
      const res = await axios.post("/api/billing/checkout", { planSlug, interval });
      window.location.href = res.data.url;
    } catch (e) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to start Stripe checkout");
      setLoadingKey(null);
    }
  };

  const razorpay = async (planSlug: string, interval: "monthly" | "annual") => {
    setLoadingKey(`rzp-${planSlug}`);
    try {
      if (!(await loadRazorpay())) {
        toast.error("Could not load Razorpay. Check your internet connection.");
        return setLoadingKey(null);
      }
      const res = await axios.post("/api/billing/razorpay/order", { planSlug, interval });
      const { orderId, amount, currency, keyId, planName } = res.data;
      const Razorpay = (window as unknown as { Razorpay: RazorpayCtor }).Razorpay;
      const rzp = new Razorpay({
        key: keyId, amount, currency, name: "ChatFlow", order_id: orderId,
        description: `${planName} — ${interval === "annual" ? "Annual" : "Monthly"} plan`,
        prefill: { name: userName ?? undefined },
        theme: { color: "#25D366" },
        handler: async (r: RazorpayResponse) => {
          try {
            await axios.post("/api/billing/razorpay/verify", { ...r, planSlug, interval });
            toast.success("Payment successful! Updating your plan…");
            window.location.href = "/settings?tab=billing&payment=success";
          } catch {
            toast.error("Payment received but verification failed. Contact support.");
            setLoadingKey(null);
          }
        },
        modal: { ondismiss: () => setLoadingKey(null) },
      });
      rzp.on("payment.failed", (resp) => {
        toast.error(resp.error?.description ?? "Payment failed. Please try again.");
        setLoadingKey(null);
      });
      rzp.open();
    } catch (e) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to start payment");
      setLoadingKey(null);
    }
  };

  return { stripe, razorpay, loadingKey };
}
