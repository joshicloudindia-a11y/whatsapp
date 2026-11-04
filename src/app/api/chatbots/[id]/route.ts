import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { LIMITS, isTriggerType, sanitizeFlow, validateFlow, validateTrigger } from "@/components/chatbot/flow";

type Ctx = { params: Promise<{ id: string }> };
const MANAGER_ROLES = ["ADMIN", "AUTOMATION_MANAGER"];

export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requireOrgMember();
  if ("response" in auth) return auth.response;
  const { member } = auth;
  const { id } = await params;

  const chatbot = await prisma.chatbot.findFirst({ where: { id, organizationId: member.organizationId } });
  if (!chatbot) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const flow = sanitizeFlow(chatbot.nodes, chatbot.edges);
  const agents = await prisma.organizationMember.findMany({
    where: { organizationId: member.organizationId, isActive: true },
    select: { userId: true, role: true, user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    chatbot: { ...chatbot, nodes: flow.nodes, edges: flow.edges },
    agents: agents.map((a) => ({ id: a.userId, name: a.user.name ?? a.user.email, role: a.role })),
    canManage: MANAGER_ROLES.includes(member.role),
  });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireOrgMember();
  if ("response" in auth) return auth.response;
  const { member } = auth;
  if (!MANAGER_ROLES.includes(member.role)) {
    return NextResponse.json({ error: "Only admins and automation managers can edit chatbots" }, { status: 403 });
  }
  const { id } = await params;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const existing = await prisma.chatbot.findFirst({ where: { id, organizationId: member.organizationId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim().slice(0, LIMITS.name) : "";
    if (name.length < 2) return NextResponse.json({ error: "Name must be at least 2 characters" }, { status: 400 });
    data.name = name;
  }
  if (body.description !== undefined) {
    data.description = typeof body.description === "string" ? body.description.trim().slice(0, LIMITS.description) || null : null;
  }
  if (body.triggerType !== undefined) {
    if (!isTriggerType(body.triggerType)) return NextResponse.json({ error: "Unknown trigger type" }, { status: 400 });
    data.triggerType = body.triggerType;
  }
  if (body.triggerValue !== undefined) {
    data.triggerValue = typeof body.triggerValue === "string" ? body.triggerValue.trim().slice(0, LIMITS.trigger) || null : null;
  }
  let flow = sanitizeFlow(existing.nodes, existing.edges);
  if (body.nodes !== undefined || body.edges !== undefined) {
    flow = sanitizeFlow(body.nodes ?? existing.nodes, body.edges ?? existing.edges);
    data.nodes = flow.nodes;
    data.edges = flow.edges;
  }
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== "boolean") return NextResponse.json({ error: "isActive must be a boolean" }, { status: 400 });
    data.isActive = body.isActive;
  }

  // An active bot must always have a valid trigger and flow.
  const willBeActive = (data.isActive as boolean | undefined) ?? existing.isActive;
  if (willBeActive) {
    const nextType = (data.triggerType as string | undefined) ?? existing.triggerType;
    const nextValue = "triggerValue" in data ? (data.triggerValue as string | null) : existing.triggerValue;
    const trig = validateTrigger(nextType, nextValue);
    const errors = validateFlow(flow.nodes, flow.edges).filter((i) => i.level === "error");
    if (trig || errors.length) {
      return NextResponse.json({
        error: trig ?? `Fix ${errors.length} issue${errors.length === 1 ? "" : "s"} before activating: ${errors[0].message}`,
        issues: errors, code: "INVALID_FLOW",
      }, { status: 400 });
    }
  }

  const chatbot = await prisma.chatbot.update({ where: { id: existing.id }, data });

  // Deactivating stops any conversations currently inside the bot.
  if (existing.isActive && data.isActive === false) {
    await prisma.chatbotSession.updateMany({ where: { chatbotId: id, isActive: true }, data: { isActive: false, endedAt: new Date() } });
  }

  return NextResponse.json({ chatbot: { ...chatbot, nodes: flow.nodes, edges: flow.edges } });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await requireOrgMember();
  if ("response" in auth) return auth.response;
  const { member } = auth;
  if (!MANAGER_ROLES.includes(member.role)) {
    return NextResponse.json({ error: "Only admins and automation managers can delete chatbots" }, { status: 403 });
  }
  const { id } = await params;
  const res = await prisma.chatbot.deleteMany({ where: { id, organizationId: member.organizationId } });
  if (res.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
