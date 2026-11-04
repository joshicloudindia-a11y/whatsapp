import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { resolvePlanConfig } from "@/lib/plans";

export async function GET() {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  const organizationId = member.organizationId;

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      plan: true,
      trialEndsAt: true,
      subscription: {
        select: {
          plan: true, status: true, currentPeriodStart: true, currentPeriodEnd: true, cancelAtPeriodEnd: true,
          stripeSubscriptionId: true, apiCallsUsed: true, aiCreditsUsed: true, automationTriggersUsed: true,
        },
      },
    },
  });
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const tier = org.subscription?.plan ?? org.plan;
  const sub = org.subscription;
  // Usage window: current billing period, else the calendar month.
  const now = new Date();
  const periodStart = sub?.currentPeriodStart ?? new Date(now.getFullYear(), now.getMonth(), 1);

  const [planConfig, members, numbers, automations, broadcastRecipients] = await Promise.all([
    resolvePlanConfig(tier),
    prisma.organizationMember.count({ where: { organizationId, isActive: true } }),
    prisma.whatsappAccount.count({ where: { organizationId } }),
    prisma.automation.count({ where: { organizationId } }),
    prisma.broadcast.aggregate({ where: { organizationId, createdAt: { gte: periodStart } }, _sum: { sentCount: true } }),
  ]);

  const limits = planConfig
    ? {
        users: planConfig.maxUsers, whatsappNumbers: planConfig.maxWhatsappNumbers, broadcasts: planConfig.maxBroadcasts,
        automations: planConfig.maxAutomations, apiCalls: planConfig.maxApiCalls, aiCredits: planConfig.maxAiCredits,
      }
    : { users: 3, whatsappNumbers: 1, broadcasts: 500, automations: 100, apiCalls: 1000, aiCredits: 50 };

  const usage = [
    { key: "users", label: "Team members", used: members, limit: limits.users, icon: "group" },
    { key: "whatsappNumbers", label: "WhatsApp numbers", used: numbers, limit: limits.whatsappNumbers, icon: "smartphone" },
    { key: "broadcasts", label: "Broadcast messages this period", used: broadcastRecipients._sum.sentCount ?? 0, limit: limits.broadcasts, icon: "campaign" },
    { key: "automations", label: "Automations", used: automations, limit: limits.automations, icon: "bolt" },
    { key: "apiCalls", label: "API calls this period", used: sub?.apiCallsUsed ?? 0, limit: limits.apiCalls, icon: "code" },
    { key: "aiCredits", label: "AI credits this period", used: sub?.aiCreditsUsed ?? 0, limit: limits.aiCredits, icon: "smart_toy" },
  ];

  const trialDaysLeft = org.trialEndsAt ? Math.max(0, Math.ceil((org.trialEndsAt.getTime() - Date.now()) / 86400000)) : null;

  return NextResponse.json({
    plan: tier,
    status: sub?.status ?? "ACTIVE",
    planConfig: planConfig && {
      id: planConfig.id, name: planConfig.name, slug: planConfig.slug, monthlyPrice: planConfig.monthlyPrice,
      annualPrice: planConfig.annualPrice, currency: planConfig.currency, features: planConfig.features,
    },
    trialEndsAt: org.trialEndsAt,
    trialDaysLeft,
    currentPeriodStart: sub?.currentPeriodStart ?? null,
    currentPeriodEnd: sub?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
    paymentProvider: sub?.stripeSubscriptionId ? (sub.stripeSubscriptionId.startsWith("rzp_") ? "Razorpay" : "Stripe") : null,
    usagePeriodStart: periodStart,
    usage,
    gateways: {
      stripe: !!process.env.STRIPE_SECRET_KEY,
      razorpay: !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
    },
    canManageBilling: member.role === "ADMIN" || member.role === "BILLING_MANAGER",
  });
}
