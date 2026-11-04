import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { sanitizeAutomation, assigneeIds } from "@/components/automation/schema";
import { AUTOMATION_MANAGER_ROLES, validateAssignees } from "@/lib/automation-runtime";

type Ctx = { params: Promise<{ id: string }> };

async function authorize(ctx: Ctx) {
  const { member, response } = await requireOrgMember();
  if (!member) return { response } as const;
  if (!AUTOMATION_MANAGER_ROLES.includes(member.role)) {
    return { response: NextResponse.json({ error: "Only admins and automation managers can change automations" }, { status: 403 }) } as const;
  }
  const { id } = await ctx.params;
  const existing = await prisma.automation.findFirst({ where: { id, organizationId: member.organizationId }, select: { id: true } });
  if (!existing) return { response: NextResponse.json({ error: "Automation not found" }, { status: 404 }) } as const;
  return { member, id } as const;
}

/** Body is either `{ isActive }` (toggle) or a full automation definition (edit). */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await authorize(ctx);
  if (!auth.member) return auth.response;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  if (Object.keys(body).length === 1 && typeof body.isActive === "boolean") {
    const automation = await prisma.automation.update({ where: { id: auth.id }, data: { isActive: body.isActive } });
    return NextResponse.json({ automation });
  }

  const parsed = sanitizeAutomation(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const input = parsed.value;
  const assigneeError = await validateAssignees(auth.member.organizationId, assigneeIds(input.actions));
  if (assigneeError) return NextResponse.json({ error: assigneeError }, { status: 400 });

  const automation = await prisma.automation.update({
    where: { id: auth.id },
    data: {
      name: input.name,
      isActive: input.isActive,
      triggerEvent: input.triggerEvent,
      conditions: input.conditions as never,
      actions: input.actions as never,
    },
  });
  return NextResponse.json({ automation });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await authorize(ctx);
  if (!auth.member) return auth.response;
  await prisma.automation.delete({ where: { id: auth.id } });
  return NextResponse.json({ success: true });
}
