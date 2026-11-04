import { prisma } from "@/lib/prisma";
import { resolvePlanConfig } from "@/lib/plans";

export const ORG_ROLES = ["ADMIN", "AGENT", "CAMPAIGN_MANAGER", "TEMPLATE_MANAGER", "AUTOMATION_MANAGER", "BILLING_MANAGER"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];
const TRIAL_SEATS = 3;

/** Seats used (active members + pending invites) vs the plan's user limit. */
export async function seatUsage(organizationId: string) {
  const [org, members, pending] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId }, select: { plan: true } }),
    prisma.organizationMember.count({ where: { organizationId, isActive: true } }),
    prisma.invitation.count({ where: { organizationId, acceptedAt: null, expiresAt: { gt: new Date() } } }),
  ]);
  const plan = org ? await resolvePlanConfig(org.plan) : null;
  const limit = plan?.maxUsers ?? TRIAL_SEATS;
  return { members, pending, used: members + pending, limit, planName: plan?.name ?? "Free trial" };
}
