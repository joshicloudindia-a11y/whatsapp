import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { loadConversation } from "@/app/api/conversations/[id]/_lib/outbound";
import {
  ROOM_RATE_LIMIT, agentUrl, createMeetingRoom, guestUrl, meetingError, noStore, publicRoom, roomsCreatedLastHour,
} from "@/lib/meetings";

export const dynamic = "force-dynamic";

/**
 * POST /api/meetings { conversationId?, title? } (org member)
 * Creates a ChatFlow video room → { room, joinUrl (agent, /meetings/<code>), guestUrl (/meet/<code>?t=…) }.
 */
export async function POST(req: NextRequest) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  const body = await req.json().catch(() => null);
  if (body !== null && (typeof body !== "object" || Array.isArray(body))) return meetingError("Invalid JSON");
  const b = (body ?? {}) as Record<string, unknown>;

  let conversationId: string | null = null;
  let contactName: string | null = null;
  if (b.conversationId != null && b.conversationId !== "") {
    if (typeof b.conversationId !== "string" || b.conversationId.length > 64) return meetingError("Invalid conversationId");
    const conv = await loadConversation(b.conversationId, member.organizationId);
    if (!conv) return meetingError("Conversation not found", 404);
    conversationId = conv.id;
    contactName = conv.contact.name;
  }
  if (b.title != null && typeof b.title !== "string") return meetingError("Invalid title");
  let title = typeof b.title === "string" ? b.title.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, 80) : "";
  if (!title) {
    const org = await prisma.organization.findUnique({ where: { id: member.organizationId }, select: { name: true } });
    title = (org?.name ? `Video call with ${org.name}` : contactName ? `Video call with ${contactName}` : "Video call").slice(0, 80);
  }

  if ((await roomsCreatedLastHour(member.organizationId)) >= ROOM_RATE_LIMIT) {
    return meetingError("Too many meetings created in the last hour. Try again later.", 429, "RATE_LIMITED");
  }

  const room = await createMeetingRoom({ organizationId: member.organizationId, createdById: member.userId, conversationId, title });
  const origin = req.nextUrl.origin;
  return NextResponse.json(
    { room: { ...publicRoom(room), conversationId: room.conversationId }, joinUrl: agentUrl(room, origin), guestUrl: guestUrl(room, origin) },
    { status: 201, headers: noStore },
  );
}
