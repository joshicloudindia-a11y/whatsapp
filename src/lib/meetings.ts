import { randomBytes, timingSafeEqual } from "crypto";
import type { MeetingRoom, Prisma } from "@prisma/client";
import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgMember } from "@/lib/org-auth";

/**
 * [meetings] Self-hosted WebRTC video rooms (mesh, ≤ 4 people) with DB-backed signaling.
 *
 * Serverless-friendly: no sockets and no in-memory state. Every browser tab is a "peer" (random id, `a-…` for
 * agents, `g-…` for guests – the prefix is enforced here so guests can't pose as an agent) and talks through
 * MeetingSignal rows:
 *   join / heartbeat / state / leave   presence (broadcast; a peer is gone ~15 s after its last one, or on leave)
 *   offer / answer / ice               WebRTC negotiation (addressed to one peer)
 *   chat                               in-room text chat (broadcast)
 *   end                                written by the server when an agent ends the room
 * Browsers poll GET …/signal?peer=&since= (createdAt cursor with a small overlap; ids are deduped client-side
 * because TiDB ids/commit order aren't time-ordered). Signals older than 10 min are deleted opportunistically.
 *
 * Access: agents = active members of the room's organization (session); guests = room code + guestToken.
 * Guests only ever receive the room title and participants' display names / mic-cam state.
 */

export const MEETING_TTL_MS = 4 * 60 * 60 * 1000;
export const PRESENCE_TTL_MS = 15_000;
export const SIGNAL_TTL_MS = 10 * 60 * 1000;
export const SINCE_OVERLAP_MS = 3_000;
export const MAX_PAYLOAD_BYTES = 64 * 1024;
const MAX_SIGNALS_PER_10S = 400;
const MAX_ROOMS_PER_HOUR = 60;

export const SIGNAL_TYPES = ["join", "heartbeat", "state", "leave", "offer", "answer", "ice", "chat"] as const;
export type SignalType = (typeof SIGNAL_TYPES)[number] | "end";
const PRESENCE_TYPES = ["join", "heartbeat", "state", "leave"];
/** Peer-to-peer signals must be addressed to exactly one peer. */
const DIRECTED_TYPES = ["offer", "answer", "ice"];

export type MeetingRole = "agent" | "guest";

export interface MeetingAccess {
  room: MeetingRoom;
  role: MeetingRole;
  /** Set for agents. */
  userId?: string;
}

export interface Participant {
  peer: string;
  role: MeetingRole;
  name: string;
  mic: boolean;
  cam: boolean;
  screen: boolean;
  /** ISO time of the last presence signal. */
  seenAt: string;
}

export const meetingError = (error: string, status = 400, code?: string) =>
  NextResponse.json({ error, ...(code && { code }) }, { status, headers: { "Cache-Control": "no-store" } });

export const noStore = { "Cache-Control": "no-store" } as const;

// ─── Ids / tokens ────────────────────────────────────────────────────────────

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // 32 chars → byte % 32 is unbiased

function randomCode(len = 10) {
  return Array.from(randomBytes(len), (b) => ALPHABET[b % 32]).join("");
}

const CODE_RE = /^[a-z0-9]{6,16}$/;
const PEER_RE = /^[ag]-[A-Za-z0-9_-]{8,40}$/;

export const isValidCode = (v: unknown): v is string => typeof v === "string" && CODE_RE.test(v);
export const isValidPeer = (v: unknown): v is string => typeof v === "string" && PEER_RE.test(v);
export const peerRole = (peer: string): MeetingRole => (peer.startsWith("a-") ? "agent" : "guest");

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function appUrl(fallbackOrigin?: string) {
  return (process.env.NEXT_PUBLIC_APP_URL || fallbackOrigin || "https://www.bulkmarketing.online").replace(/\/$/, "");
}

export const guestUrl = (room: Pick<MeetingRoom, "code" | "guestToken">, origin?: string) =>
  `${appUrl(origin)}/meet/${room.code}?t=${encodeURIComponent(room.guestToken)}`;
/** Agents join inside the dashboard (a different path: /meet/[code] is the public guest page). */
export const agentUrl = (room: Pick<MeetingRoom, "code">, origin?: string) => `${appUrl(origin)}/meetings/${room.code}`;

// ─── Rooms ───────────────────────────────────────────────────────────────────

export const isRoomLive = (room: Pick<MeetingRoom, "status" | "expiresAt">) =>
  room.status === "ACTIVE" && room.expiresAt.getTime() > Date.now();

export async function roomsCreatedLastHour(organizationId: string) {
  return prisma.meetingRoom.count({ where: { organizationId, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } } });
}
export const ROOM_RATE_LIMIT = MAX_ROOMS_PER_HOUR;

export async function createMeetingRoom(opts: {
  organizationId: string;
  createdById: string | null;
  conversationId?: string | null;
  title: string;
}): Promise<MeetingRoom> {
  for (let attempt = 0; ; attempt++) {
    try {
      const room = await prisma.meetingRoom.create({
        data: {
          organizationId: opts.organizationId,
          createdById: opts.createdById,
          conversationId: opts.conversationId ?? null,
          code: randomCode(10),
          guestToken: randomBytes(24).toString("base64url"), // 32 chars
          title: opts.title,
          expiresAt: new Date(Date.now() + MEETING_TTL_MS),
        },
      });
      cleanupStaleSignals();
      return room;
    } catch (e) {
      const unique = (e as { code?: string })?.code === "P2002";
      if (!unique || attempt >= 3) throw e;
    }
  }
}

/**
 * Resolves who is calling. With a guest token (`t`) the caller is a guest (token must match);
 * otherwise the session must belong to an active member of the room's organization.
 */
export async function resolveMeetingAccess(code: unknown, token: string | null | undefined): Promise<MeetingAccess | NextResponse> {
  if (!isValidCode(code)) return meetingError("Meeting not found", 404, "NOT_FOUND");
  if (token != null && token !== "") {
    if (token.length < 16 || token.length > 128) return meetingError("This meeting link is invalid", 403, "BAD_TOKEN");
    const room = await prisma.meetingRoom.findUnique({ where: { code } });
    if (!room || !safeEqual(room.guestToken, token)) return meetingError("This meeting link is invalid", 403, "BAD_TOKEN");
    return { room, role: "guest" };
  }
  const member = await getOrgMember();
  if (!member) return meetingError("Unauthorized", 401, "UNAUTHORIZED");
  const room = await prisma.meetingRoom.findFirst({ where: { code, organizationId: member.organizationId } });
  if (!room) return meetingError("Meeting not found", 404, "NOT_FOUND");
  return { room, role: "agent", userId: member.userId };
}

export async function endMeetingRoom(room: MeetingRoom) {
  if (room.status !== "ENDED") {
    await prisma.meetingRoom.update({ where: { id: room.id }, data: { status: "ENDED", endedAt: new Date() } });
  }
  await prisma.meetingSignal.create({ data: { roomId: room.id, fromPeer: "server", type: "end" } });
}

/** What a client may see about the room (no org data, no token). */
export function publicRoom(room: MeetingRoom) {
  return {
    code: room.code,
    title: room.title,
    status: isRoomLive(room) ? "ACTIVE" : "ENDED",
    maxParticipants: room.maxParticipants,
    expiresAt: room.expiresAt.toISOString(),
  };
}

// ─── Presence ────────────────────────────────────────────────────────────────

function readPresencePayload(p: Prisma.JsonValue | null) {
  const o = (p && typeof p === "object" && !Array.isArray(p) ? p : {}) as Record<string, unknown>;
  return {
    name: typeof o.name === "string" ? o.name : "",
    mic: o.mic === true,
    cam: o.cam === true,
    screen: o.screen === true,
  };
}

/** Peers seen in the last ~15 s whose latest presence signal isn't `leave`. */
export async function listParticipants(roomId: string): Promise<Participant[]> {
  const rows = await prisma.meetingSignal.findMany({
    where: { roomId, type: { in: PRESENCE_TYPES }, createdAt: { gte: new Date(Date.now() - PRESENCE_TTL_MS) } },
    orderBy: { createdAt: "desc" },
    select: { fromPeer: true, type: true, payload: true, createdAt: true },
    take: 300,
  });
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!latest.has(r.fromPeer)) latest.set(r.fromPeer, r);
  const out: Participant[] = [];
  for (const [peer, r] of latest) {
    if (r.type === "leave" || !isValidPeer(peer)) continue;
    const p = readPresencePayload(r.payload);
    const role = peerRole(peer);
    out.push({ peer, role, name: p.name || (role === "agent" ? "Agent" : "Guest"), mic: p.mic, cam: p.cam, screen: p.screen, seenAt: r.createdAt.toISOString() });
  }
  return out.sort((a, b) => a.peer.localeCompare(b.peer));
}

// ─── Signals ─────────────────────────────────────────────────────────────────

const cleanName = (v: unknown) =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 40) : "";

export type SignalInput = { fromPeer: string; toPeer: string | null; type: (typeof SIGNAL_TYPES)[number]; payload: Prisma.InputJsonValue | null };

/** Validates a POSTed signal. Returns an error message or the normalized signal. */
export function parseSignal(body: unknown, access: MeetingAccess, agentName: string | null): SignalInput | string {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "Invalid JSON";
  const b = body as Record<string, unknown>;
  if (!isValidPeer(b.fromPeer)) return "Invalid peer id";
  // A guest can never send as an agent peer (and vice versa) – the role is derived from the prefix.
  if (peerRole(b.fromPeer) !== access.role) return "Invalid peer id";
  const type = b.type;
  if (typeof type !== "string" || !(SIGNAL_TYPES as readonly string[]).includes(type)) return "Unknown signal type";
  const toPeer = b.toPeer == null || b.toPeer === "" ? null : b.toPeer;
  if (toPeer !== null && (!isValidPeer(toPeer) || toPeer === b.fromPeer)) return "Invalid target peer";
  if (DIRECTED_TYPES.includes(type) && !toPeer) return "This signal needs a target peer";

  let payload: Record<string, unknown> | null = null;
  if (b.payload != null) {
    if (typeof b.payload !== "object" || Array.isArray(b.payload)) return "Invalid payload";
    payload = b.payload as Record<string, unknown>;
  }
  if (PRESENCE_TYPES.includes(type)) {
    const p = payload ?? {};
    const name = access.role === "agent" ? cleanName(agentName) || "Agent" : cleanName(p.name) || "Guest";
    payload = { name, mic: p.mic === true, cam: p.cam === true, screen: p.screen === true };
  } else if (type === "chat") {
    const text = typeof payload?.text === "string" ? payload.text.trim().slice(0, 1000) : "";
    if (!text) return "Message can't be empty";
    const name = access.role === "agent" ? cleanName(agentName) || "Agent" : cleanName(payload?.name) || "Guest";
    payload = { text, name, ...(typeof payload?.cid === "string" && { cid: payload.cid.slice(0, 40) }) };
  }
  const size = payload ? Buffer.byteLength(JSON.stringify(payload)) : 0;
  if (size > MAX_PAYLOAD_BYTES) return "Payload too large";
  return { fromPeer: b.fromPeer, toPeer, type: type as SignalInput["type"], payload: payload as Prisma.InputJsonValue | null };
}

export async function recentSignalCount(roomId: string) {
  return prisma.meetingSignal.count({ where: { roomId, createdAt: { gte: new Date(Date.now() - 10_000) } } });
}
export const SIGNAL_RATE_LIMIT = MAX_SIGNALS_PER_10S;

export async function writeSignal(roomId: string, s: SignalInput) {
  const row = await prisma.meetingSignal.create({
    data: { roomId, fromPeer: s.fromPeer, toPeer: s.toPeer, type: s.type, ...(s.payload != null && { payload: s.payload }) },
    select: { id: true, createdAt: true },
  });
  // Opportunistic cleanup: this room's old signals on ~1 in 5 writes, every room's on ~1 in 50.
  if (Math.random() < 0.2) {
    const cutoff = new Date(Date.now() - SIGNAL_TTL_MS);
    after(() => prisma.meetingSignal.deleteMany({ where: { roomId, createdAt: { lt: cutoff } } }).catch(() => undefined));
  }
  if (Math.random() < 0.02) cleanupStaleSignals();
  return row;
}

/** Deletes every room's signals older than the TTL after the response is sent (uses the createdAt index). */
export function cleanupStaleSignals() {
  const cutoff = new Date(Date.now() - SIGNAL_TTL_MS);
  after(() => prisma.meetingSignal.deleteMany({ where: { createdAt: { lt: cutoff } } }).catch(() => undefined));
}

/** Signals for `peer` (addressed to it or broadcast, not its own, no heartbeats) since `since` minus the overlap. */
export async function pollSignals(roomId: string, peer: string, since: Date) {
  return prisma.meetingSignal.findMany({
    where: {
      roomId,
      createdAt: { gt: new Date(since.getTime() - SINCE_OVERLAP_MS) },
      fromPeer: { not: peer },
      type: { not: "heartbeat" },
      OR: [{ toPeer: null }, { toPeer: peer }],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, fromPeer: true, toPeer: true, type: true, payload: true, createdAt: true },
    take: 300,
  });
}
