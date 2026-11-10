import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit, requireAdmin } from "@/lib/admin-auth";
import { resolveAdminRole, ROLE_SELECT } from "@/lib/admin-roles";
import { TICKET_TTL_MS, signToken } from "@/lib/impersonation";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
const deny = (error: string, status = 403) => NextResponse.json({ error }, { status });

/** "Login as user" — Super Admin only. Returns a 60-second ticket for signIn("impersonate"). */
export async function POST(_req: NextRequest, { params }: Params) {
  const { ctx, response } = await requireAdmin("users:read");
  if (!ctx) return response;
  if (ctx.role.key !== "SUPER_ADMIN") return deny("Only a Super Admin can sign in as another user");

  const session = await getServerSession(authOptions);
  const adminAuthAt = session?.user?.adminAuthAt;
  if (!adminAuthAt || session.user.impersonator) return deny("Admin session required", 401);

  const { id } = await params;
  if (id === ctx.userId) return deny("You are already signed in as yourself", 400);
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, isActive: true, isSuperAdmin: true, adminRole: true, adminRoleId: true, adminRoleDef: { select: ROLE_SELECT } },
  });
  if (!target) return deny("User not found", 404);
  if (!target.isActive) return deny("Activate this user before signing in as them", 400);
  if ((await resolveAdminRole(target))?.key === "SUPER_ADMIN") return deny("You cannot sign in as another Super Admin");

  await audit(ctx, "user.impersonate.request", { entity: "User", entityId: target.id, metadata: { target: target.email } });
  return NextResponse.json({ ticket: signToken("imp", { a: ctx.userId, t: target.id, aa: adminAuthAt }, TICKET_TTL_MS) });
}
