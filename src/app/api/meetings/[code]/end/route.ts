import { NextRequest, NextResponse } from "next/server";
import { requireOrgMember } from "@/lib/org-auth";
import { endMeetingRoom, isValidCode, meetingError, noStore, publicRoom } from "@/lib/meetings";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** POST /api/meetings/{code}/end (org member) → ends the room for everyone. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  const { code } = await params;
  if (!isValidCode(code)) return meetingError("Meeting not found", 404, "NOT_FOUND");
  const room = await prisma.meetingRoom.findFirst({ where: { code, organizationId: member.organizationId } });
  if (!room) return meetingError("Meeting not found", 404, "NOT_FOUND");
  await endMeetingRoom(room);
  return NextResponse.json({ room: { ...publicRoom(room), status: "ENDED" } }, { headers: noStore });
}
