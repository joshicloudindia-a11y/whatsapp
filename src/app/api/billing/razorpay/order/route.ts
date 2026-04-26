import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRazorpay } from "@/lib/razorpay";
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

  // Use INR price (Razorpay works best in INR); fall back to plan price
  const price = body.interval === "annual" ? plan.annualPrice : plan.monthlyPrice;
  if (!price || price <= 0) {
    return NextResponse.json({ error: "Invalid plan price" }, { status: 400 });
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { name: true },
  });

  const razorpay = getRazorpay();

  // Amount in paise (smallest unit). If currency is INR, price is in ₹.
  const currency = plan.currency === "USD" ? "USD" : "INR";
  const amount = Math.round(price * 100); // paise for INR, cents for USD

  const order = await razorpay.orders.create({
    amount,
    currency,
    receipt: `rcpt_${orgId.slice(0, 16)}_${Date.now()}`,
    notes: {
      organizationId: orgId,
      planSlug: body.planSlug,
      interval: body.interval,
    },
  });

  return NextResponse.json({
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId: process.env.RAZORPAY_KEY_ID,
    orgName: org?.name ?? "ChatFlow",
    planName: plan.name,
  });
}
