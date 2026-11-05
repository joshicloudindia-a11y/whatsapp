import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit, requireAdmin, type AdminContext } from "@/lib/admin-auth";
import { hasPermission, type AdminRoleInfo, type Permission } from "@/lib/rbac";
import { ROLE_SELECT, activeSuperAdminCount, resolveAdminRole, toRoleInfo } from "@/lib/admin-roles";
import { EMAIL_RE, MEMBER_ROLES, USER_SELECT, validatePassword, type MemberRoleName } from "@/lib/admin-users";

type Params = { params: Promise<{ id: string }> };

const deny = (error: string, status = 403) => NextResponse.json({ error }, { status });

/** Non-super-admins may only act on users whose role level is strictly below theirs. */
function outranks(ctx: AdminContext, target: AdminRoleInfo | null) {
  if (ctx.role.key === "SUPER_ADMIN") return true;
  return !target || ctx.role.level > target.level;
}

const TARGET_SELECT = {
  id: true, email: true, isActive: true, isSuperAdmin: true, adminRole: true, adminRoleId: true,
  adminRoleDef: { select: ROLE_SELECT },
} satisfies Prisma.UserSelect;

function present(u: Prisma.UserGetPayload<{ select: typeof USER_SELECT }>) {
  const { adminRoleDef, ...rest } = u;
  return { ...rest, adminRoleInfo: adminRoleDef ? toRoleInfo(adminRoleDef) : null };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { ctx, response } = await requireAdmin("users:read");
  if (!ctx) return response;
  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id }, select: USER_SELECT });
  if (!user) return deny("Not found", 404);
  return NextResponse.json({ user: present(user) });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { ctx, response } = await requireAdmin("users:read");
  if (!ctx) return response;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) ?? {};

  const target = await prisma.user.findUnique({ where: { id }, select: TARGET_SELECT });
  if (!target) return deny("Not found", 404);

  const targetRole = await resolveAdminRole(target);
  const isSelf = target.id === ctx.userId;
  if (!isSelf && !outranks(ctx, targetRole)) return deny("You cannot modify a user with an equal or higher admin role");

  const need = (p: Permission) => (hasPermission(ctx.role, p) ? null : deny(`Your role doesn't have the "${p}" permission`));

  const data: Prisma.UserUpdateInput = {};
  const changes: Record<string, unknown> = {};
  let revokeSessions = false;

  if (body.name !== undefined || body.email !== undefined) {
    const d = need("users:write"); if (d) return d;
  }
  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 100);
    if (!name) return deny("Name cannot be empty", 400);
    data.name = changes.name = name;
  }
  if (body.email !== undefined) {
    const email = String(body.email).toLowerCase().trim();
    if (!EMAIL_RE.test(email)) return deny("Invalid email", 400);
    data.email = changes.email = email;
  }

  if (body.isActive !== undefined) {
    const d = need("users:suspend"); if (d) return d;
    const isActive = Boolean(body.isActive);
    if (isSelf && !isActive) return deny("You cannot suspend yourself", 400);
    if (!isActive && targetRole?.key === "SUPER_ADMIN" && (await activeSuperAdminCount()) <= 1) {
      return deny("Cannot suspend the last active Super Admin", 400);
    }
    data.isActive = changes.isActive = isActive;
    if (!isActive) revokeSessions = true;
  }

  if (body.adminRoleId !== undefined) {
    const d = need("admins:manage"); if (d) return d;
    if (isSelf) return deny("You cannot change your own admin role", 400);
    const newRoleId = body.adminRoleId ? String(body.adminRoleId) : null;
    let newRole: { id: string; key: string; name: string; level: number } | null = null;
    if (newRoleId) {
      newRole = await prisma.adminRoleDefinition.findUnique({ where: { id: newRoleId }, select: { id: true, key: true, name: true, level: true } });
      if (!newRole) return deny("Admin role not found", 404);
      if (ctx.role.key !== "SUPER_ADMIN" && newRole.level >= ctx.role.level) {
        return deny(`You can only assign roles below your own level (${ctx.role.name})`);
      }
    }
    if (targetRole?.key === "SUPER_ADMIN" && newRole?.key !== "SUPER_ADMIN" && (await activeSuperAdminCount()) <= 1) {
      return deny("Cannot demote the last Super Admin", 400);
    }
    data.adminRoleDef = newRole ? { connect: { id: newRole.id } } : { disconnect: true };
    data.adminRole = null; // legacy column no longer used once a role is set explicitly
    data.isSuperAdmin = newRole?.key === "SUPER_ADMIN";
    changes.adminRole = { from: targetRole?.name ?? null, to: newRole?.name ?? null };
    revokeSessions = true;
  }

  if (body.password !== undefined) {
    const d = need("users:password"); if (d) return d;
    const pwError = validatePassword(body.password);
    if (pwError) return deny(pwError, 400);
    data.passwordHash = await bcrypt.hash(body.password, 12);
    changes.password = "reset";
    revokeSessions = true;
  }

  if (body.unlock || body.revokeSessions) {
    const d = need("users:sessions"); if (d) return d;
    if (body.unlock) { data.failedLoginAttempts = 0; data.lockedUntil = null; changes.unlock = true; }
    if (body.revokeSessions) { revokeSessions = true; changes.revokeSessions = true; }
  }
  if (revokeSessions) data.sessionsRevokedAt = new Date();

  // Organization membership: add to / move between / remove from an organization.
  // `organizationId: null` removes the user from their organization. A user has one active organization.
  let orgChange: { organizationId: string | null; role: MemberRoleName } | null = null;
  if (body.organizationId !== undefined || body.memberRole !== undefined) {
    const d = need("users:write"); if (d) return d;
    const role = (body.memberRole ?? "AGENT") as MemberRoleName;
    if (!MEMBER_ROLES.includes(role)) return deny("Invalid organization role", 400);
    const organizationId = body.organizationId ? String(body.organizationId) : null;
    if (organizationId) {
      const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
      if (!org) return deny("Organization not found", 404);
    }
    // Never leave an organization without an admin.
    const current = await prisma.organizationMember.findMany({ where: { userId: id, isActive: true }, select: { organizationId: true, role: true } });
    for (const m of current) {
      const leavingAdmin = m.role === "ADMIN" && (m.organizationId !== organizationId || role !== "ADMIN");
      if (leavingAdmin) {
        const admins = await prisma.organizationMember.count({ where: { organizationId: m.organizationId, isActive: true, role: "ADMIN" } });
        if (admins <= 1) return deny("This user is the only admin of their organization. Make someone else admin first.", 400);
      }
    }
    orgChange = { organizationId, role };
    changes.organization = orgChange;
  }

  if (Object.keys(changes).length === 0) return deny("Nothing to update", 400);

  try {
    const user = await prisma.$transaction(async (tx) => {
      if (orgChange) {
        // Deactivate memberships in other organizations (one active organization per user).
        await tx.organizationMember.updateMany({
          where: { userId: id, isActive: true, ...(orgChange.organizationId && { organizationId: { not: orgChange.organizationId } }) },
          data: { isActive: false },
        });
        if (orgChange.organizationId) {
          await tx.organizationMember.upsert({
            where: { organizationId_userId: { organizationId: orgChange.organizationId, userId: id } },
            update: { isActive: true, role: orgChange.role },
            create: { organizationId: orgChange.organizationId, userId: id, role: orgChange.role, joinedAt: new Date() },
          });
        }
      }
      return tx.user.update({ where: { id }, data, select: USER_SELECT });
    });
    await audit(ctx, "user.update", { entity: "User", entityId: id, metadata: { target: target.email, ...changes } as Prisma.InputJsonValue });
    return NextResponse.json({ user: present(user) });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return deny("Email already in use", 409);
    console.error("[admin] user update failed", e);
    return deny("Update failed", 500);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { ctx, response } = await requireAdmin("users:delete");
  if (!ctx) return response;
  const { id } = await params;

  if (id === ctx.userId) return deny("You cannot delete yourself", 400);

  const target = await prisma.user.findUnique({ where: { id }, select: TARGET_SELECT });
  if (!target) return deny("Not found", 404);

  const targetRole = await resolveAdminRole(target);
  if (!outranks(ctx, targetRole)) return deny("You cannot delete a user with an equal or higher admin role");
  if (targetRole?.key === "SUPER_ADMIN" && (await activeSuperAdminCount()) <= 1) {
    return deny("Cannot delete the last Super Admin", 400);
  }

  await prisma.user.delete({ where: { id } });
  await audit(ctx, "user.delete", { entity: "User", entityId: id, metadata: { email: target.email, adminRole: targetRole?.name ?? null } });
  return NextResponse.json({ success: true });
}
