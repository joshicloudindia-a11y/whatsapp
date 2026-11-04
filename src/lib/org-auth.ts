import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Resolves the caller's org membership from the DB (the JWT role can be stale). */
export async function getOrgMember() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.organizationId) return null;
  const member = await prisma.organizationMember.findFirst({
    where: { userId: session.user.id, organizationId: session.user.organizationId, isActive: true },
    select: { role: true, organizationId: true, userId: true },
  });
  return member;
}

export async function requireOrgMember(opts: { admin?: boolean } = {}) {
  const member = await getOrgMember();
  if (!member) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  if (opts.admin && member.role !== "ADMIN") {
    return { response: NextResponse.json({ error: "Only organization admins can do this" }, { status: 403 }) } as const;
  }
  return { member } as const;
}
