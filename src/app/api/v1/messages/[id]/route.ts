import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toApiMessage } from "@/lib/outgoing-webhooks";
import { apiError, withApiKey } from "../../_lib/api";

export const dynamic = "force-dynamic";

/** GET /api/v1/messages/{id} — accepts our message id or the WhatsApp wamid. */
export const GET = withApiKey<{ id: string }>(async (_req, { organizationId }, { id }) => {
  if (!id || id.length > 200) return apiError(404, "NOT_FOUND", "Message not found.");
  const message = await prisma.message.findFirst({
    where: { organizationId, OR: [{ id }, { wamid: id }] },
    include: { conversation: { select: { contact: { select: { phone: true } } } } },
  });
  if (!message) return apiError(404, "NOT_FOUND", "Message not found.");
  return NextResponse.json({ message: toApiMessage(message, message.conversation.contact.phone) });
});
