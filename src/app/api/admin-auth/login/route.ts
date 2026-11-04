import crypto from "crypto";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mailer";
import { resolveAdminRole, ROLE_SELECT } from "@/lib/admin-roles";
import {
  OTP_TTL_MS,
  audit,
  clientIpFrom,
  ipIsThrottled,
  registerFailedLogin,
  secretHash,
} from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

// Used to keep response time constant when the email doesn't exist.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= bcrypt.hash(crypto.randomBytes(16).toString("hex"), 12));
const GENERIC_ERROR = "Invalid email or password";

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 2)}${"*".repeat(Math.max(1, local.length - 2))}@${domain}`;
}

function adminOtpEmailHtml(name: string, code: string, ip: string | null) {
  return `
  <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#0f172a;border-radius:16px;padding:36px;color:#e2e8f0">
    <p style="margin:0 0 4px;color:#25D366;font-weight:700;letter-spacing:.08em;font-size:12px">CHATFLOW · SUPER ADMIN</p>
    <h2 style="margin:0 0 16px;color:#fff">Your admin sign-in code</h2>
    <p style="margin:0 0 20px">Hi ${name}, use this code to finish signing in to the admin panel. It expires in 10 minutes.</p>
    <div style="font-size:34px;font-weight:700;letter-spacing:10px;background:#1e293b;border-radius:12px;padding:18px;text-align:center;color:#fff">${code}</div>
    <p style="margin:20px 0 0;font-size:12px;color:#94a3b8">Request from IP: ${ip ?? "unknown"}. If this wasn't you, change your password immediately and contact another super admin.</p>
  </div>`;
}

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

  if (await ipIsThrottled(ip)) {
    await audit(null, "admin.login.blocked", { ip, userAgent, actorEmail: email, metadata: { reason: "ip_throttled" } });
    return NextResponse.json({ error: "Too many failed attempts from your network. Try again in 15 minutes." }, { status: 429 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true, email: true, name: true, passwordHash: true, isActive: true,
      isSuperAdmin: true, adminRole: true, adminRoleId: true, lockedUntil: true,
      adminRoleDef: { select: ROLE_SELECT },
    },
  });

  const meta = { ip, userAgent, actorEmail: email, actorId: user?.id ?? null };

  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    await audit(null, "admin.login.blocked", { ...meta, metadata: { reason: "account_locked" } });
    const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    return NextResponse.json({ error: `Account temporarily locked. Try again in ${mins} minute(s).` }, { status: 423 });
  }

  const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !user.passwordHash || !passwordOk) {
    if (user) await registerFailedLogin(user.id);
    await audit(null, "admin.login.failed", { ...meta, metadata: { reason: user ? "wrong_password" : "unknown_email" } });
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  const role = await resolveAdminRole(user);
  if (!user.isActive || !role) {
    await audit(null, "admin.login.failed", { ...meta, metadata: { reason: !user.isActive ? "inactive" : "not_admin" } });
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  // Issue a fresh one-time code; invalidate older pending challenges.
  const challengeId = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString("base64url");
  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");

  await prisma.adminLoginChallenge.deleteMany({ where: { userId: user.id, usedAt: null } });
  await prisma.adminLoginChallenge.create({
    data: {
      id: challengeId,
      userId: user.id,
      tokenHash: secretHash(token),
      codeHash: secretHash(`${challengeId}:${code}`),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
      ip,
    },
  });

  try {
    await sendMail({
      to: user.email,
      subject: `${code} is your ChatFlow admin sign-in code`,
      html: adminOtpEmailHtml(user.name ?? "there", code, ip),
    });
  } catch (err) {
    console.error("[admin-auth] OTP email failed", err);
    if (process.env.NODE_ENV === "production") {
      await prisma.adminLoginChallenge.deleteMany({ where: { id: challengeId } });
      return NextResponse.json({ error: "Could not send verification email. Try again shortly." }, { status: 503 });
    }
  }
  if (process.env.NODE_ENV !== "production") {
    console.info(`[admin-auth] DEV ONLY – OTP for ${user.email}: ${code}`);
  }

  await audit(null, "admin.otp.sent", { ...meta, metadata: { role: role.name } });

  return NextResponse.json({
    challenge: token,
    email: maskEmail(user.email),
    expiresInSeconds: OTP_TTL_MS / 1000,
  });
}
