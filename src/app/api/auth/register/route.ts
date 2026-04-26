import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { sendMail, verificationEmailHtml } from "@/lib/mailer";
import { generateToken, slugify } from "@/lib/utils";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  orgName: z.string().min(2),
});

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
    const verifyToken = generateToken(48);

    const user = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        passwordHash,
        verificationTokens: {
          create: {
            token: verifyToken,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
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

    const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL}/verify-email?token=${verifyToken}`;
    await sendMail({
      to: email,
      subject: "Verify your ChatFlow email",
      html: verificationEmailHtml(name, verifyUrl),
    });

    return NextResponse.json({ success: true, message: "Account created. Check your email to verify." });
  } catch (error: any) {
    if (error.name === "ZodError") {
      return NextResponse.json({ error: "Invalid input", details: error.errors }, { status: 422 });
    }
    console.error("Register error:", error);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
