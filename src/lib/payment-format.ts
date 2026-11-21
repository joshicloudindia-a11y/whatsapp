/** Client-safe formatting helpers for recorded payments (amounts are stored in the smallest unit). */

/** Currencies whose smallest unit equals the major unit (no ×100). */
const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP", "PYG", "UGX", "XAF", "XOF", "RWF", "KMF", "GNF", "BIF", "DJF", "MGA", "VUV", "XPF"]);

export function formatPaymentAmount(amountMinor: number, currency: string): string {
  const cur = (currency || "INR").toUpperCase();
  const major = ZERO_DECIMAL.has(cur) ? amountMinor : amountMinor / 100;
  try {
    return new Intl.NumberFormat(cur === "INR" ? "en-IN" : "en-US", { style: "currency", currency: cur }).format(major);
  } catch {
    return `${major.toFixed(2)} ${cur}`;
  }
}

export function formatPaymentDate(d: string | Date): string {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

export function paymentStatusBadge(status: string): { label: string; cls: string } {
  const s = status.toLowerCase();
  if (s === "captured" || s === "paid" || s === "succeeded") return { label: "Paid", cls: "bg-green-50 text-green-700" };
  if (s === "authorized" || s === "created" || s === "pending") return { label: "Pending", cls: "bg-amber-50 text-amber-700" };
  if (s === "refunded" || s === "partially_refunded") return { label: s === "refunded" ? "Refunded" : "Partly refunded", cls: "bg-slate-100 text-slate-600" };
  if (s === "failed") return { label: "Failed", cls: "bg-red-50 text-red-600" };
  return { label: status.charAt(0).toUpperCase() + status.slice(1), cls: "bg-slate-100 text-slate-600" };
}

export const PROVIDER_LABEL: Record<string, string> = { razorpay: "Razorpay", stripe: "Stripe" };
