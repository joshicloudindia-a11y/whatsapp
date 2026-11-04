import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guestUrl, listParticipants, noStore, publicRoom, resolveMeetingAccess } from "@/lib/meetings";

export const dynamic = "force-dynamic";

/**
 * GET /api/meetings/{code}[?t=guestToken] (agent session or guest token)
 * Room info + live participants. Agents also get the guest link and their display name.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const access = await resolveMeetingAccess(code, req.nextUrl.searchParams.get("t"));
  if (access instanceof NextResponse) return access;
  const { room, role } = access;
  const participants = await listParticipants(room.id);

  if (role === "guest") {
    return NextResponse.json({ room: publicRoom(room), role, participants }, { headers: noStore });
  }
  const user = await prisma.user.findUnique({ where: { id: access.userId! }, select: { name: true, email: true } });
  return NextResponse.json(
    {
      room: { ...publicRoom(room), conversationId: room.conversationId },
      role,
      participants,
      me: { name: user?.name || user?.email?.split("@")[0] || "Agent" },
      guestUrl: guestUrl(room, req.nextUrl.origin),
    },
    { headers: noStore },
  );
}
