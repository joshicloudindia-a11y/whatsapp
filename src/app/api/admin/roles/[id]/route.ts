import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit, requireAdmin } from "@/lib/admin-auth";
import { ROLE_SELECT, toRoleInfo } from "@/lib/admin-roles";
import { parseRoleInput } from "@/lib/admin-role-input";

type Params = { params: Promise<{ id: string }> };
const deny = (error: string, status = 403) => NextResponse.json({ error }, { status });

export async function PATCH(req: NextRequest, { params }: Params) {
  const { ctx, response } = await requireAdmin("roles:manage");
  if (!ctx) return response;
  const { id } = await params;

  const role = await prisma.adminRoleDefinition.findUnique({ where: { id }, select: ROLE_SELECT });
  if (!role) return deny("Role not found", 404);
  if (role.key === "SUPER_ADMIN") return deny("The Super Admin role is locked and always has every permission");
  if (ctx.role.key !== "SUPER_ADMIN" && role.level >= ctx.role.level) return deny("You can only edit roles below your own level");
  if (role.id === ctx.role.id) return deny("You cannot edit your own role");

  const body = (await req.json().catch(() => null)) ?? {};
  // System roles keep their name and level; only description, colour and permissions change.
  if (role.isSystem) { delete body.name; delete body.level; }
  const parsed = parseRoleInput(body, ctx, true);
  if ("error" in parsed) return deny(parsed.error, parsed.status ?? 400);
  if (Object.keys(parsed.data).length === 0) return deny("Nothing to update", 400);

  const before = toRoleInfo(role).permissions;
  try {
    const updated = await prisma.adminRoleDefinition.update({
      where: { id },
      data: parsed.data as Prisma.AdminRoleDefinitionUpdateInput,
      select: ROLE_SELECT,
    });
    const after = toRoleInfo(updated).permissions;
    await audit(ctx, "role.update", {
      entity: "AdminRole", entityId: id,
      metadata: {
        name: updated.name,
        fields: Object.keys(parsed.data),
        ...(parsed.data.permissions && {
          added: after.filter((p) => !before.includes(p)),
          removed: before.filter((p) => !after.includes(p)),
        }),
      },
    });
    return NextResponse.json({ role: toRoleInfo(updated) });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return deny("A role with this name already exists", 409);
    console.error("[admin] role update failed", e);
    return deny("Update failed", 500);
  }
}

/** DELETE /api/admin/roles/:id?reassignTo=<roleId|none> */
export async function DELETE(req: NextRequest, { params }: Params) {
  const { ctx, response } = await requireAdmin("roles:manage");
  if (!ctx) return response;
  const { id } = await params;

  const role = await prisma.adminRoleDefinition.findUnique({ where: { id }, select: { ...ROLE_SELECT, _count: { select: { users: true } } } });
  if (!role) return deny("Role not found", 404);
  if (role.isSystem) return deny("System roles cannot be deleted");
  if (ctx.role.key !== "SUPER_ADMIN" && role.level >= ctx.role.level) return deny("You can only delete roles below your own level");

  const reassignTo = req.nextUrl.searchParams.get("reassignTo");
  let target: { id: string; name: string; level: number } | null = null;
  if (role._count.users > 0) {
    if (!reassignTo) return deny(`${role._count.users} user(s) have this role. Choose a role to move them to.`, 409);
    if (reassignTo !== "none") {
      if (reassignTo === id) return deny("Choose a different role", 400);
      target = await prisma.adminRoleDefinition.findUnique({ where: { id: reassignTo }, select: { id: true, name: true, level: true } });
      if (!target) return deny("Target role not found", 404);
      if (ctx.role.key !== "SUPER_ADMIN" && target.level >= ctx.role.level) return deny("You can only move users to roles below your level");
    }
  }

  await prisma.$transaction([
    prisma.user.updateMany({
      where: { adminRoleId: id },
      data: { adminRoleId: target?.id ?? null, adminRole: null, isSuperAdmin: false, sessionsRevokedAt: new Date() },
    }),
    prisma.adminRoleDefinition.delete({ where: { id } }),
  ]);
  await audit(ctx, "role.delete", {
    entity: "AdminRole", entityId: id,
    metadata: { name: role.name, membersMoved: role._count.users, movedTo: target?.name ?? (role._count.users ? "No admin access" : null) },
  });
  return NextResponse.json({ success: true });
}
