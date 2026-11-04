/** [chat] Message shape returned by GET /api/conversations/[id]/messages. */
export interface ChatMessage {
  id: string; wamid?: string | null; direction: "INBOUND" | "OUTBOUND"; type: string; status: string; content: string | null;
  mediaType: string | null; mediaUrl?: string | null; mediaCaption: string | null; templateName: string | null;
  templateData?: unknown; interactive?: unknown;
  failureReason: string | null; isBotMessage: boolean; createdAt: string; updatedAt?: string;
  sentByUser: { id: string; name: string | null } | null; pending?: boolean;
}

export const errText = (e: unknown, f = "Something went wrong") =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? f;
