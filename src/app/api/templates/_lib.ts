// Server-only helpers shared by the /api/templates route handlers (not a route itself).
import { NextResponse } from "next/server";
import type { MessageTemplate, TemplateStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createMessageTemplate, editMessageTemplate } from "@/lib/whatsapp";
import { buildComponents, mapMetaStatus, TEMPLATE_MANAGER_ROLES, TEMPLATE_CATEGORIES, type TemplateDraft, type TemplateCategoryT } from "@/components/templates/template-utils";

export const canManage = (role: string) => TEMPLATE_MANAGER_ROLES.includes(role);
export const forbidden = () => NextResponse.json({ error: "Only admins and template managers can manage templates" }, { status: 403 });

/** Broadcast statuses that still need their template. */
export const ACTIVE_BROADCAST_STATUSES = ["DRAFT", "SCHEDULED", "RUNNING", "PAUSED"] as const;

export async function activeAccounts(organizationId: string) {
  return prisma.whatsappAccount.findMany({
    where: { organizationId, isActive: true },
    select: { id: true, displayName: true, phoneNumber: true, wabaId: true, accessToken: true },
    orderBy: { createdAt: "asc" },
  });
}

/** One account per WhatsApp Business Account (templates belong to the WABA, not the number). */
export function distinctWabas<T extends { wabaId: string }>(accounts: T[]): T[] {
  const seen = new Set<string>();
  return accounts.filter((a) => a.wabaId && !seen.has(a.wabaId) && (seen.add(a.wabaId), true));
}

export const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === "P2002";
export const duplicateNameResponse = () =>
  NextResponse.json({ error: "A template with this name and language already exists. Pick another name." }, { status: 409 });

/**
 * Submits a stored template to Meta. Re-submits rejected/paused templates through the edit
 * endpoint (Meta won't accept a second create with the same name). Never throws; returns
 * the updated row or an error message (the row is left unchanged on failure).
 */
export async function submitToMeta(
  template: MessageTemplate,
  draft: TemplateDraft,
  organizationId: string,
  accountId?: string | null
): Promise<{ template: MessageTemplate; error?: string }> {
  const accounts = await activeAccounts(organizationId);
  const account = (accountId && accounts.find((a) => a.id === accountId)) || accounts[0];
  if (!account) return { template, error: "Connect a WhatsApp number in Settings → WhatsApp before submitting templates" };

  const components = buildComponents(draft);
  try {
    let status: TemplateStatus = "PENDING";
    let metaTemplateId = template.metaTemplateId;
    let category = draft.category as TemplateCategoryT;
    if (template.metaTemplateId && template.status !== "DRAFT") {
      await editMessageTemplate(template.metaTemplateId, account.accessToken, {
        ...(template.status !== "APPROVED" && { category: draft.category }),
        components,
      });
    } else {
      const res = await createMessageTemplate(account.wabaId, account.accessToken, {
        name: draft.name, category: draft.category, language: draft.language, components,
      });
      metaTemplateId = res.id;
      if (res.status) status = mapMetaStatus(res.status);
      if (res.category && (TEMPLATE_CATEGORIES as readonly string[]).includes(res.category)) category = res.category as TemplateCategoryT;
    }
    const now = new Date();
    const updated = await prisma.messageTemplate.update({
      where: { id: template.id },
      data: {
        status, metaTemplateId, category, submittedAt: now, rejectionReason: null,
        approvedAt: status === "APPROVED" ? now : null,
      },
    });
    return { template: updated };
  } catch (e) {
    const msg = String((e as Error)?.message ?? "Meta rejected the submission").slice(0, 500);
    return {
      template,
      error: /already exists|duplicate/i.test(msg) ? `${msg} — use "Sync from Meta" to import the existing template.` : msg,
    };
  }
}

/** Fields safe to send to the browser. */
export const templateSelect = {
  id: true, name: true, category: true, language: true, status: true, metaTemplateId: true,
  headerType: true, headerContent: true, body: true, footer: true, buttons: true,
  rejectionReason: true, submittedAt: true, approvedAt: true, createdAt: true, updatedAt: true,
  _count: { select: { broadcasts: true } },
} as const;
