import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";

/** Everything the inbox composer/sidebar needs in one request. */
export async function GET() {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  const organizationId = member.organizationId;

  const [members, quickReplies, templates, labels] = await Promise.all([
    prisma.organizationMember.findMany({
      where: { organizationId, isActive: true },
      select: { role: true, user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.quickReply.findMany({ where: { organizationId }, orderBy: { shortcut: "asc" }, select: { id: true, shortcut: true, content: true } }),
    prisma.messageTemplate.findMany({
      where: { organizationId, status: "APPROVED" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, language: true, category: true, body: true },
    }),
    prisma.label.findMany({ where: { organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true, color: true } }),
  ]);

  return NextResponse.json({
    me: { userId: member.userId, role: member.role },
    members: members.map((m) => ({ ...m.user, role: m.role })),
    quickReplies, templates, labels,
  });
}
