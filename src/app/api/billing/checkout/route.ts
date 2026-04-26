import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { z } from "zod";

const schema = z.object({
  planSlug: z.string(),
  interval: z.enum(["monthly", "annual"]),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = session.user.organizationId;
  if (!orgId) return NextResponse.json({ error: "No organization" }, { status: 400 });

  const body = schema.parse(await req.json());

  const plan = await prisma.planConfig.findUnique({ where: { slug: body.planSlug } });
  if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

  const price = body.interval === "annual" ? plan.annualPrice : plan.monthlyPrice;
  if (!price || price <= 0) {
    return NextResponse.json({ error: "Invalid plan price" }, { status: 400 });
  }

  const stripe = getStripe();

  // Get or create Stripe customer
  const sub = await prisma.subscription.findUnique({ where: { organizationId: orgId } });
  let customerId = sub?.stripeCustomerId ?? null;

  if (!customerId) {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      include: { members: { where: { role: "ADMIN" }, include: { user: true }, take: 1 } },
    });
    const adminEmail = org?.members[0]?.user?.email ?? session.user.email ?? "";
    const customer = await stripe.customers.create({
      email: adminEmail,
      name: org?.name,
      metadata: { organizationId: orgId },
    });
    customerId = customer.id;
    if (sub) {
      await prisma.subscription.update({
        where: { organizationId: orgId },
        data: { stripeCustomerId: customerId },
      });
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // Use price_data — no pre-created Price IDs needed in Stripe Dashboard
  const checkoutSession = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [
      {
        price_data: {
          currency: plan.currency.toLowerCase(),
          product_data: {
            name: plan.name,
            description: plan.description ?? undefined,
          },
          unit_amount: Math.round(price * 100),
          recurring: {
            interval: body.interval === "annual" ? "year" : "month",
          },
        },
        quantity: 1,
      },
    ],
    success_url: `${appUrl}/dashboard?payment=success`,
    cancel_url: `${appUrl}/dashboard`,
    metadata: { organizationId: orgId, planSlug: body.planSlug },
    subscription_data: {
      metadata: { organizationId: orgId, planSlug: body.planSlug },
    },
  });

  return NextResponse.json({ url: checkoutSession.url });
}
