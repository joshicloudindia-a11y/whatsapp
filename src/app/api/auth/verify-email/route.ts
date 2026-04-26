import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
});

export async function POST(req: NextRequest) {
  try {
    const { email, otp } = schema.parse(await req.json());

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { verificationTokens: true },
    });

    if (!user) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    if (user.emailVerified) {
      return NextResponse.json({ success: true, alreadyVerified: true });
    }

    const tokenRecord = user.verificationTokens.find((t) => t.token === otp);

    if (!tokenRecord) {
      return NextResponse.json({ error: "Invalid code. Please check and try again." }, { status: 400 });
    }

    if (tokenRecord.expiresAt < new Date()) {
      return NextResponse.json({ error: "Code expired. Please request a new one." }, { status: 400 });
    }

    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } }),
      prisma.verificationToken.deleteMany({ where: { userId: user.id } }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.name === "ZodError") {
      return NextResponse.json({ error: "Invalid request" }, { status: 422 });
    }
    console.error("Verify OTP error:", error);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
