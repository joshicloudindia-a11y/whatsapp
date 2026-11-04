import type { Plan, PlanConfig } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Maps an admin-defined plan slug (e.g. "standard-pro-plan") to the coarse Plan tier.
 * Keyword based so renamed plans keep working; defaults to GROWTH.
 */
export function planTierFromSlug(slug: string): Exclude<Plan, "TRIAL"> {
  const s = slug.toLowerCase();
  if (/(enterprise|business|scale|premium)/.test(s)) return "BUSINESS";
  if (/(pro|standard|advanced)/.test(s)) return "PRO";
  return "GROWTH";
}

/** The active PlanConfig that corresponds to an organization's tier (null on trial). */
export async function resolvePlanConfig(tier: Plan): Promise<PlanConfig | null> {
  if (tier === "TRIAL") return null;
  const plans = await prisma.planConfig.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { monthlyPrice: "asc" }] });
  return plans.find((p) => planTierFromSlug(p.slug) === tier) ?? null;
}
