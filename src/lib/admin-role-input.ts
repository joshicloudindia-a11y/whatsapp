import type { AdminContext } from "@/lib/admin-auth";
import { isPermission, type Permission } from "@/lib/rbac";

const HEX = /^#[0-9a-fA-F]{6}$/;

export interface RoleInput { name?: string; description?: string | null; color?: string; level?: number; permissions?: Permission[] }

/** Validates role input and enforces anti-escalation rules for the acting admin. */
export function parseRoleInput(body: Record<string, unknown>, ctx: AdminContext, partial: boolean): { data: RoleInput } | { error: string; status?: number } {
  const data: RoleInput = {};
  const isSuper = ctx.role.key === "SUPER_ADMIN";

  if (body.name !== undefined || !partial) {
    const name = String(body.name ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
    if (name.length < 2) return { error: "Role name must be at least 2 characters" };
    data.name = name;
  }
  if (body.description !== undefined) data.description = body.description ? String(body.description).trim().slice(0, 300) : null;
  if (body.color !== undefined) {
    if (!HEX.test(String(body.color))) return { error: "Colour must be a hex value like #2563eb" };
    data.color = String(body.color);
  }
  if (body.level !== undefined || !partial) {
    const level = Math.round(Number(body.level ?? 40));
    if (!Number.isFinite(level) || level < 1 || level > 99) return { error: "Level must be between 1 and 99" };
    if (!isSuper && level >= ctx.role.level) return { error: `Level must be below your own (${ctx.role.level})`, status: 403 };
    data.level = level;
  }
  if (body.permissions !== undefined || !partial) {
    if (!Array.isArray(body.permissions)) return { error: "Permissions must be a list" };
    const perms = [...new Set(body.permissions.filter(isPermission))] as Permission[];
    const notHeld = perms.filter((p) => !ctx.role.permissions.includes(p));
    if (notHeld.length) return { error: `You can't grant permissions you don't have: ${notHeld.join(", ")}`, status: 403 };
    data.permissions = perms;
  }
  return { data };
}

export function roleKeyFrom(name: string) {
  return name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "ROLE";
}
