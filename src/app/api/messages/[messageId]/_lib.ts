import { prisma } from "@/lib/prisma";

/** [chat] Loads a message the caller's org owns (with what the action routes need). */
export function loadOwnMessage(messageId: string, organizationId: string) {
  return prisma.message.findFirst({
    where: { id: messageId, organizationId, conversation: { organizationId } },
    select: {
      id: true, conversationId: true, wamid: true, type: true, direction: true, createdAt: true, content: true,
      mediaUrl: true, mediaType: true, mediaCaption: true, templateName: true, interactive: true,
    },
  });
}
export type OwnMessage = NonNullable<Awaited<ReturnType<typeof loadOwnMessage>>>;
