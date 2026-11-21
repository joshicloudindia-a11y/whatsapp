import crypto from "crypto";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mailer";
import {
  CHALLENGE_PURPOSE,
  OTP_TTL_MS,
  USER_FAILURE_ACTIONS,
  audit,
  clientIpFrom,
  getDummyHash,
  ipIsThrottled,
  maskEmail,
  registerFailedLogin,
  secretHash,
} from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const GENERIC_ERROR = "Invalid email or password";

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function userOtpEmailHtml(name: string, code: string, ip: string | null) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e2e8f0;padding:40px;">
      <div style="text-align:center;margin-bottom:24px;">
        <div style="display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;background:#25D366;border-radius:12px;margin-bottom:12px;">
          <span style="color:#fff;font-size:22px;">&#128274;</span>
        </div>
        <h2 style="color:#0f172a;margin:0;font-size:20px;">Your sign-in code</h2>
      </div>
      <p style="color:#475569;margin:0 0 8px;">Hi ${escapeHtml(name)},</p>
      <p style="color:#475569;margin:0 0 24px;">Two-step verification is on for your ChatFlow account. Enter this code to finish signing in:</p>
      <div style="text-align:center;margin:0 0 28px;">
        <span style="display:inline-block;font-size:36px;font-weight:800;letter-spacing:10px;color:#0f172a;background:#f1f5f9;padding:16px 28px;border-radius:10px;">${code}</span>
      </div>
      <p style="color:#94a3b8;font-size:13px;text-align:center;margin:0 0 8px;">This code expires in <strong>10 minutes</strong> and can be used once.</p>
      <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0;">Request from IP: ${escapeHtml(ip ?? "unknown")}. If this wasn't you, someone knows your password &mdash; change it right away in Settings &rarr; My profile.</p>
    </div>
  `;
}

/**
 * Step 1 of app sign-in. Checks the password exactly like the "credentials" provider.
 * - two-step verification off → { twoFactor: false } (client continues with signIn("credentials")).
 * - on → emails a 6-digit code and returns a challenge for signIn("user-otp").
 */
export async function POST(req: NextRequest) {
  const ip = clientIpFrom(req.headers);
  const userAgent = req.headers.get("user-agent");

  let email = "";
  let password = "";
  try {
    const body = await req.json();
    email = String(body?.email ?? "").toLowerCase().trim();
    password = String(body?.password ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!email || !password || email.length > 254 || password.length > 200) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }

  if (await ipIsThrottled(ip, USER_FAILURE_ACTIONS)) {
    return NextResponse.json({ error: "Too many failed attempts from your network. Try again in 15 minutes." }, { status: 429 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, passwordHash: true, isActive: true, lockedUntil: true, twoFactorEnabled: true },
  });
  const meta = { ip, userAgent, actorEmail: email, actorId: user?.id ?? null };

  // Always run bcrypt (dummy hash for unknown emails) so timing doesn't reveal which accounts exist.
  const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? (await getDummyHash()));

  // Same outcome as the "credentials" provider: a locked account can't sign in, whatever the password,
  // and the generic error doesn't confirm the account exists.
  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    await audit(null, "user.login.blocked", { ...meta, metadata: { reason: "account_locked" } });
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  if (!user || !user.passwordHash || !passwordOk) {
    if (user?.passwordHash) await registerFailedLogin(user.id);
    await audit(null, "user.login.failed", { ...meta, metadata: { reason: user ? "wrong_password" : "unknown_email" } });
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }
  if (!user.isActive) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  if (!user.twoFactorEnabled) return NextResponse.json({ twoFactor: false });

  // Issue a fresh one-time code; invalidate this user's older pending app sign-in challenges.
  const challengeId = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString("base64url");
  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");

  await prisma.adminLoginChallenge.deleteMany({ where: { userId: user.id, usedAt: null, purpose: CHALLENGE_PURPOSE.USER_2FA } });
  await prisma.adminLoginChallenge.create({
    data: {
      id: challengeId,
      userId: user.id,
      purpose: CHALLENGE_PURPOSE.USER_2FA,
      tokenHash: secretHash(token),
      codeHash: secretHash(`${challengeId}:${code}`),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
      ip,
    },
  });

  try {
    await sendMail({
      to: user.email,
      subject: `${code} is your ChatFlow sign-in code`,
      html: userOtpEmailHtml(user.name ?? "there", code, ip),
    });
  } catch (err) {
    console.error("[auth-2fa] OTP email failed", err);
    if (process.env.NODE_ENV === "production") {
      await prisma.adminLoginChallenge.deleteMany({ where: { id: challengeId } });
      return NextResponse.json({ error: "Could not send the verification email. Try again shortly." }, { status: 503 });
    }
  }
  if (process.env.NODE_ENV !== "production") {
    console.info(`[auth-2fa] DEV ONLY – sign-in code for ${user.email}: ${code}`);
  }

  await audit(null, "user.otp.sent", meta);

  return NextResponse.json({
    twoFactor: true,
    challenge: token,
    email: maskEmail(user.email),
    expiresInSeconds: OTP_TTL_MS / 1000,
  });
}
