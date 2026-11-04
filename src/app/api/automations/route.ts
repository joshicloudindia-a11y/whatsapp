import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { resolvePlanConfig } from "@/lib/plans";
import { sanitizeAutomation, assigneeIds, SUPPORTED_EVENTS } from "@/components/automation/schema";
import { AUTOMATION_MANAGER_ROLES as MANAGER_ROLES, validateAssignees } from "@/lib/automation-runtime";

export async function GET() {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  const organizationId = member.organizationId;

  const [automations, members, tags, org] = await Promise.all([
    prisma.automation.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } }),
    prisma.organizationMember.findMany({
      where: { organizationId, isActive: true },
      select: { role: true, user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.contactTag.findMany({ where: { contact: { organizationId } }, distinct: ["tag"], select: { tag: true }, orderBy: { tag: "asc" }, take: 200 }),
    prisma.organization.findUnique({ where: { id: organizationId }, select: { timezone: true } }),
  ]);

  return NextResponse.json({
    automations,
    meta: {
      canManage: MANAGER_ROLES.includes(member.role),
      timezone: org?.timezone ?? "Asia/Kolkata",
      supportedEvents: SUPPORTED_EVENTS,
      members: members.map((m) => ({ id: m.user.id, name: m.user.name, email: m.user.email, role: m.role })),
      tags: tags.map((t) => t.tag),
    },
  });
}

export async function POST(req: NextRequest) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  if (!MANAGER_ROLES.includes(member.role)) return NextResponse.json({ error: "Only admins and automation managers can create automations" }, { status: 403 });
  const organizationId = member.organizationId;

  const parsed = sanitizeAutomation(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const input = parsed.value;

  const assigneeError = await validateAssignees(organizationId, assigneeIds(input.actions));
  if (assigneeError) return NextResponse.json({ error: assigneeError }, { status: 400 });

  // Plan limit on the number of automations.
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { plan: true, subscription: { select: { plan: true } } } });
  const planConfig = org ? await resolvePlanConfig(org.subscription?.plan ?? org.plan) : null;
  const limit = planConfig?.maxAutomations ?? 100;
  if ((await prisma.automation.count({ where: { organizationId } })) >= limit) {
    return NextResponse.json({ error: `Your plan allows ${limit} automations. Delete one or upgrade to add more.` }, { status: 403 });
  }

  const automation = await prisma.automation.create({
    data: {
      organizationId,
      name: input.name,
      isActive: input.isActive,
      triggerEvent: input.triggerEvent,
      conditions: input.conditions as never,
      actions: input.actions as never,
    },
  });

  return NextResponse.json({ automation }, { status: 201 });
}
