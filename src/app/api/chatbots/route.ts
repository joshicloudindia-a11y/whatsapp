import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { LIMITS, isTriggerType, sanitizeFlow } from "@/components/chatbot/flow";

const MANAGER_ROLES = ["ADMIN", "AUTOMATION_MANAGER"];
const DAY = 24 * 60 * 60 * 1000;

export async function GET() {
  const auth = await requireOrgMember();
  if ("response" in auth) return auth.response;
  const { member } = auth;

  const chatbots = await prisma.chatbot.findMany({
    where: { organizationId: member.organizationId },
    orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
  });
  const ids = chatbots.map((c) => c.id);
  const since = new Date(Date.now() - 7 * DAY);

  const [all, active, recent] = ids.length
    ? await Promise.all([
        prisma.chatbotSession.groupBy({ by: ["chatbotId"], where: { chatbotId: { in: ids } }, _count: { _all: true }, _max: { startedAt: true } }),
        prisma.chatbotSession.groupBy({ by: ["chatbotId"], where: { chatbotId: { in: ids }, isActive: true }, _count: { _all: true } }),
        prisma.chatbotSession.groupBy({ by: ["chatbotId"], where: { chatbotId: { in: ids }, startedAt: { gte: since } }, _count: { _all: true } }),
      ])
    : [[], [], []];

  const list = chatbots.map((c) => {
    const a = all.find((x) => x.chatbotId === c.id);
    return {
      id: c.id, name: c.name, description: c.description, isActive: c.isActive,
      triggerType: c.triggerType, triggerValue: c.triggerValue,
      createdAt: c.createdAt, updatedAt: c.updatedAt,
      nodeCount: Array.isArray(c.nodes) ? c.nodes.length : 0,
      stats: {
        sessions: a?._count._all ?? 0,
        active: active.find((x) => x.chatbotId === c.id)?._count._all ?? 0,
        last7d: recent.find((x) => x.chatbotId === c.id)?._count._all ?? 0,
        lastTriggeredAt: a?._max.startedAt ?? null,
      },
    };
  });

  return NextResponse.json({ chatbots: list, canManage: MANAGER_ROLES.includes(member.role) });
}

export async function POST(req: NextRequest) {
  const auth = await requireOrgMember();
  if ("response" in auth) return auth.response;
  const { member } = auth;
  if (!MANAGER_ROLES.includes(member.role)) {
    return NextResponse.json({ error: "Only admins and automation managers can create chatbots" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  // Duplicate an existing bot from the same organization.
  if (typeof body.duplicateOf === "string") {
    const src = await prisma.chatbot.findFirst({ where: { id: body.duplicateOf, organizationId: member.organizationId } });
    if (!src) return NextResponse.json({ error: "Chatbot not found" }, { status: 404 });
    const flow = sanitizeFlow(src.nodes, src.edges);
    const chatbot = await prisma.chatbot.create({
      data: {
        organizationId: member.organizationId,
        name: `${src.name} (copy)`.slice(0, LIMITS.name),
        description: src.description,
        triggerType: src.triggerType,
        triggerValue: src.triggerValue,
        isActive: false,
        nodes: flow.nodes as never,
        edges: flow.edges as never,
      },
    });
    return NextResponse.json({ chatbot }, { status: 201 });
  }

  const name = typeof body.name === "string" ? body.name.trim().slice(0, LIMITS.name) : "";
  if (name.length < 2) return NextResponse.json({ error: "Name must be at least 2 characters" }, { status: 400 });
  const triggerType = isTriggerType(body.triggerType) ? body.triggerType : "KEYWORD";
  const description = typeof body.description === "string" ? body.description.trim().slice(0, LIMITS.description) || null : null;
  const triggerValue = typeof body.triggerValue === "string" ? body.triggerValue.trim().slice(0, LIMITS.trigger) || null : null;
  const flow = sanitizeFlow(body.nodes, body.edges);

  const chatbot = await prisma.chatbot.create({
    data: {
      organizationId: member.organizationId,
      name, description, triggerType, triggerValue,
      isActive: false, // bots are always activated explicitly, after validation
      nodes: flow.nodes as never,
      edges: flow.edges as never,
    },
  });

  return NextResponse.json({ chatbot }, { status: 201 });
}
