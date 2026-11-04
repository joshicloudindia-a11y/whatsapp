import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { listMessageTemplates } from "@/lib/whatsapp";
import { metaToColumns, type MetaTemplate } from "@/components/templates/template-utils";
import { activeAccounts, distinctWabas } from "../_lib";

export const maxDuration = 60;

/**
 * POST — pulls every template from each connected WABA and reconciles local rows:
 * updates status / rejection reason / content, imports templates created in Meta
 * Business Manager, and marks submitted templates that no longer exist on Meta as DELETED.
 * Any org member may sync (it only mirrors Meta's state).
 */
export async function POST() {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  const organizationId = member.organizationId;

  const wabas = distinctWabas(await activeAccounts(organizationId));
  if (!wabas.length) return NextResponse.json({ error: "Connect a WhatsApp number in Settings → WhatsApp to sync templates" }, { status: 400 });

  const remote: MetaTemplate[] = [];
  const errors: string[] = [];
  for (const a of wabas) {
    try {
      remote.push(...((await listMessageTemplates(a.wabaId, a.accessToken)) as unknown as MetaTemplate[]));
    } catch (e) {
      errors.push(`${a.displayName}: ${String((e as Error)?.message ?? "failed")}`);
    }
  }
  if (errors.length === wabas.length) return NextResponse.json({ error: errors.join("; ") }, { status: 502 });

  const local = await prisma.messageTemplate.findMany({
    where: { organizationId },
    select: { id: true, name: true, language: true, status: true, metaTemplateId: true, approvedAt: true },
  });
  const byKey = new Map(local.map((t) => [`${t.name}|${t.language}`, t]));
  const byMetaId = new Map(local.filter((t) => t.metaTemplateId).map((t) => [t.metaTemplateId!, t]));

  let imported = 0, updated = 0, removed = 0;
  const seenMetaIds = new Set<string>();
  const now = new Date();

  const ops = remote.filter((m) => m?.id && m.name && m.language).map((m) => async () => {
    seenMetaIds.add(m.id);
    const cols = metaToColumns(m);
    const existing = byMetaId.get(m.id) ?? byKey.get(`${m.name}|${m.language}`);
    const approvedAt = cols.status === "APPROVED" ? (existing?.approvedAt ?? now) : existing?.approvedAt ?? null;
    try {
      if (existing) {
        const changed = existing.status !== cols.status || existing.metaTemplateId !== m.id;
        await prisma.messageTemplate.update({ where: { id: existing.id }, data: { ...cols, approvedAt } });
        if (changed) updated++;
      } else {
        await prisma.messageTemplate.create({ data: { organizationId, ...cols, approvedAt, submittedAt: null } });
        imported++;
      }
    } catch (e) {
      errors.push(`${m.name} (${m.language}): ${String((e as Error)?.message ?? "could not save").slice(0, 120)}`);
    }
  });
  // Small concurrency to stay friendly to the DB.
  for (let i = 0; i < ops.length; i += 8) await Promise.all(ops.slice(i, i + 8).map((f) => f()));

  // Only trust "missing" when every connected WABA answered and every row saved.
  if (!errors.length) {
    const gone = local.filter((t) => t.metaTemplateId && !seenMetaIds.has(t.metaTemplateId) && t.status !== "DRAFT" && t.status !== "DELETED");
    if (gone.length) {
      const r = await prisma.messageTemplate.updateMany({ where: { id: { in: gone.map((t) => t.id) }, organizationId }, data: { status: "DELETED" } });
      removed = r.count;
    }
  }

  return NextResponse.json({ total: remote.length, imported, updated, removed, errors, syncedAt: now.toISOString() });
}
