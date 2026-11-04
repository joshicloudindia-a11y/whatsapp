import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { seatUsage } from "@/lib/team";

export async function GET() {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  const organizationId = member.organizationId;
  const isAdmin = member.role === "ADMIN";

  const [members, invitations, seats] = await Promise.all([
    prisma.organizationMember.findMany({
      where: { organizationId, isActive: true },
      select: {
        id: true, role: true, joinedAt: true, createdAt: true,
        user: { select: { id: true, name: true, email: true, avatar: true, lastLoginAt: true, isActive: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    isAdmin
      ? prisma.invitation.findMany({
          where: { organizationId, acceptedAt: null },
          select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
    seatUsage(organizationId),
  ]);

  return NextResponse.json({ members, invitations, seats, me: { userId: member.userId, isAdmin } });
}
