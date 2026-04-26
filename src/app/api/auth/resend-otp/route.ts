import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendMail, otpEmailHtml } from "@/lib/mailer";
import { z } from "zod";

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(req: NextRequest) {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(await req.json());

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

    if (!user) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    if (user.emailVerified) {
      return NextResponse.json({ error: "Email already verified" }, { status: 400 });
    }

    const otp = generateOtp();

    await prisma.$transaction([
      prisma.verificationToken.deleteMany({ where: { userId: user.id } }),
      prisma.verificationToken.create({
        data: {
          userId: user.id,
          token: otp,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        },
      }),
    ]);

    await sendMail({
      to: email,
      subject: "Your new ChatFlow verification code",
      html: otpEmailHtml(user.name ?? "there", otp),
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Resend OTP error:", error);
    return NextResponse.json({ error: "Failed to resend code" }, { status: 500 });
  }
}
