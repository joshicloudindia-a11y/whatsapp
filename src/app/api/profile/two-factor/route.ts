import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CHALLENGE_PURPOSE, audit, clientIpFrom, registerFailedLogin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/**
 * Turns email two-step verification on/off for the signed-in user. Requires the current password.
 * Lives under /api/profile so the proxy blocks it during Super Admin "Login as user".
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.impersonator) {
    return NextResponse.json({ error: "Security settings can't be changed while a Super Admin is signed in as this user" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) ?? {};
  if (typeof body.enabled !== "boolean") return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const enabled: boolean = body.enabled;
  const password = String(body.password ?? "");
  if (!password || password.length > 200) return NextResponse.json({ error: "Enter your current password" }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, passwordHash: true, isActive: true, lockedUntil: true, twoFactorEnabled: true },
  });
  if (!user || !user.isActive) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.passwordHash) return NextResponse.json({ error: "Set a password on your account first" }, { status: 400 });
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return NextResponse.json({ error: "Too many failed attempts. Try again in a few minutes." }, { status: 423 });
  }

  const meta = { ip: clientIpFrom(req.headers), userAgent: req.headers.get("user-agent"), actorId: user.id, actorEmail: user.email };

  if (!(await bcrypt.compare(password, user.passwordHash))) {
    await registerFailedLogin(user.id);
    await audit(null, "user.2fa.change_failed", { ...meta, metadata: { reason: "wrong_password" } });
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
  }

  if (user.twoFactorEnabled !== enabled) {
    await prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: enabled, failedLoginAttempts: 0 } });
    if (!enabled) {
      // Drop any pending sign-in codes so they can't be used after turning it off.
      await prisma.adminLoginChallenge.deleteMany({ where: { userId: user.id, usedAt: null, purpose: CHALLENGE_PURPOSE.USER_2FA } });
    }
    await audit(null, enabled ? "user.2fa.enabled" : "user.2fa.disabled", meta);
  }

  return NextResponse.json({ twoFactorEnabled: enabled });
}
