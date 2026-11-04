import type { AdminRoleDefinition, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  ALL_PERMISSIONS, SYSTEM_ROLES, SYSTEM_ROLE_KEYS, isPermission, isSystemRoleKey,
  type AdminRoleInfo, type Permission,
} from "@/lib/rbac";

export const ROLE_SELECT = {
  id: true, key: true, name: true, description: true, color: true, level: true, permissions: true, isSystem: true,
} satisfies Prisma.AdminRoleDefinitionSelect;

type RoleRow = Pick<AdminRoleDefinition, "id" | "key" | "name" | "color" | "level" | "permissions" | "isSystem">;

export function toRoleInfo(row: RoleRow): AdminRoleInfo {
  const stored = Array.isArray(row.permissions) ? (row.permissions as unknown[]).filter(isPermission) : [];
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    color: row.color,
    level: row.level,
    isSystem: row.isSystem,
    // Super Admin is always all-powerful, whatever is stored.
    permissions: row.key === "SUPER_ADMIN" ? [...ALL_PERMISSIONS] : (stored as Permission[]),
  };
}

let ensured: Promise<void> | null = null;

/**
 * Idempotently creates the four system roles and links legacy users
 * (adminRole enum / isSuperAdmin flag) to them. Runs once per server instance.
 */
export function ensureSystemRoles(): Promise<void> {
  ensured ??= (async () => {
    for (const key of SYSTEM_ROLE_KEYS) {
      const def = SYSTEM_ROLES[key];
      await prisma.adminRoleDefinition.upsert({
        where: { key },
        update: {},
        create: { key, name: def.name, description: def.description, color: def.color, level: def.level, permissions: def.permissions, isSystem: true },
      });
    }
    const roles = await prisma.adminRoleDefinition.findMany({ where: { key: { in: [...SYSTEM_ROLE_KEYS] } }, select: { id: true, key: true } });
    const idByKey = Object.fromEntries(roles.map((r) => [r.key, r.id]));
    for (const key of SYSTEM_ROLE_KEYS) {
      await prisma.user.updateMany({ where: { adminRoleId: null, adminRole: key }, data: { adminRoleId: idByKey[key] } });
    }
    await prisma.user.updateMany({ where: { adminRoleId: null, adminRole: null, isSuperAdmin: true }, data: { adminRoleId: idByKey.SUPER_ADMIN } });
  })().catch((e) => {
    ensured = null; // retry on next call
    throw e;
  });
  return ensured;
}

/** Resolves a user's admin role (DB role first, then legacy fields). */
export async function resolveAdminRole(user: {
  adminRoleId?: string | null;
  adminRole?: string | null;
  isSuperAdmin?: boolean | null;
  adminRoleDef?: RoleRow | null;
}): Promise<AdminRoleInfo | null> {
  if (user.adminRoleDef) return toRoleInfo(user.adminRoleDef);
  await ensureSystemRoles();
  if (user.adminRoleId) {
    const row = await prisma.adminRoleDefinition.findUnique({ where: { id: user.adminRoleId }, select: ROLE_SELECT });
    if (row) return toRoleInfo(row);
  }
  const legacyKey = isSystemRoleKey(user.adminRole) ? user.adminRole : user.isSuperAdmin ? "SUPER_ADMIN" : null;
  if (!legacyKey) return null;
  const row = await prisma.adminRoleDefinition.findUnique({ where: { key: legacyKey }, select: ROLE_SELECT });
  return row ? toRoleInfo(row) : null;
}

/** Active users holding the Super Admin role (new or legacy representation). */
export async function activeSuperAdminCount() {
  await ensureSystemRoles();
  return prisma.user.count({
    where: {
      isActive: true,
      OR: [{ adminRoleDef: { key: "SUPER_ADMIN" } }, { adminRoleId: null, adminRole: "SUPER_ADMIN" }, { adminRoleId: null, adminRole: null, isSuperAdmin: true }],
    },
  });
}

/** Where-clause for "is admin staff" in user queries. */
export const ADMIN_STAFF_WHERE: Prisma.UserWhereInput = {
  OR: [{ adminRoleId: { not: null } }, { adminRole: { not: null } }, { isSuperAdmin: true }],
};
