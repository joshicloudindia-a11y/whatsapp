import { NextRequest, NextResponse } from "next/server";
import { requireOrgMember } from "@/lib/org-auth";
import { getCallingStatus, getCallPermission, type CallPermission } from "@/lib/calling";
import { loadConversation, windowIsOpen } from "@/lib/calling-access";

export const dynamic = "force-dynamic";

// Meta rate-limits the permission lookup (error 613) – cache briefly per number + customer.
const permCache = new Map<string, { at: number; value: CallPermission }>();
const PERM_TTL_MS = 30_000;

/**
 * GET /api/calls/status?conversationId=…[&fresh=1]
 * Calling eligibility of the conversation's number, the customer's call permission and the fallbacks available.
 */
export async function GET(req: NextRequest) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  const fresh = req.nextUrl.searchParams.get("fresh") === "1";

  const loaded = await loadConversation(member.organizationId, req.nextUrl.searchParams.get("conversationId"));
  if (!loaded.conversation) return loaded.response;
  const { contact, whatsappAccount } = loaded.conversation;

  const calling = await getCallingStatus(whatsappAccount, { fresh });

  let permission: CallPermission | null = null;
  if (calling.enabled && !contact.isBlocked && !contact.optedOut) {
    const key = `${whatsappAccount.phoneNumberId}:${contact.phone}`;
    const hit = permCache.get(key);
    if (!fresh && hit && Date.now() - hit.at < PERM_TTL_MS) permission = hit.value;
    else {
      permission = await getCallPermission(whatsappAccount, contact.phone);
      permCache.set(key, { at: Date.now(), value: permission });
    }
  }

  const windowOpen = windowIsOpen(loaded.conversation);
  const blockedReason = contact.isBlocked ? "This contact is blocked." : contact.optedOut ? "This contact unsubscribed (STOP)." : !whatsappAccount.isActive ? "This WhatsApp number is disabled." : null;

  return NextResponse.json({
    calling,
    permission,
    windowOpen,
    blockedReason,
    canCall: !blockedReason && calling.businessInitiatedAllowed && permission?.canStartCall !== false && (permission?.status === "temporary" || permission?.status === "permanent" || permission?.status === "unknown"),
    // A free-form permission request needs the 24 h window (outside it, an approved call_permission_request template is required).
    canRequestPermission: !blockedReason && calling.enabled && windowOpen && permission?.status !== "permanent" && permission?.canRequestPermission !== false,
    phone: contact.phone,
    whatsappAccountId: whatsappAccount.id,
    // Org admins may switch calling on for the number straight from the inbox.
    canManageCalling: member.role === "ADMIN",
  });
}
