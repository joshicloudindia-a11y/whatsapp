import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendMail, invitationEmailHtml } from "@/lib/mailer";
import { generateToken } from "@/lib/utils";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { email, role } = await req.json();

  const org = await prisma.organization.findUnique({ where: { id: session.user.organizationId } });
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

  const token = generateToken(48);
  await prisma.invitation.create({
    data: {
      organizationId: session.user.organizationId,
      email: email.toLowerCase(),
      role,
      token,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/accept-invite?token=${token}`;
  await sendMail({
    to: email,
    subject: `You're invited to join ${org.name} on ChatFlow`,
    html: invitationEmailHtml(org.name, session.user.name ?? "Your team", inviteUrl),
  });

  return NextResponse.json({ success: true });
}
