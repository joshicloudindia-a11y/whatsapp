import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { sendReaction } from "@/lib/whatsapp";
import { applyReaction, asExtras, mergeExtras } from "@/components/inbox/message-extras";
import { bad, errMessage, guardSend, loadConversation, notifyMessageChanged } from "@/app/api/conversations/[id]/_lib/outbound";
import { loadOwnMessage } from "../_lib";

/** Accepts one emoji (incl. ZWJ sequences, skin tones, flags, keycaps); "" is handled by the caller. */
function isSingleEmoji(s: string) {
  if (s.length > 16) return false;
  if (!/^[\p{Extended_Pictographic}\p{Emoji_Component}\u200d\ufe0f\u20e3]+$/u.test(s)) return false;
  return /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(s);
}

const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // Meta rejects reactions to messages older than 30 days.

/**
 * POST { emoji } → reacts to a message as the business (Cloud API `type: "reaction"`).
 * `emoji: ""` removes the reaction. No chat bubble is created: the reaction is attached to the target
 * in `interactive.reactions`. Requires an open 24h window (reactions are free-form messages).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ messageId: string }> }) {
  const auth = await requireOrgMember();
  if ("response" in auth) return auth.response;
  const { member } = auth;
  const { messageId } = await params;
  const body = await req.json().catch(() => null);
  const emoji = typeof body?.emoji === "string" ? body.emoji.trim() : null;
  if (emoji === null || (emoji && !isSingleEmoji(emoji))) return bad("Choose a single emoji.");

  try {
    const msg = await loadOwnMessage(messageId, member.organizationId);
    if (!msg) return bad("Not found", 404);
    if (!msg.wamid) return bad("This message never reached WhatsApp, so it can't be reacted to.");
    if (msg.type === "REACTION" || msg.type === "SYSTEM") return bad("You can't react to this message.");
    if (Date.now() - msg.createdAt.getTime() > MAX_AGE_MS) return bad("WhatsApp only allows reactions to messages from the last 30 days.");

    const conversation = await loadConversation(msg.conversationId, member.organizationId);
    if (!conversation) return bad("Not found", 404);
    const blocked = guardSend(conversation, true);
    if (blocked) return blocked;

    await sendReaction({
      to: conversation.contact.phone, messageId: msg.wamid, emoji,
      accessToken: conversation.whatsappAccount.accessToken, phoneNumberId: conversation.whatsappAccount.phoneNumberId,
    });

    const reactions = applyReaction(asExtras(msg.interactive).reactions, emoji || null, { userId: member.userId });
    const next = mergeExtras(msg.interactive, { reactions, reactionError: undefined });
    await prisma.message.update({ where: { id: msg.id }, data: { interactive: next as Prisma.InputJsonValue } });
    await notifyMessageChanged(msg.conversationId, msg.id);
    return NextResponse.json({ success: true, reactions: reactions ?? {} });
  } catch (e) {
    console.error("Reaction error:", e);
    return bad(errMessage(e, "Reaction not sent"), 502, "SEND_FAILED");
  }
}
