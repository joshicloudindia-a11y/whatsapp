import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CallingError, readCall, type CallRecord } from "@/lib/calling";

/** Shared, org-scoped loaders for the /api/calls routes. */

export const jsonError = (error: string, status = 400, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error, ...extra }, { status });

export function errorResponse(e: unknown, fallback = "Something went wrong") {
  if (e instanceof CallingError) return jsonError(e.message, e.status, { code: e.code ?? null });
  console.error("[calls]", e);
  return jsonError(e instanceof Error ? e.message : fallback, 500);
}

/** Conversation + contact + number, only if they all belong to the org. */
export async function loadConversation(organizationId: string, conversationId: unknown) {
  if (typeof conversationId !== "string" || !conversationId) return { response: jsonError("conversationId is required") } as const;
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, organizationId, whatsappAccount: { organizationId }, contact: { organizationId } },
    include: { contact: true, whatsappAccount: true },
  });
  if (!conversation) return { response: jsonError("Conversation not found", 404) } as const;
  return { conversation } as const;
}

export type LoadedConversation = NonNullable<Awaited<ReturnType<typeof loadConversation>>["conversation"]>;

/** Refuses blocked / opted-out contacts and disabled numbers. */
export function contactGuard(c: LoadedConversation, opts: { allowOptedOut?: boolean } = {}) {
  if (c.contact.isBlocked) return jsonError("This contact is blocked.", 422, { code: "CONTACT_BLOCKED" });
  if (!opts.allowOptedOut && c.contact.optedOut) {
    return jsonError("This contact unsubscribed (STOP). They must message START before you can contact them.", 422, { code: "OPTED_OUT" });
  }
  if (!c.whatsappAccount.isActive) return jsonError("This WhatsApp number is disabled. Enable it in Settings → WhatsApp.", 400, { code: "ACCOUNT_DISABLED" });
  return null;
}

export const windowIsOpen = (c: { sessionExpiresAt: Date | null }) => !!c.sessionExpiresAt && c.sessionExpiresAt > new Date();

/** A call Message (our Message id) in the org, with its conversation, contact and number. */
export async function loadCallMessage(organizationId: string, messageId: string) {
  const message = await prisma.message.findFirst({
    where: { id: messageId, organizationId, type: "SYSTEM" },
    include: { conversation: { include: { contact: true, whatsappAccount: true } } },
  });
  const call = message ? readCall(message.templateData) : null;
  if (!message || !call || message.conversation.organizationId !== organizationId) {
    return { response: jsonError("Call not found", 404) } as const;
  }
  return { message, call: call as CallRecord } as const;
}

/** Accepts a WebRTC SDP string from the browser (basic sanity checks, 64 KB cap). */
export function parseSdp(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const sdp = v.trim();
  if (sdp.length < 20 || sdp.length > 65_536 || !sdp.startsWith("v=0") || !/\r?\nm=audio /.test(sdp)) return null;
  // Normalise to CRLF line endings (RFC 8866).
  return sdp.replace(/\r?\n/g, "\r\n").replace(/(\r\n)?$/, "\r\n");
}
