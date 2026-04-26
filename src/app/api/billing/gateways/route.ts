import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    stripe: !!process.env.STRIPE_SECRET_KEY,
    razorpay: !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
  });
}
