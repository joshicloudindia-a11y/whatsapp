import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, requireAdmin } from "@/lib/admin-auth";
import { ROLE_SELECT, ensureSystemRoles, toRoleInfo } from "@/lib/admin-roles";
import { parseRoleInput, roleKeyFrom } from "@/lib/admin-role-input";

export async function GET() {
  const { ctx, response } = await requireAdmin("roles:read");
  if (!ctx) return response;
  await ensureSystemRoles();

  const rows = await prisma.adminRoleDefinition.findMany({
    select: { ...ROLE_SELECT, createdAt: true, updatedAt: true, _count: { select: { users: true } } },
    orderBy: [{ level: "desc" }, { name: "asc" }],
  });

  const roles = rows.map((r) => ({
    ...toRoleInfo(r),
    description: r.description,
    memberCount: r._count.users,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    // Whether the current admin may edit/delete this role.
    manageable: ctx.role.key === "SUPER_ADMIN" ? r.key !== "SUPER_ADMIN" : r.level < ctx.role.level,
  }));
  return NextResponse.json({ roles, me: { roleId: ctx.role.id, level: ctx.role.level, isSuper: ctx.role.key === "SUPER_ADMIN" } });
}

export async function POST(req: NextRequest) {
  const { ctx, response } = await requireAdmin("roles:manage");
  if (!ctx) return response;

  const body = (await req.json().catch(() => null)) ?? {};
  const parsed = parseRoleInput(body, ctx, false);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: parsed.status ?? 400 });
  const { name, description, color, level, permissions } = parsed.data;

  // Unique key derived from the name.
  const base = roleKeyFrom(name!);
  let key = base;
  for (let i = 2; await prisma.adminRoleDefinition.findUnique({ where: { key }, select: { id: true } }); i++) key = `${base}_${i}`;

  try {
    const role = await prisma.adminRoleDefinition.create({
      data: { key, name: name!, description: description ?? null, color: color ?? "#0ea5e9", level: level!, permissions: permissions!, isSystem: false, createdById: ctx.userId },
      select: ROLE_SELECT,
    });
    await audit(ctx, "role.create", { entity: "AdminRole", entityId: role.id, metadata: { name: role.name, level: role.level, permissions: permissions! } });
    return NextResponse.json({ role: toRoleInfo(role) }, { status: 201 });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return NextResponse.json({ error: "A role with this name already exists" }, { status: 409 });
    console.error("[admin] role create failed", e);
    return NextResponse.json({ error: "Failed to create role" }, { status: 500 });
  }
}
