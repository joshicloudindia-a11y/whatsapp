/**
 * Single source of truth for the legal pages (/legal, /privacy, /terms, …).
 * Update company details here; every policy page reads from this file.
 */
export const LEGAL = {
  brand: "ChatFlow",
  site: "https://www.bulkmarketing.online",
  domain: "bulkmarketing.online",
  /** Registered legal entity operating the service. Shown only when set. */
  entity: process.env.NEXT_PUBLIC_LEGAL_ENTITY || "Webeside Technology Institute And Company",
  /** Registered office address. Shown only when set. */
  address: process.env.NEXT_PUBLIC_LEGAL_ADDRESS || "",
  email: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@bulkmarketing.online",
  grievanceEmail: process.env.NEXT_PUBLIC_GRIEVANCE_EMAIL || process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@bulkmarketing.online",
  jurisdiction: "India",
  effectiveDate: "10 November 2026",
} as const;

export interface LegalDoc {
  slug: string;
  title: string;
  short: string;
  icon: string;
  summary: string;
}

export const LEGAL_DOCS: LegalDoc[] = [
  { slug: "privacy", title: "Privacy Policy", short: "Privacy", icon: "shield", summary: "What data we collect, why we collect it, and the choices you have." },
  { slug: "terms", title: "Terms of Service", short: "Terms", icon: "gavel", summary: "The agreement that governs your use of ChatFlow." },
  { slug: "refund-policy", title: "Refund & Cancellation Policy", short: "Refunds", icon: "currency_rupee", summary: "How subscriptions, cancellations and refunds work." },
  { slug: "acceptable-use", title: "Acceptable Use Policy", short: "Acceptable use", icon: "policy", summary: "Messaging rules that keep your number and our platform in good standing." },
  { slug: "cookie-policy", title: "Cookie Policy", short: "Cookies", icon: "cookie", summary: "The small set of cookies we use and why." },
  { slug: "data-deletion", title: "Data Deletion", short: "Data deletion", icon: "delete_forever", summary: "How to delete your account and data, including data received via Meta." },
];
