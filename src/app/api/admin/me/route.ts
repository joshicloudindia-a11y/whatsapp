import { NextResponse } from "next/server";
import { requireAdmin, audit } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { ctx, response } = await requireAdmin("overview:read");
  if (!ctx) return response;
  return NextResponse.json({
    user: { id: ctx.userId, email: ctx.email, name: ctx.name, role: ctx.role },
    permissions: ctx.role.permissions,
  });
}

/** "Sign out everywhere": invalidates every admin session of the current user. */
export async function DELETE() {
  const { ctx, response } = await requireAdmin("overview:read");
  if (!ctx) return response;
  await prisma.user.update({ where: { id: ctx.userId }, data: { sessionsRevokedAt: new Date() } });
  await audit(ctx, "admin.logout.all");
  return NextResponse.json({ success: true });
}
