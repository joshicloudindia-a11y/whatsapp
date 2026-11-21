import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { planTierFromSlug } from "@/lib/plans";
import { getRazorpay, verifyRazorpaySignature } from "@/lib/razorpay";
import { recordPaymentSafe } from "@/lib/payments";
import { z } from "zod";

const schema = z.object({
  razorpay_order_id: z.string(),
  razorpay_payment_id: z.string(),
  razorpay_signature: z.string(),
  planSlug: z.string(),
  interval: z.enum(["monthly", "annual"]),
});


export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = session.user.organizationId;
  if (!orgId) return NextResponse.json({ error: "No organization" }, { status: 400 });

  const body = schema.parse(await req.json());

  // Verify Razorpay signature
  const valid = verifyRazorpaySignature(
    body.razorpay_order_id,
    body.razorpay_payment_id,
    body.razorpay_signature
  );

  if (!valid) {
    return NextResponse.json({ error: "Payment verification failed. Please contact support." }, { status: 400 });
  }

  const plan = planTierFromSlug(body.planSlug);
  const paid = {
    plan,
    status: "ACTIVE" as const,
    stripeSubscriptionId: `rzp_${body.razorpay_payment_id}`, // mark as paid (non-null)
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + (body.interval === "annual" ? 365 : 30) * 24 * 60 * 60 * 1000),
  };

  await prisma.$transaction([
    prisma.subscription.upsert({
      where: { organizationId: orgId },
      update: paid,
      create: { organizationId: orgId, ...paid },
    }),
    prisma.organization.update({
      where: { id: orgId },
      data: { plan },
    }),
  ]);

  await recordRazorpayPayment(orgId, body);

  return NextResponse.json({ success: true });
}

/** Stores the confirmed payment for payment history / invoices. Never throws. */
async function recordRazorpayPayment(orgId: string, body: z.infer<typeof schema>) {
  try {
    const planConfig = await prisma.planConfig.findUnique({
      where: { slug: body.planSlug },
      select: { name: true, monthlyPrice: true, annualPrice: true, currency: true },
    });

    // Prefer the amounts Razorpay actually charged; fall back to the plan price used to create the order.
    let amount: number | null = null;
    let currency: string | null = null;
    let status = "captured";
    let paidAt: Date | undefined;
    try {
      const p = await getRazorpay().payments.fetch(body.razorpay_payment_id);
      amount = Number(p.amount);
      currency = p.currency;
      if (p.status) status = p.status;
      if (p.created_at) paidAt = new Date(Number(p.created_at) * 1000);
    } catch (err) {
      console.error("[payments] Razorpay payment fetch failed, using plan price:", err);
    }
    if (amount === null || !Number.isFinite(amount)) {
      const price = planConfig ? (body.interval === "annual" ? planConfig.annualPrice : planConfig.monthlyPrice) : 0;
      amount = Math.round(price * 100);
      currency = planConfig?.currency === "USD" ? "USD" : "INR";
    }

    const planName = planConfig?.name ?? body.planSlug;
    await recordPaymentSafe({
      organizationId: orgId,
      provider: "razorpay",
      providerPaymentId: body.razorpay_payment_id,
      providerOrderId: body.razorpay_order_id,
      amount,
      currency: currency ?? "INR",
      status,
      plan: planName,
      interval: body.interval,
      description: `${planName} plan, ${body.interval === "annual" ? "annual" : "monthly"} subscription`,
      paidAt,
    });
  } catch (err) {
    console.error("[payments] Razorpay payment recording failed:", err);
  }
}
