import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validatePassword } from "@/lib/admin-users";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true, name: true, email: true, avatar: true, emailVerified: true, createdAt: true, lastLoginAt: true,
      passwordHash: true,
      memberships: {
        where: { isActive: true },
        select: { role: true, joinedAt: true, createdAt: true, organization: { select: { id: true, name: true, slug: true, plan: true } } },
      },
    },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { passwordHash, ...rest } = user;
  return NextResponse.json({ user: { ...rest, hasPassword: !!passwordHash } });
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) ?? {};
  const data: { name?: string; passwordHash?: string } = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim().replace(/\s+/g, " ").slice(0, 100);
    if (name.length < 2) return NextResponse.json({ error: "Name must be at least 2 characters" }, { status: 400 });
    data.name = name;
  }

  if (body.newPassword !== undefined) {
    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { passwordHash: true } });
    if (!user?.passwordHash) return NextResponse.json({ error: "No password set on this account" }, { status: 400 });
    if (!body.currentPassword || !(await bcrypt.compare(String(body.currentPassword), user.passwordHash))) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
    }
    const pwError = validatePassword(body.newPassword);
    if (pwError) return NextResponse.json({ error: pwError }, { status: 400 });
    if (await bcrypt.compare(String(body.newPassword), user.passwordHash)) {
      return NextResponse.json({ error: "New password must be different from the current one" }, { status: 400 });
    }
    data.passwordHash = await bcrypt.hash(String(body.newPassword), 12);
  }

  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data,
    select: { id: true, name: true, email: true, avatar: true },
  });
  return NextResponse.json({ user, passwordChanged: !!data.passwordHash });
}
