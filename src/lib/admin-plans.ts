import type { Prisma } from "@prisma/client";

const NUMERIC = [
  "monthlyPrice", "annualPrice", "sortOrder", "maxUsers", "maxBroadcasts",
  "maxAutomations", "maxApiCalls", "maxAiCredits", "maxWhatsappNumbers",
] as const;
const STRINGS = [
  "name", "slug", "description", "currency",
  "stripePriceMonthly", "stripePriceAnnual", "razorpayPlanMonthly", "razorpayPlanAnnual",
] as const;
const BOOLEANS = ["isActive", "isPopular"] as const;

/** Allowlisted, type-coerced plan fields. Returns an error string on invalid input. */
export function sanitizePlanInput(body: Record<string, unknown>): { data: Prisma.PlanConfigUpdateInput } | { error: string } {
  const data: Record<string, unknown> = {};
  for (const k of NUMERIC) {
    if (body[k] === undefined) continue;
    const n = Number(body[k]);
    if (!Number.isFinite(n) || n < 0) return { error: `${k} must be a non-negative number` };
    data[k] = k.endsWith("Price") ? n : Math.floor(n);
  }
  for (const k of STRINGS) {
    if (body[k] === undefined) continue;
    const v = body[k] === null ? null : String(body[k]).trim().slice(0, k === "description" ? 1000 : 120);
    data[k] = v === "" && k !== "name" && k !== "slug" ? null : v;
  }
  for (const k of BOOLEANS) if (body[k] !== undefined) data[k] = Boolean(body[k]);
  if (body.features !== undefined) {
    if (!Array.isArray(body.features)) return { error: "features must be a list" };
    data.features = body.features.map((f) => String(f).slice(0, 200)).slice(0, 50);
  }
  if (data.name === "") return { error: "Plan name is required" };
  if (typeof data.slug === "string") {
    data.slug = (data.slug as string).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
    if (!data.slug) return { error: "Invalid slug" };
  }
  return { data: data as Prisma.PlanConfigUpdateInput };
}
