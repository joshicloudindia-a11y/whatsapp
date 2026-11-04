// Super admin panel RBAC. Client-safe: no server imports here.
// Roles live in the database (AdminRoleDefinition); this file defines the
// permission catalogue and the defaults for the four built-in system roles.

export interface PermissionDef { key: string; label: string; description: string; danger?: boolean }
export interface PermissionGroup { key: string; label: string; icon: string; permissions: PermissionDef[] }

export const PERMISSION_GROUPS = [
  {
    key: "overview", label: "Overview", icon: "dashboard",
    permissions: [{ key: "overview:read", label: "View overview", description: "Platform stats and security summary" }],
  },
  {
    key: "orgs", label: "Organizations", icon: "apartment",
    permissions: [
      { key: "orgs:read", label: "View organizations", description: "List, search and open organizations" },
      { key: "orgs:create", label: "Create organizations", description: "Add new workspaces" },
      { key: "orgs:write", label: "Edit organizations", description: "Change name, slug, plan and trial" },
      { key: "orgs:whatsapp", label: "Manage WhatsApp numbers", description: "Connect, disable or remove numbers" },
      { key: "orgs:delete", label: "Delete organizations", description: "Permanently delete a workspace and its data", danger: true },
    ],
  },
  {
    key: "users", label: "Users", icon: "group",
    permissions: [
      { key: "users:read", label: "View users", description: "List and search all platform users" },
      { key: "users:create", label: "Create users", description: "Add users and assign them to organizations" },
      { key: "users:write", label: "Edit users", description: "Change name, email and organization role" },
      { key: "users:suspend", label: "Suspend users", description: "Suspend or re-activate accounts" },
      { key: "users:sessions", label: "Manage sessions", description: "Unlock accounts and force sign-out" },
      { key: "users:password", label: "Reset passwords", description: "Set a new password for a user", danger: true },
      { key: "users:delete", label: "Delete users", description: "Permanently delete user accounts", danger: true },
    ],
  },
  {
    key: "admins", label: "Admin staff", icon: "shield_person",
    permissions: [
      { key: "admins:manage", label: "Assign admin roles", description: "Give or remove admin panel access (only roles below your level)", danger: true },
    ],
  },
  {
    key: "roles", label: "Roles & permissions", icon: "admin_panel_settings",
    permissions: [
      { key: "roles:read", label: "View roles", description: "See roles and their permissions" },
      { key: "roles:manage", label: "Manage roles", description: "Create, edit and delete roles", danger: true },
    ],
  },
  {
    key: "plans", label: "Plans & pricing", icon: "credit_card",
    permissions: [
      { key: "plans:read", label: "View plans", description: "See plans and limits" },
      { key: "plans:write", label: "Create & edit plans", description: "Change prices, limits and features" },
      { key: "plans:delete", label: "Delete plans", description: "Remove plans from the pricing page", danger: true },
    ],
  },
  {
    key: "audit", label: "Audit logs", icon: "history",
    permissions: [
      { key: "audit:read", label: "View audit logs", description: "See every admin sign-in and change" },
      { key: "audit:export", label: "Export audit logs", description: "Download audit logs as CSV" },
    ],
  },
] as const satisfies readonly PermissionGroup[];

export type Permission = (typeof PERMISSION_GROUPS)[number]["permissions"][number]["key"];

export const ALL_PERMISSIONS: Permission[] = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key as Permission));

export function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && (ALL_PERMISSIONS as string[]).includes(value);
}

// ── System roles ─────────────────────────────────────────────────────────────
export const SYSTEM_ROLE_KEYS = ["SUPER_ADMIN", "ADMIN", "SUPPORT", "VIEWER"] as const;
export type SystemRoleKey = (typeof SYSTEM_ROLE_KEYS)[number];

export const SYSTEM_ROLES: Record<SystemRoleKey, { name: string; description: string; color: string; level: number; permissions: Permission[] }> = {
  SUPER_ADMIN: {
    name: "Super Admin", color: "#7c3aed", level: 100,
    description: "Full, unrestricted access. Permissions are locked.",
    permissions: ALL_PERMISSIONS,
  },
  ADMIN: {
    name: "Admin", color: "#2563eb", level: 80,
    description: "Runs day-to-day platform operations.",
    permissions: ALL_PERMISSIONS.filter((p) => !["roles:manage", "admins:manage", "plans:delete"].includes(p)),
  },
  SUPPORT: {
    name: "Support", color: "#d97706", level: 50,
    description: "Helps customers: edits orgs and users, no deletes or pricing.",
    permissions: ["overview:read", "orgs:read", "orgs:write", "orgs:whatsapp", "users:read", "users:write", "users:suspend", "users:sessions", "plans:read"],
  },
  VIEWER: {
    name: "Viewer", color: "#64748b", level: 10,
    description: "Read-only access to the admin panel.",
    permissions: ["overview:read", "orgs:read", "users:read", "plans:read"],
  },
};

export function isSystemRoleKey(value: unknown): value is SystemRoleKey {
  return typeof value === "string" && (SYSTEM_ROLE_KEYS as readonly string[]).includes(value);
}

/** Resolved role attached to an admin session / user row. */
export interface AdminRoleInfo {
  id: string;
  key: string;
  name: string;
  color: string;
  level: number;
  isSystem: boolean;
  permissions: Permission[];
}

export function hasPermission(role: Pick<AdminRoleInfo, "permissions"> | null | undefined, permission: Permission): boolean {
  return !!role && role.permissions.includes(permission);
}

/** Admin panel session lifetime (independent of the 30-day app session). */
export const ADMIN_SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;
