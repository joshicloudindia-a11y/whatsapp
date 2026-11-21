import { NextRequest } from "next/server";
import { getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { planTierFromSlug } from "@/lib/plans";
import { recordPaymentSafe } from "@/lib/payments";
import Stripe from "stripe";


function toPlan(slug: string) {
  return planTierFromSlug(slug);
}

function toStatus(s: string): "ACTIVE" | "PAST_DUE" | "CANCELED" | "UNPAID" | "TRIALING" {
  const map: Record<string, ReturnType<typeof toStatus>> = {
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

  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return new Response("Stripe is not configured", { status: 503 });
  }
  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Stripe webhook signature error:", message);
    return new Response(`Webhook Error: ${message}`, { status: 400 });
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

        if (cs.payment_status === "paid" && cs.amount_total) {
          const ref = (v: string | { id: string } | null) => (typeof v === "string" ? v : v?.id ?? null);
          // Key by the invoice id when there is one so invoice.paid for the same charge dedupes onto this row.
          await recordStripePayment({
            orgId,
            providerPaymentId: ref(cs.invoice) ?? ref(cs.payment_intent) ?? cs.id,
            providerOrderId: cs.id,
            amount: cs.amount_total,
            currency: cs.currency ?? "usd",
            planSlug,
            interval: cs.metadata?.interval ?? null,
          });
        }
        break;
      }

      case "invoice.paid": {
        const inv = event.data.object as Stripe.Invoice;
        if (!inv.id || !inv.amount_paid) break;
        const meta = inv.parent?.subscription_details?.metadata ?? {};
        let orgId: string | null = meta.organizationId ?? null;
        if (!orgId) {
          const customerId = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
          if (customerId) {
            const sub = await prisma.subscription.findFirst({ where: { stripeCustomerId: customerId }, select: { organizationId: true } });
            orgId = sub?.organizationId ?? null;
          }
        }
        if (!orgId) break;
        const paidAtSec = inv.status_transitions?.paid_at;
        await recordStripePayment({
          orgId,
          providerPaymentId: inv.id,
          providerOrderId: null,
          amount: inv.amount_paid,
          currency: inv.currency,
          planSlug: meta.planSlug ?? null,
          interval: meta.interval ?? null,
          paidAt: paidAtSec ? new Date(paidAtSec * 1000) : undefined,
        });
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const orgId = sub.metadata?.organizationId;
        if (!orgId) break;

        const planSlug = sub.metadata?.planSlug ?? "growth";
        const plan = toPlan(planSlug);
        const status = toStatus(sub.status);
        // These top-level period fields are not in the current Stripe typings (behaviour unchanged).
        const legacy = sub as unknown as { current_period_start?: number; current_period_end?: number; cancel_at_period_end?: boolean };

        await prisma.$transaction([
          prisma.subscription.update({
            where: { organizationId: orgId },
            data: {
              status,
              plan,
              currentPeriodStart: new Date(legacy.current_period_start! * 1000),
              currentPeriodEnd: new Date(legacy.current_period_end! * 1000),
              cancelAtPeriodEnd: legacy.cancel_at_period_end ?? false,
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

/** Stores a confirmed Stripe payment for payment history / invoices. Never throws. */
async function recordStripePayment(p: {
  orgId: string; providerPaymentId: string; providerOrderId: string | null; amount: number; currency: string;
  planSlug: string | null; interval: string | null; paidAt?: Date;
}) {
  try {
    const planConfig = p.planSlug
      ? await prisma.planConfig.findUnique({ where: { slug: p.planSlug }, select: { name: true } })
      : null;
    const planName = planConfig?.name ?? p.planSlug ?? null;
    const interval = p.interval === "annual" || p.interval === "monthly" ? p.interval : null;
    await recordPaymentSafe({
      organizationId: p.orgId,
      provider: "stripe",
      providerPaymentId: p.providerPaymentId,
      providerOrderId: p.providerOrderId,
      amount: p.amount,
      currency: p.currency,
      status: "paid",
      plan: planName,
      interval,
      description: planName ? `${planName} plan${interval ? `, ${interval} subscription` : " subscription"}` : "ChatFlow subscription",
      paidAt: p.paidAt,
    });
  } catch (err) {
    console.error("[payments] Stripe payment recording failed:", err);
  }
}
