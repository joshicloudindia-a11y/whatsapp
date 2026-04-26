import { NextRequest } from "next/server";
import { getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import Stripe from "stripe";

const PLAN_MAP: Record<string, string> = {
  growth: "GROWTH",
  pro: "PRO",
  business: "BUSINESS",
  trial: "TRIAL",
};

function toPlan(slug: string): "TRIAL" | "GROWTH" | "PRO" | "BUSINESS" {
  return (PLAN_MAP[slug.toLowerCase()] ?? "GROWTH") as any;
}

function toStatus(s: string): "ACTIVE" | "PAST_DUE" | "CANCELED" | "UNPAID" | "TRIALING" {
  const map: Record<string, any> = {
    active: "ACTIVE",
    trialing: "TRIALING",
    past_due: "PAST_DUE",
    canceled: "CANCELED",
    unpaid: "UNPAID",
  };
  return map[s] ?? "ACTIVE";
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) return new Response("Missing signature", { status: 400 });

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    console.error("Stripe webhook signature error:", err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const cs = event.data.object as Stripe.Checkout.Session;
        const orgId = cs.metadata?.organizationId;
        const planSlug = cs.metadata?.planSlug ?? "growth";
        if (!orgId) break;

        const plan = toPlan(planSlug);
        await prisma.$transaction([
          prisma.subscription.update({
            where: { organizationId: orgId },
            data: {
              stripeCustomerId: cs.customer as string,
              stripeSubscriptionId: cs.subscription as string,
              plan,
              status: "ACTIVE",
              currentPeriodStart: new Date(),
            },
          }),
          prisma.organization.update({
            where: { id: orgId },
            data: { plan },
          }),
        ]);
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const orgId = sub.metadata?.organizationId;
        if (!orgId) break;

        const planSlug = sub.metadata?.planSlug ?? "growth";
        const plan = toPlan(planSlug);
        const status = toStatus(sub.status);

        await prisma.$transaction([
          prisma.subscription.update({
            where: { organizationId: orgId },
            data: {
              status,
              plan,
              currentPeriodStart: new Date((sub as any).current_period_start * 1000),
              currentPeriodEnd: new Date((sub as any).current_period_end * 1000),
              cancelAtPeriodEnd: (sub as any).cancel_at_period_end ?? false,
            },
          }),
          prisma.organization.update({ where: { id: orgId }, data: { plan } }),
        ]);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const orgId = sub.metadata?.organizationId;
        if (!orgId) break;

        await prisma.$transaction([
          prisma.subscription.update({
            where: { organizationId: orgId },
            data: { status: "CANCELED", plan: "TRIAL" },
          }),
          prisma.organization.update({ where: { id: orgId }, data: { plan: "TRIAL" } }),
        ]);
        break;
      }

      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;
        const customerId = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
        if (!customerId) break;

        await prisma.subscription.updateMany({
          where: { stripeCustomerId: customerId },
          data: { status: "PAST_DUE" },
        });
        break;
      }
    }
  } catch (err) {
    console.error("Webhook processing error:", err);
    return new Response("Internal error", { status: 500 });
  }

  return new Response("OK", { status: 200 });
}
