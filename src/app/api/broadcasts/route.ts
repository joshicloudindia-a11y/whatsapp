import { NextRequest, NextResponse, after } from "next/server";
import type { ContactStage, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { broadcastQuota, placeholdersOf, processDueBroadcasts, resolveVars, runBroadcast, type VarSource } from "@/lib/broadcast-runner";

export const maxDuration = 300;
const STAGES: ContactStage[] = ["LEAD", "PROSPECT", "CUSTOMER", "CHURNED"];
const CAN_SEND = ["ADMIN", "CAMPAIGN_MANAGER"];

export async function GET(req: NextRequest) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  const organizationId = member.organizationId;
  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const search = (sp.get("search") ?? "").trim().slice(0, 100);

  // Opportunistic scheduler: start due / resume stalled broadcasts after responding.
  after(() => processDueBroadcasts(organizationId).catch(() => {}));

  const where: Prisma.BroadcastWhereInput = { organizationId };
  if (status && status !== "ALL") where.status = status as never;
  if (search) where.name = { contains: search };

  const [broadcasts, totals, quota] = await Promise.all([
    prisma.broadcast.findMany({
      where,
      include: { template: { select: { name: true, category: true } }, whatsappAccount: { select: { displayName: true, phoneNumber: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.broadcast.aggregate({
      where: { organizationId },
      _count: { _all: true },
      _sum: { sentCount: true, deliveredCount: true, readCount: true, failedCount: true, totalCount: true },
    }),
    broadcastQuota(organizationId),
  ]);

  return NextResponse.json({
    broadcasts,
    totals: { broadcasts: totals._count._all, ...totals._sum },
    quota: { ...quota, remaining: quota.remaining === Infinity ? null : quota.remaining },
    canSend: CAN_SEND.includes(member.role),
  });
}

export async function POST(req: NextRequest) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  if (!CAN_SEND.includes(member.role)) return NextResponse.json({ error: "Only admins and campaign managers can create broadcasts" }, { status: 403 });
  const organizationId = member.organizationId;

  const body = (await req.json().catch(() => null)) ?? {};
  const name = String(body.name ?? "").trim().slice(0, 120);
  if (name.length < 2) return NextResponse.json({ error: "Give the broadcast a name" }, { status: 400 });

  const [template, account] = await Promise.all([
    prisma.messageTemplate.findFirst({ where: { id: String(body.templateId ?? ""), organizationId }, select: { id: true, status: true, body: true } }),
    prisma.whatsappAccount.findFirst({ where: { id: String(body.whatsappAccountId ?? ""), organizationId }, select: { id: true, isActive: true } }),
  ]);
  if (!template) return NextResponse.json({ error: "Choose a template" }, { status: 400 });
  if (template.status !== "APPROVED") return NextResponse.json({ error: "Only Meta-approved templates can be broadcast" }, { status: 400 });
  if (!account) return NextResponse.json({ error: "Choose a WhatsApp number" }, { status: 400 });
  if (!account.isActive) return NextResponse.json({ error: "That WhatsApp number is disabled" }, { status: 400 });

  const placeholders = placeholdersOf(template.body);
  const mapping: VarSource[] = placeholders.map((_, i) => {
    const m = Array.isArray(body.variables) ? body.variables[i] : null;
    const source = ["name", "phone", "email", "text"].includes(m?.source) ? m.source : "text";
    return { source, value: m?.value ? String(m.value).slice(0, 200) : "" };
  });
  if (mapping.some((m) => m.source === "text" && !m.value)) return NextResponse.json({ error: "Fill in every template variable" }, { status: 400 });

  // Audience (opted-out and blocked contacts are always excluded).
  const aud = body.audience ?? {};
  const where: Prisma.ContactWhereInput = { organizationId, optedOut: false, isBlocked: false };
  if (aud.mode === "tags") {
    const tags = Array.isArray(aud.tags) ? aud.tags.map(String).slice(0, 50) : [];
    if (!tags.length) return NextResponse.json({ error: "Pick at least one tag" }, { status: 400 });
    where.tags = { some: { tag: { in: tags } } };
  } else if (aud.mode === "stage") {
    if (!STAGES.includes(aud.stage)) return NextResponse.json({ error: "Pick a stage" }, { status: 400 });
    where.stage = aud.stage;
  } else if (aud.mode === "contacts") {
    const ids = Array.isArray(aud.contactIds) ? aud.contactIds.map(String).slice(0, 10000) : [];
    if (!ids.length) return NextResponse.json({ error: "Select at least one contact" }, { status: 400 });
    where.id = { in: ids };
  }
  const contacts = await prisma.contact.findMany({ where, select: { id: true, name: true, phone: true, email: true }, take: 50000 });
  if (!contacts.length) return NextResponse.json({ error: "No eligible recipients for this audience" }, { status: 400 });

  const quota = await broadcastQuota(organizationId);
  if (contacts.length > quota.remaining) {
    return NextResponse.json({ error: `This broadcast needs ${contacts.length.toLocaleString("en-IN")} messages but only ${quota.remaining.toLocaleString("en-IN")} are left on your plan this period.` }, { status: 402 });
  }

  const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
  if (scheduledAt && (isNaN(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now() - 60_000)) {
    return NextResponse.json({ error: "Schedule time must be in the future" }, { status: 400 });
  }
  const sendNow = !scheduledAt && body.sendNow === true;

  const broadcast = await prisma.broadcast.create({
    data: {
      organizationId, whatsappAccountId: account.id, templateId: template.id, name,
      status: scheduledAt ? "SCHEDULED" : "DRAFT",
      scheduledAt,
      totalCount: contacts.length,
    },
  });
  for (let i = 0; i < contacts.length; i += 1000) {
    await prisma.broadcastRecipient.createMany({
      data: contacts.slice(i, i + 1000).map((c) => ({ broadcastId: broadcast.id, contactId: c.id, status: "PENDING", variables: resolveVars(mapping, c) })),
    });
  }

  if (sendNow) after(() => runBroadcast(broadcast.id).then(() => undefined).catch((e) => console.error("[broadcast]", e)));
  return NextResponse.json({ broadcast, started: sendNow }, { status: 201 });
}
