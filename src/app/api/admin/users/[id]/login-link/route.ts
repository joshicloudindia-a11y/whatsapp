import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, requireAdmin } from "@/lib/admin-auth";
import { resolveAdminRole, ROLE_SELECT } from "@/lib/admin-roles";
import { STAFF_LINK_TTL_MS, signToken, staffLinkVersion } from "@/lib/impersonation";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
const deny = (error: string, status = 403) => NextResponse.json({ error }, { status });

/** Personal admin sign-in link for an admin staff member — Super Admin only. Password + email OTP are still required. */
export async function POST(req: NextRequest, { params }: Params) {
  const { ctx, response } = await requireAdmin("users:read");
  if (!ctx) return response;
  if (ctx.role.key !== "SUPER_ADMIN") return deny("Only a Super Admin can create personal sign-in links");

  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, isActive: true, isSuperAdmin: true, adminRole: true, adminRoleId: true, sessionsRevokedAt: true, adminRoleDef: { select: ROLE_SELECT } },
  });
  if (!user) return deny("User not found", 404);
  if (!user.isActive) return deny("This user is suspended", 400);
  if (!(await resolveAdminRole(user))) return deny("Only admin staff need a personal sign-in link. Assign an admin role first.", 400);

  const token = signToken("staff", { u: user.id, v: staffLinkVersion(user.sessionsRevokedAt) }, STAFF_LINK_TTL_MS);
  const base = (process.env.NEXTAUTH_URL || req.nextUrl.origin).replace(/\/$/, "");
  await audit(ctx, "user.login_link.create", { entity: "User", entityId: user.id, metadata: { target: user.email } });
  return NextResponse.json({ url: `${base}/admin/login?k=${encodeURIComponent(token)}`, expiresAt: Date.now() + STAFF_LINK_TTL_MS });
}
