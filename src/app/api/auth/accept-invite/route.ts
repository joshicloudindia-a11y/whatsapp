import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validatePassword } from "@/lib/admin-users";

async function findInvite(token: string | null) {
  if (!token || token.length < 20) return null;
  const inv = await prisma.invitation.findUnique({ where: { token } });
  if (!inv) return null;
  const org = await prisma.organization.findUnique({ where: { id: inv.organizationId }, select: { id: true, name: true } });
  return org ? { inv, org } : null;
}

/** GET ?token= → invitation details for the accept page. */
export async function GET(req: NextRequest) {
  const found = await findInvite(req.nextUrl.searchParams.get("token"));
  if (!found) return NextResponse.json({ error: "This invitation link is invalid." }, { status: 404 });
  const { inv, org } = found;
  if (inv.acceptedAt) return NextResponse.json({ error: "This invitation has already been accepted. Please sign in." , status: "accepted" }, { status: 410 });
  if (inv.expiresAt < new Date()) return NextResponse.json({ error: "This invitation has expired. Ask your admin to resend it.", status: "expired" }, { status: 410 });

  const [existing, session] = await Promise.all([
    prisma.user.findUnique({ where: { email: inv.email }, select: { id: true } }),
    getServerSession(authOptions),
  ]);
  return NextResponse.json({
    organization: org.name,
    email: inv.email,
    role: inv.role,
    expiresAt: inv.expiresAt,
    accountExists: !!existing,
    signedInAs: session?.user?.email ?? null,
  });
}

/** POST { token, name?, password? } → joins the organization. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) ?? {};
  const found = await findInvite(String(body.token ?? ""));
  if (!found) return NextResponse.json({ error: "This invitation link is invalid." }, { status: 404 });
  const { inv, org } = found;
  if (inv.acceptedAt) return NextResponse.json({ error: "This invitation has already been used." }, { status: 410 });
  if (inv.expiresAt < new Date()) return NextResponse.json({ error: "This invitation has expired." }, { status: 410 });

  let user = await prisma.user.findUnique({ where: { email: inv.email }, select: { id: true } });

  if (user) {
    // Existing account: must be signed in as the invited email.
    const session = await getServerSession(authOptions);
    if (session?.user?.email?.toLowerCase() !== inv.email) {
      return NextResponse.json({ error: `Sign in as ${inv.email} to accept this invitation.`, needsLogin: true }, { status: 401 });
    }
  } else {
    const name = String(body.name ?? "").trim().slice(0, 100);
    if (name.length < 2) return NextResponse.json({ error: "Enter your full name" }, { status: 400 });
    const pwError = validatePassword(body.password);
    if (pwError) return NextResponse.json({ error: pwError }, { status: 400 });
    user = await prisma.user.create({
      // The invite email proves ownership of the address.
      data: { email: inv.email, name, passwordHash: await bcrypt.hash(String(body.password), 12), emailVerified: new Date() },
      select: { id: true },
    });
  }

  await prisma.$transaction([
    prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
      update: { isActive: true, role: inv.role, joinedAt: new Date() },
      create: { organizationId: org.id, userId: user.id, role: inv.role, joinedAt: new Date() },
    }),
    prisma.invitation.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } }),
  ]);

  return NextResponse.json({ success: true, organization: org.name, email: inv.email });
}
