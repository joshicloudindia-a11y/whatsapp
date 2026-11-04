import crypto from "crypto";
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import type { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ADMIN_SESSION_MAX_AGE_MS, hasPermission, type AdminRoleInfo, type Permission } from "@/lib/rbac";
import { ROLE_SELECT, resolveAdminRole } from "@/lib/admin-roles";

export interface AdminContext {
  userId: string;
  email: string;
  name: string | null;
  role: AdminRoleInfo;
  ip: string | null;
  userAgent: string | null;
}

export type AdminDenyReason = "unauthenticated" | "not_admin" | "expired" | "revoked" | "inactive";

// ── Login hardening constants ────────────────────────────────────────────────
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;
export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const IP_FAILURE_WINDOW_MS = 15 * 60 * 1000;
export const IP_MAX_FAILURES = 20;

export function clientIpFrom(h: Headers): string | null {
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim() || null;
  return h.get("x-real-ip");
}

/** Keyed hash so DB contents alone can't be used to replay OTPs/tokens. */
export function secretHash(value: string): string {
  const key = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET ?? "";
  return crypto.createHmac("sha256", key).update(value).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/**
 * Resolves the current admin from the session, re-validating against the DB on
 * every call (role changes, suspension and forced logout take effect immediately).
 */
export async function getAdminContext(): Promise<
  { ok: true; ctx: AdminContext } | { ok: false; reason: AdminDenyReason }
> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { ok: false, reason: "unauthenticated" };

  const adminAuthAt = session.user.adminAuthAt;
  if (!adminAuthAt) return { ok: false, reason: "unauthenticated" };
  if (Date.now() - adminAuthAt > ADMIN_SESSION_MAX_AGE_MS) return { ok: false, reason: "expired" };

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true, email: true, name: true, isActive: true, isSuperAdmin: true,
      adminRole: true, adminRoleId: true, lockedUntil: true, sessionsRevokedAt: true,
      adminRoleDef: { select: ROLE_SELECT },
    },
  });
  if (!user) return { ok: false, reason: "unauthenticated" };
  if (!user.isActive) return { ok: false, reason: "inactive" };
  if (user.sessionsRevokedAt && user.sessionsRevokedAt.getTime() >= adminAuthAt) {
    return { ok: false, reason: "revoked" };
  }

  const role = await resolveAdminRole(user);
  if (!role) return { ok: false, reason: "not_admin" };

  const h = await headers();
  return {
    ok: true,
    ctx: {
      userId: user.id,
      email: user.email,
      name: user.name,
      role,
      ip: clientIpFrom(h),
      userAgent: h.get("user-agent"),
    },
  };
}

/** Route-handler guard. Returns either the admin context or a ready 401/403 response. */
export async function requireAdmin(
  permission: Permission
): Promise<{ ctx: AdminContext; response?: undefined } | { ctx?: undefined; response: NextResponse }> {
  const result = await getAdminContext();
  if (!result.ok) {
    return {
      response: NextResponse.json(
        { error: result.reason === "not_admin" ? "Forbidden" : "Admin session required", reason: result.reason },
        { status: result.reason === "not_admin" ? 403 : 401 }
      ),
    };
  }
  if (!hasPermission(result.ctx.role, permission)) {
    await audit(result.ctx, "access.denied", { metadata: { permission } });
    return {
      response: NextResponse.json({ error: `Your role (${result.ctx.role.name}) doesn't have the "${permission}" permission` }, { status: 403 }),
    };
  }
  return { ctx: result.ctx };
}

export async function audit(
  ctx: Pick<AdminContext, "userId" | "email" | "role" | "ip" | "userAgent"> | null,
  action: string,
  opts: {
    entity?: string;
    entityId?: string;
    metadata?: Prisma.InputJsonValue;
    ip?: string | null;
    userAgent?: string | null;
    actorEmail?: string | null;
    actorId?: string | null;
  } = {}
) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: ctx?.userId ?? opts.actorId ?? null,
        actorEmail: ctx?.email ?? opts.actorEmail ?? null,
        actorRole: ctx?.role?.name ?? null,
        action,
        entity: opts.entity,
        entityId: opts.entityId,
        metadata: opts.metadata,
        ip: ctx?.ip ?? opts.ip ?? null,
        userAgent: ctx?.userAgent ?? opts.userAgent ?? null,
      },
    });
  } catch (err) {
    // Never let audit failures break the request, but make them visible.
    console.error("[audit] failed to write", action, err);
  }
}

/** Too many failed admin logins from this IP recently? */
export async function ipIsThrottled(ip: string | null): Promise<boolean> {
  if (!ip) return false;
  const count = await prisma.auditLog.count({
    where: {
      ip,
      action: { in: ["admin.login.failed", "admin.otp.failed"] },
      createdAt: { gte: new Date(Date.now() - IP_FAILURE_WINDOW_MS) },
    },
  });
  return count >= IP_MAX_FAILURES;
}

/** Records a failed password/OTP attempt and locks the account after MAX_FAILED_LOGINS. */
export async function registerFailedLogin(userId: string) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { failedLoginAttempts: { increment: 1 } },
    select: { failedLoginAttempts: true },
  });
  if (user.failedLoginAttempts >= MAX_FAILED_LOGINS) {
    await prisma.user.update({
      where: { id: userId },
      data: { lockedUntil: new Date(Date.now() + LOCKOUT_MS), failedLoginAttempts: 0 },
    });
    return true;
  }
  return false;
}

/** Strips anything not in the allowlist (prevents mass-assignment). */
export function pick<T extends Record<string, unknown>, K extends string>(obj: T, keys: readonly K[]) {
  const out: Partial<Record<K, unknown>> = {};
  for (const k of keys) if (obj && obj[k] !== undefined) out[k] = obj[k];
  return out;
}
