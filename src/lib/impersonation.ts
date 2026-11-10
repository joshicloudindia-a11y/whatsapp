import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { resolveAdminRole, ROLE_SELECT } from "@/lib/admin-roles";
import { ADMIN_SESSION_MAX_AGE_MS } from "@/lib/rbac";

/** "Login as user" sessions end automatically after this long. */
export const IMPERSONATION_MAX_MS = 60 * 60 * 1000;
/** One-time tickets that hand a session from an API call to NextAuth signIn(). */
export const TICKET_TTL_MS = 60 * 1000;
/** Personal admin-staff sign-in links stay valid this long (or until sessions are revoked). */
export const STAFF_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type Kind = "imp" | "ret" | "staff";

function secret(kind: Kind) {
  const s = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
  if (!s) throw new Error("NEXTAUTH_SECRET is not configured");
  return `${s}:chatflow:${kind}`;
}

/** Compact HMAC-signed token: base64url(json).base64url(sig). The signing key differs per kind. */
export function signToken(kind: Kind, data: Record<string, unknown>, ttlMs: number): string {
  const body = Buffer.from(JSON.stringify({ ...data, k: kind, exp: Date.now() + ttlMs, n: crypto.randomBytes(8).toString("hex") })).toString("base64url");
  const sig = crypto.createHmac("sha256", secret(kind)).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyToken<T extends Record<string, unknown>>(kind: Kind, token: unknown): (T & { exp: number }) | null {
  if (typeof token !== "string" || token.length > 2048) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", secret(kind)).update(body).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (data?.k !== kind || typeof data.exp !== "number" || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Re-validates that `adminId` is still an active Super Admin whose OTP-verified admin session
 * (started at `adminAuthAt`) is still valid and not revoked.
 */
export async function activeSuperAdmin(adminId: unknown, adminAuthAt: unknown) {
  if (typeof adminId !== "string" || typeof adminAuthAt !== "number") return null;
  if (Date.now() - adminAuthAt > ADMIN_SESSION_MAX_AGE_MS) return null;
  const admin = await prisma.user.findUnique({
    where: { id: adminId },
    select: {
      id: true, email: true, name: true, avatar: true, isActive: true, isSuperAdmin: true, adminRole: true, adminRoleId: true,
      lockedUntil: true, sessionsRevokedAt: true, adminRoleDef: { select: ROLE_SELECT },
      memberships: { where: { isActive: true }, include: { organization: true }, take: 1 },
    },
  });
  if (!admin || !admin.isActive) return null;
  if (admin.lockedUntil && admin.lockedUntil > new Date()) return null;
  if (admin.sessionsRevokedAt && admin.sessionsRevokedAt.getTime() >= adminAuthAt) return null;
  const role = await resolveAdminRole(admin);
  if (role?.key !== "SUPER_ADMIN") return null;
  return admin;
}

/** Version stamp baked into personal staff links; revoking a user's sessions invalidates old links. */
export const staffLinkVersion = (sessionsRevokedAt: Date | null) => sessionsRevokedAt?.getTime() ?? 0;

/** Resolves a personal admin sign-in link to the staff member it belongs to (for the personalised login screen). */
export async function resolveStaffLink(k: unknown) {
  const t = verifyToken<{ u: string; v: number }>("staff", k);
  if (!t) return null;
  const user = await prisma.user.findUnique({
    where: { id: t.u },
    select: { id: true, email: true, name: true, isActive: true, isSuperAdmin: true, adminRole: true, adminRoleId: true, sessionsRevokedAt: true, adminRoleDef: { select: ROLE_SELECT } },
  });
  if (!user || !user.isActive || staffLinkVersion(user.sessionsRevokedAt) !== t.v) return null;
  const role = await resolveAdminRole(user);
  if (!role) return null;
  return { user, role };
}

