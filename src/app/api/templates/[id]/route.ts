import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { deleteMessageTemplate } from "@/lib/whatsapp";
import { coerceDraft, draftToColumns, hasUnsupportedParts, validateDraft } from "@/components/templates/template-utils";
import {
  ACTIVE_BROADCAST_STATUSES, activeAccounts, canManage, distinctWabas, duplicateNameResponse, forbidden,
  isUniqueViolation, submitToMeta, templateSelect,
} from "../_lib";

export const maxDuration = 60;
type Params = { params: Promise<{ id: string }> };

/** Statuses whose content can still be changed locally. */
const EDITABLE = ["DRAFT", "REJECTED", "PAUSED"];

export async function GET(_req: NextRequest, { params }: Params) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  const { id } = await params;
  const template = await prisma.messageTemplate.findFirst({ where: { id, organizationId: member.organizationId }, select: templateSelect });
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });
  const broadcasts = await prisma.broadcast.findMany({
    where: { templateId: id, organizationId: member.organizationId },
    select: { id: true, name: true, status: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  return NextResponse.json({ template, broadcasts });
}

/** PATCH { ...draft, submit?: boolean, accountId?: string } — edit a draft/rejected/paused template. */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  if (!canManage(member.role)) return forbidden();
  const { id } = await params;

  const existing = await prisma.messageTemplate.findFirst({ where: { id, organizationId: member.organizationId } });
  if (!existing) return NextResponse.json({ error: "Template not found" }, { status: 404 });
  if (!EDITABLE.includes(existing.status))
    return NextResponse.json({ error: `${existing.status.toLowerCase()} templates can't be edited — duplicate it instead` }, { status: 400 });

  if (hasUnsupportedParts(existing))
    return NextResponse.json({ error: "This template uses media headers or special buttons — edit it in Meta Business Manager, then sync." }, { status: 400 });

  const raw = await req.json().catch(() => null);
  if (!raw || typeof raw !== "object") return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const draft = coerceDraft(raw);
  // Meta templates can't be renamed or moved to another language once created.
  if (existing.metaTemplateId && existing.status !== "DRAFT") {
    draft.name = existing.name;
    draft.language = existing.language;
  }
  const invalid = validateDraft(draft);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  let template;
  try {
    template = await prisma.messageTemplate.update({ where: { id }, data: draftToColumns(draft) });
  } catch (e) {
    if (isUniqueViolation(e)) return duplicateNameResponse();
    throw e;
  }

  if (raw.submit === true) {
    const r = await submitToMeta(template, draft, member.organizationId, typeof raw.accountId === "string" ? raw.accountId : null);
    return NextResponse.json({ template: r.template, submitted: !r.error, submitError: r.error });
  }
  return NextResponse.json({ template, submitted: false });
}

/**
 * DELETE ?localOnly=1 — deletes on Meta first (when it was submitted), then locally.
 * Blocked while a broadcast that isn't finished still uses the template. Templates used by
 * finished broadcasts are kept as DELETED so broadcast reports keep their template.
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  if (!canManage(member.role)) return forbidden();
  const { id } = await params;
  const localOnly = req.nextUrl.searchParams.get("localOnly") === "1";

  const t = await prisma.messageTemplate.findFirst({ where: { id, organizationId: member.organizationId } });
  if (!t) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  const blocking = await prisma.broadcast.findMany({
    where: { templateId: id, organizationId: member.organizationId, status: { in: [...ACTIVE_BROADCAST_STATUSES] } },
    select: { name: true },
    take: 3,
  });
  if (blocking.length) {
    return NextResponse.json({
      error: `This template is used by broadcast${blocking.length > 1 ? "s" : ""} ${blocking.map((b) => `"${b.name}"`).join(", ")} that ${blocking.length > 1 ? "aren't" : "isn't"} finished. Delete or finish ${blocking.length > 1 ? "them" : "it"} first.`,
    }, { status: 409 });
  }

  let metaDeleted = false;
  if (t.metaTemplateId && t.status !== "DRAFT" && t.status !== "DELETED" && !localOnly) {
    const wabas = distinctWabas(await activeAccounts(member.organizationId));
    let lastError = wabas.length ? "" : "No active WhatsApp number is connected, so it can't be deleted on Meta.";
    for (const a of wabas) {
      try {
        await deleteMessageTemplate(a.wabaId, a.accessToken, t.name, t.metaTemplateId);
        metaDeleted = true;
        break;
      } catch (e) {
        const msg = String((e as Error)?.message ?? "");
        // Already gone on Meta — treat as deleted.
        if (/not found|does not exist|nonexisting|no template/i.test(msg)) { metaDeleted = true; break; }
        lastError = msg;
      }
    }
    if (!metaDeleted) {
      return NextResponse.json({ error: `Couldn't delete on Meta: ${lastError}`, canDeleteLocally: true }, { status: 502 });
    }
  }

  const used = await prisma.broadcast.count({ where: { templateId: id } });
  if (used > 0) await prisma.messageTemplate.update({ where: { id }, data: { status: "DELETED" } });
  else await prisma.messageTemplate.delete({ where: { id } });

  return NextResponse.json({ success: true, metaDeleted, archived: used > 0 });
}
