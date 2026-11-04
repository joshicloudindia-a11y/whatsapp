import type { Prisma } from "@prisma/client";

export const MEMBER_ROLES = ["ADMIN", "AGENT", "CAMPAIGN_MANAGER", "TEMPLATE_MANAGER", "AUTOMATION_MANAGER", "BILLING_MANAGER"] as const;
export type MemberRoleName = (typeof MEMBER_ROLES)[number];
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  isActive: true,
  isSuperAdmin: true,
  adminRole: true,
  adminRoleId: true,
  adminRoleDef: { select: { id: true, key: true, name: true, color: true, level: true, permissions: true, isSystem: true } },
  emailVerified: true,
  lockedUntil: true,
  lastLoginAt: true,
  lastLoginIp: true,
  createdAt: true,
  memberships: {
    include: { organization: { select: { id: true, name: true, slug: true, plan: true } } },
    take: 1,
  },
} satisfies Prisma.UserSelect;

export function validatePassword(pw: unknown): string | null {
  if (typeof pw !== "string" || pw.length < 10) return "Password must be at least 10 characters";
  if (pw.length > 128) return "Password is too long";
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/\d/.test(pw)) {
    return "Password must include upper-case, lower-case letters and a number";
  }
  return null;
}

