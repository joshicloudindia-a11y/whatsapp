import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit, requireAdmin } from "@/lib/admin-auth";
import { hasPermission } from "@/lib/rbac";
import { ADMIN_STAFF_WHERE, ensureSystemRoles, toRoleInfo } from "@/lib/admin-roles";
import { EMAIL_RE, MEMBER_ROLES, USER_SELECT, validatePassword, type MemberRoleName } from "@/lib/admin-users";

type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

/** Strips the raw role row and attaches a resolved, client-safe role summary. */
function present(u: UserRow) {
  const { adminRoleDef, ...rest } = u;
  return { ...rest, adminRoleInfo: adminRoleDef ? toRoleInfo(adminRoleDef) : null };
}

export async function GET(req: NextRequest) {
  const { ctx, response } = await requireAdmin("users:read");
  if (!ctx) return response;
  await ensureSystemRoles();

  const { searchParams } = req.nextUrl;
  const search = (searchParams.get("search") ?? "").slice(0, 100);
  const filter = searchParams.get("filter") ?? "all";
  const roleId = searchParams.get("roleId");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "25") || 25));

  const and: Prisma.UserWhereInput[] = [];
  if (search) and.push({ OR: [{ name: { contains: search } }, { email: { contains: search } }] });
  if (filter === "admins") and.push(ADMIN_STAFF_WHERE);
  if (filter === "suspended") and.push({ isActive: false });
  if (filter === "locked") and.push({ lockedUntil: { gt: new Date() } });
  if (roleId) and.push({ adminRoleId: roleId });
  const where: Prisma.UserWhereInput = and.length ? { AND: and } : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({ where, select: USER_SELECT, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
    prisma.user.count({ where }),
  ]);

  return NextResponse.json({ users: users.map(present), total, page, limit });
}

export async function POST(req: NextRequest) {
  const { ctx, response } = await requireAdmin("users:create");
  if (!ctx) return response;

  const body = (await req.json().catch(() => null)) ?? {};
  const name = String(body.name ?? "").trim().slice(0, 100);
  const email = String(body.email ?? "").toLowerCase().trim();
  const password = body.password;
  const organizationId = body.organizationId ? String(body.organizationId) : null;
  const memberRole = (body.memberRole ?? "AGENT") as MemberRoleName;
  const adminRoleId = body.adminRoleId ? String(body.adminRoleId) : null;

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  const pwError = validatePassword(password);
  if (pwError) return NextResponse.json({ error: pwError }, { status: 400 });
  if (!MEMBER_ROLES.includes(memberRole)) return NextResponse.json({ error: "Invalid organization role" }, { status: 400 });

  let roleKey: string | null = null;
  if (adminRoleId) {
    if (!hasPermission(ctx.role, "admins:manage")) {
      return NextResponse.json({ error: "Your role cannot grant admin panel access" }, { status: 403 });
    }
    const role = await prisma.adminRoleDefinition.findUnique({ where: { id: adminRoleId }, select: { key: true, level: true, name: true } });
    if (!role) return NextResponse.json({ error: "Admin role not found" }, { status: 404 });
    if (ctx.role.key !== "SUPER_ADMIN" && role.level >= ctx.role.level) {
      return NextResponse.json({ error: `You can only assign roles below your own level (${ctx.role.name})` }, { status: 403 });
    }
    roleKey = role.key;
  }

  if (organizationId) {
    const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
    if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  try {
    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash: await bcrypt.hash(password as string, 12),
        emailVerified: new Date(),
        adminRoleId,
        isSuperAdmin: roleKey === "SUPER_ADMIN",
        ...(organizationId && { memberships: { create: { organizationId, role: memberRole, joinedAt: new Date() } } }),
      },
      select: USER_SELECT,
    });
    await audit(ctx, "user.create", {
      entity: "User", entityId: user.id,
      metadata: { email, adminRole: roleKey, organizationId, memberRole: organizationId ? memberRole : null },
    });
    return NextResponse.json({ user: present(user) }, { status: 201 });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
    }
    console.error("[admin] user create failed", e);
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}
