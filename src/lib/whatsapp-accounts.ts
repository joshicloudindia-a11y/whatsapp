import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * A removed number that still has conversations or broadcasts can't be hard-deleted (their history
 * references it), so it is archived instead: disabled, token wiped, and its phoneNumberId prefixed so
 * webhooks no longer route to it and the number can be connected again — to this or another organization.
 */
export const ARCHIVED_PREFIX = "removed:";

/** Prisma filter that hides archived (removed) numbers. */
export const notArchived = { NOT: { phoneNumberId: { startsWith: ARCHIVED_PREFIX } } } satisfies Prisma.WhatsappAccountWhereInput;

export async function removeWhatsappAccount(id: string): Promise<"deleted" | "archived"> {
  const [conversations, broadcasts] = await Promise.all([
    prisma.conversation.count({ where: { whatsappAccountId: id } }),
    prisma.broadcast.count({ where: { whatsappAccountId: id } }),
  ]);
  if (!conversations && !broadcasts) {
    await prisma.whatsappAccount.delete({ where: { id } });
    return "deleted";
  }
  const acc = await prisma.whatsappAccount.findUnique({ where: { id }, select: { phoneNumberId: true } });
  if (!acc) return "deleted";
  if (!acc.phoneNumberId.startsWith(ARCHIVED_PREFIX)) {
    await prisma.whatsappAccount.update({
      where: { id },
      data: { isActive: false, accessToken: "", phoneNumberId: `${ARCHIVED_PREFIX}${Date.now()}:${acc.phoneNumberId}`.slice(0, 190) },
    });
  }
  return "archived";
}
