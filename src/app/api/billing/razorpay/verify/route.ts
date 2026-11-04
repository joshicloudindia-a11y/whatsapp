import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { planTierFromSlug } from "@/lib/plans";
import { verifyRazorpaySignature } from "@/lib/razorpay";
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

  return NextResponse.json({ success: true });
}
