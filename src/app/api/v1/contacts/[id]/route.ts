import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseIntlPhone } from "@/lib/messaging";
import { toApiContact } from "@/lib/outgoing-webhooks";
import { apiError, readJson, withApiKey } from "../../_lib/api";
import { contactSelect, parseContactPatch, patchToData } from "../../_lib/contacts";

export const dynamic = "force-dynamic";

/** `{id}` may be the contact id or its phone number (digits with country code). */
async function findContactId(organizationId: string, idOrPhone: string) {
  if (!idOrPhone || idOrPhone.length > 64) return null;
  const phone = /^\+?\d+$/.test(idOrPhone) ? parseIntlPhone(idOrPhone) : null;
  const c = await prisma.contact.findFirst({
    where: { organizationId, OR: [{ id: idOrPhone }, ...(phone ? [{ phone }] : [])] },
    select: { id: true },
  });
  return c?.id ?? null;
}

/** GET /api/v1/contacts/{id} */
export const GET = withApiKey<{ id: string }>(async (_req, { organizationId }, { id }) => {
  const contactId = await findContactId(organizationId, decodeURIComponent(id));
  if (!contactId) return apiError(404, "NOT_FOUND", "Contact not found.");
  const contact = await prisma.contact.findUnique({ where: { id: contactId }, select: contactSelect });
  if (!contact) return apiError(404, "NOT_FOUND", "Contact not found.");
  return NextResponse.json({ contact: toApiContact(contact) });
});

/** PATCH /api/v1/contacts/{id} { name?, email?, stage?, tags? (replaces), optedOut? } */
export const PATCH = withApiKey<{ id: string }>(async (req, { organizationId }, { id }) => {
  const body = await readJson(req);
  if (!body) return apiError(400, "INVALID_JSON", "Request body must be a JSON object.");
  const parsed = parseContactPatch(body);
  if ("error" in parsed) return apiError(400, "VALIDATION_ERROR", parsed.error);
  if (Object.keys(parsed.patch).length === 0) return apiError(400, "VALIDATION_ERROR", "Provide at least one of name, email, stage, tags, optedOut.");

  const contactId = await findContactId(organizationId, decodeURIComponent(id));
  if (!contactId) return apiError(404, "NOT_FOUND", "Contact not found.");
  const contact = await prisma.contact.update({ where: { id: contactId }, data: patchToData(parsed.patch), select: contactSelect });
  return NextResponse.json({ contact: toApiContact(contact) });
});
