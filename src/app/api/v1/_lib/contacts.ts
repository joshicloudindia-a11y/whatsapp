import type { Prisma } from "@prisma/client";
import { STAGES, cleanTags, isEmail, type Stage } from "@/components/contacts/shared";

export const contactSelect = {
  id: true, phone: true, name: true, email: true, stage: true, optedOut: true, isBlocked: true,
  lastSeenAt: true, createdAt: true, updatedAt: true,
  tags: { select: { tag: true }, orderBy: { tag: "asc" } },
} satisfies Prisma.ContactSelect;

export interface ContactPatch {
  name?: string | null;
  email?: string | null;
  stage?: Stage;
  optedOut?: boolean;
  tags?: string[];
}

/** Validates the writable contact fields of a request body. Only keys present in the body are returned. */
export function parseContactPatch(body: Record<string, unknown>): { patch: ContactPatch } | { error: string } {
  const patch: ContactPatch = {};
  if ("name" in body) {
    if (body.name !== null && typeof body.name !== "string") return { error: "`name` must be a string or null." };
    const n = (body.name as string | null)?.trim().replace(/\s+/g, " ") || null;
    if (n && n.length > 120) return { error: "`name` can be at most 120 characters." };
    patch.name = n;
  }
  if ("email" in body) {
    if (body.email !== null && typeof body.email !== "string") return { error: "`email` must be a string or null." };
    const e = (body.email as string | null)?.trim().toLowerCase() || null;
    if (e && !isEmail(e)) return { error: "`email` is not a valid email address." };
    patch.email = e;
  }
  if ("stage" in body) {
    const s = typeof body.stage === "string" ? body.stage.toUpperCase() : "";
    if (!STAGES.includes(s as Stage)) return { error: `\`stage\` must be one of ${STAGES.join(", ").toLowerCase()}.` };
    patch.stage = s as Stage;
  }
  if ("optedOut" in body) {
    if (typeof body.optedOut !== "boolean") return { error: "`optedOut` must be a boolean." };
    patch.optedOut = body.optedOut;
  }
  if ("tags" in body) {
    if (!Array.isArray(body.tags) || body.tags.some((t) => typeof t !== "string")) return { error: "`tags` must be an array of strings." };
    patch.tags = cleanTags(body.tags);
  }
  return { patch };
}

/** Prisma data for a patch; tags are replaced with the given set. */
export function patchToData(p: ContactPatch): Prisma.ContactUpdateInput {
  return {
    ...(p.name !== undefined && { name: p.name }),
    ...(p.email !== undefined && { email: p.email }),
    ...(p.stage !== undefined && { stage: p.stage }),
    ...(p.optedOut !== undefined && { optedOut: p.optedOut }),
    ...(p.tags !== undefined && {
      tags: { deleteMany: {}, ...(p.tags.length > 0 && { createMany: { data: p.tags.map((tag) => ({ tag })), skipDuplicates: true } }) },
    }),
  };
}
