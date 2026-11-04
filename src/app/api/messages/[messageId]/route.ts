import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { asExtras, mergeExtras, toggleId } from "@/components/inbox/message-extras";
import { notifyMessageChanged } from "@/app/api/conversations/[id]/_lib/outbound";
import { loadOwnMessage } from "./_lib";

/**
 * PATCH { starred?: boolean, hidden?: boolean } → per-user flags stored in Message.interactive
 * (`starredBy` / `hiddenFor` userId lists). "hidden" is "Delete for me": nothing is deleted and the
 * customer still has the message – the WhatsApp Cloud API has no "delete for everyone".
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ messageId: string }> }) {
  const auth = await requireOrgMember();
  if ("response" in auth) return auth.response;
  const { member } = auth;
  const { messageId } = await params;
  const body = await req.json().catch(() => null);
  const starred = typeof body?.starred === "boolean" ? (body.starred as boolean) : undefined;
  const hidden = typeof body?.hidden === "boolean" ? (body.hidden as boolean) : undefined;
  if (starred === undefined && hidden === undefined) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const msg = await loadOwnMessage(messageId, member.organizationId);
  if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const x = asExtras(msg.interactive);
  const next = mergeExtras(msg.interactive, {
    ...(starred !== undefined && { starredBy: toggleId(x.starredBy, member.userId, starred) }),
    ...(hidden !== undefined && { hiddenFor: toggleId(x.hiddenFor, member.userId, hidden) }),
  });
  await prisma.message.update({ where: { id: msg.id }, data: { interactive: next as Prisma.InputJsonValue } });
  // Stars/hides are personal; only this user's other tabs need refreshing, but the event is cheap.
  if (starred !== undefined) await notifyMessageChanged(msg.conversationId, msg.id);
  return NextResponse.json({ success: true, starred: !!next.starredBy?.includes(member.userId), hidden: !!next.hiddenFor?.includes(member.userId) });
}
