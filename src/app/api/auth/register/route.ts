import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { sendMail, otpEmailHtml } from "@/lib/mailer";
import { slugify, generateToken } from "@/lib/utils";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  orgName: z.string().min(2),
});

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, password, orgName } = schema.parse(body);

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      return NextResponse.json({ error: "Email already registered" }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const slug = slugify(orgName) + "-" + generateToken(4).toLowerCase();
    const otp = generateOtp();

    await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        passwordHash,
        verificationTokens: {
          create: {
            token: otp,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
          },
        },
        memberships: {
          create: {
            role: "ADMIN",
            joinedAt: new Date(),
            organization: {
              create: {
                name: orgName,
                slug,
                plan: "TRIAL",
                trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                subscription: {
                  create: {
                    plan: "TRIAL",
                    status: "TRIALING",
                  },
                },
              },
            },
          },
        },
      },
    });

    await sendMail({
      to: email,
      subject: "Your ChatFlow verification code",
      html: otpEmailHtml(name, otp),
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.name === "ZodError") {
      return NextResponse.json({ error: "Invalid input", details: error.errors }, { status: 422 });
    }
    console.error("Register error:", error);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
