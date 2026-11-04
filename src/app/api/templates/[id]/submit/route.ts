import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { hasUnsupportedParts, rowToDraft, validateDraft } from "@/components/templates/template-utils";
import { canManage, forbidden, submitToMeta } from "../../_lib";

export const maxDuration = 60;
type Params = { params: Promise<{ id: string }> };

/** POST { accountId?: string } — submit a draft, or re-submit a rejected/paused template, to Meta. */
export async function POST(req: NextRequest, { params }: Params) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  if (!canManage(member.role)) return forbidden();
  const { id } = await params;
  const body = (await req.json().catch(() => null)) ?? {};

  const t = await prisma.messageTemplate.findFirst({ where: { id, organizationId: member.organizationId } });
  if (!t) return NextResponse.json({ error: "Template not found" }, { status: 404 });
  if (!["DRAFT", "REJECTED", "PAUSED"].includes(t.status))
    return NextResponse.json({ error: `This template is already ${t.status.toLowerCase()}` }, { status: 400 });

  if (hasUnsupportedParts(t))
    return NextResponse.json({ error: "This template uses media headers or special buttons — edit it in Meta Business Manager, then sync." }, { status: 400 });
  const draft = rowToDraft(t);
  const invalid = validateDraft(draft);
  if (invalid) return NextResponse.json({ error: `${invalid}. Edit the template and try again.` }, { status: 400 });

  const r = await submitToMeta(t, draft, member.organizationId, typeof body.accountId === "string" ? body.accountId : null);
  if (r.error) return NextResponse.json({ error: r.error }, { status: 502 });
  return NextResponse.json({ template: r.template });
}
