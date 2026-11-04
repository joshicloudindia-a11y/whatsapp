import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  MAX_PAYLOAD_BYTES, SIGNAL_RATE_LIMIT, SIGNAL_TTL_MS, isRoomLive, isValidPeer, listParticipants, meetingError, noStore,
  parseSignal, peerRole, pollSignals, recentSignalCount, resolveMeetingAccess, writeSignal,
} from "@/lib/meetings";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

/**
 * POST /api/meetings/{code}/signal[?t=guestToken] { fromPeer, toPeer?, type, payload? }
 * `join` is refused when the room is full (maxParticipants) and answers with the participants + a poll cursor.
 * Also used by navigator.sendBeacon for `leave` on tab close (body is a JSON Blob, token in the query).
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const { code } = await params;
  const raw = await req.text().catch(() => "");
  if (Buffer.byteLength(raw) > MAX_PAYLOAD_BYTES + 1024) return meetingError("Payload too large", 413);
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    return meetingError("Invalid JSON");
  }

  const access = await resolveMeetingAccess(code, req.nextUrl.searchParams.get("t"));
  if (access instanceof NextResponse) return access;
  const { room } = access;

  const type = (body as { type?: unknown } | null)?.type;
  const needsName = access.role === "agent" && (type === "join" || type === "heartbeat" || type === "state" || type === "chat");
  const agentName = needsName
    ? await prisma.user.findUnique({ where: { id: access.userId! }, select: { name: true, email: true } }).then((u) => u?.name || u?.email?.split("@")[0] || null)
    : null;

  const signal = parseSignal(body, access, agentName);
  if (typeof signal === "string") return meetingError(signal);

  if (!isRoomLive(room)) {
    if (signal.type === "leave") return NextResponse.json({ ok: true, status: "ENDED" }, { headers: noStore });
    return meetingError("This meeting has ended", 410, "ENDED");
  }

  if ((await recentSignalCount(room.id)) >= SIGNAL_RATE_LIMIT) return meetingError("Slow down", 429, "RATE_LIMITED");

  if (signal.type === "join") {
    const others = (await listParticipants(room.id)).filter((p) => p.peer !== signal.fromPeer);
    if (others.length >= room.maxParticipants) {
      return meetingError(`This meeting is full (max ${room.maxParticipants} people).`, 409, "ROOM_FULL");
    }
    const row = await writeSignal(room.id, signal);
    return NextResponse.json({ ok: true, id: row.id, cursor: row.createdAt.toISOString(), participants: others }, { headers: noStore });
  }

  const row = await writeSignal(room.id, signal);
  return NextResponse.json({ ok: true, id: row.id, createdAt: row.createdAt.toISOString() }, { headers: noStore });
}

/**
 * GET /api/meetings/{code}/signal?peer=&since=[&t=]
 * Signals addressed to `peer` or broadcast since `since` (ISO or ms; the server subtracts a small overlap – dedupe by id),
 * plus the live participant list and the room status.
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  const { code } = await params;
  const sp = req.nextUrl.searchParams;
  const access = await resolveMeetingAccess(code, sp.get("t"));
  if (access instanceof NextResponse) return access;
  const peer = sp.get("peer");
  if (!isValidPeer(peer) || peerRole(peer) !== access.role) return meetingError("Invalid peer id");

  const now = Date.now();
  const sinceRaw = sp.get("since") ?? "";
  const sinceMs = /^\d+$/.test(sinceRaw) ? Number(sinceRaw) : Date.parse(sinceRaw);
  const since = new Date(Number.isFinite(sinceMs) ? Math.min(Math.max(sinceMs, now - SIGNAL_TTL_MS), now + 60_000) : now - 5_000);

  const { room } = access;
  const [signals, participants] = await Promise.all([pollSignals(room.id, peer, since), listParticipants(room.id)]);
  return NextResponse.json(
    {
      status: isRoomLive(room) ? "ACTIVE" : "ENDED",
      now: new Date(now).toISOString(),
      participants,
      signals: signals.map((s) => ({ ...s, createdAt: s.createdAt.toISOString() })),
    },
    { headers: noStore },
  );
}
