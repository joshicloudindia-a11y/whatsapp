/**
 * [meetings] Browser side of a ChatFlow video room: one RTCPeerConnection per remote peer (mesh, ≤ 4 people),
 * signaling over HTTP polling (/api/meetings/{code}/signal), the "perfect negotiation" pattern against glare,
 * replaceTrack for mic/camera/screen changes (no renegotiation) and ICE restarts on failure.
 *
 * Each pc gets our own audio + video transceiver up front (sendrecv, possibly without a track), so toggling the
 * camera or sharing the screen is a replaceTrack on `videoTx.sender`. Remote media arrives on the remote peer's
 * transceivers and is collected into one MediaStream per peer.
 */

export type MeetingRole = "agent" | "guest";
export type Quality = "good" | "fair" | "poor" | "unknown";

export interface ServerParticipant {
  peer: string;
  role: MeetingRole;
  name: string;
  mic: boolean;
  cam: boolean;
  screen: boolean;
}

export interface RemotePeer extends ServerParticipant {
  stream: MediaStream;
  /** Bumped when the remote stream's tracks change (re-attach srcObject). */
  trackKey: string;
  connection: RTCPeerConnectionState;
  quality: Quality;
  rttMs: number | null;
  audioLevel: number;
}

export interface ChatMessage {
  id: string;
  peer: string;
  name: string;
  text: string;
  at: number;
  mine: boolean;
}

export type EngineStatus = "joining" | "live" | "ended" | "full" | "error" | "left";

export interface LocalState {
  mic: boolean;
  cam: boolean;
  screen: boolean;
  facing: "user" | "environment";
  /** Preview stream (video only: camera or screen). */
  preview: MediaStream;
  previewKey: string;
}

export interface MeshSnapshot {
  status: EngineStatus;
  error: string | null;
  reconnecting: boolean;
  peers: RemotePeer[];
  chat: ChatMessage[];
  activePeer: string | null;
  local: LocalState;
  peerId: string;
}

interface PeerConn {
  id: string;
  polite: boolean;
  pc: RTCPeerConnection;
  audioTx: RTCRtpTransceiver;
  videoTx: RTCRtpTransceiver;
  makingOffer: boolean;
  ignoreOffer: boolean;
  pendingIce: RTCIceCandidateInit[];
  iceOut: RTCIceCandidateInit[];
  iceTimer: ReturnType<typeof setTimeout> | null;
  chain: Promise<void>;
  stream: MediaStream;
  trackKey: string;
  createdAt: number;
  disconnectedAt: number | null;
  lastRestart: number;
  lost: number;
  recv: number;
  quality: Quality;
  rttMs: number | null;
  audioLevel: number;
}

interface WireSignal {
  id: string;
  fromPeer: string;
  toPeer: string | null;
  type: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

// ─── ICE servers ─────────────────────────────────────────────────────────────

/** Same env names as the WhatsApp calling module (NEXT_PUBLIC_STUN_URLS / NEXT_PUBLIC_TURN_URL), plus NEXT_PUBLIC_TURN_URLS (comma separated). */
export function meetingIceServers(): RTCIceServer[] {
  const list = (v: string | undefined) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const stun = list(process.env.NEXT_PUBLIC_STUN_URLS || "stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302");
  const turn = list(process.env.NEXT_PUBLIC_TURN_URLS || process.env.NEXT_PUBLIC_TURN_URL);
  const servers: RTCIceServer[] = stun.length ? [{ urls: stun }] : [];
  if (turn.length) {
    servers.push({ urls: turn, username: process.env.NEXT_PUBLIC_TURN_USERNAME, credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL });
  }
  return servers;
}

// ─── Media helpers ───────────────────────────────────────────────────────────

export function mediaSupportError(): string | null {
  if (typeof window === "undefined") return null;
  if (!window.isSecureContext) return "Video calls need a secure (https://) page. Open the link exactly as it was sent to you.";
  if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
    return "This browser can't make video calls. Open the link in a recent Chrome, Safari, Edge or Firefox.";
  }
  return null;
}

/** Human explanation for a getUserMedia / getDisplayMedia failure. */
export function mediaErrorMessage(e: unknown, what = "camera and microphone"): string {
  const name = (e as { name?: string } | null)?.name;
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return `Access to your ${what} is blocked. Tap the lock or camera icon in the address bar, allow ${what}, then tap “Try again”. On iPhone: Settings → Safari → Camera / Microphone → Allow.`;
    case "NotFoundError":
    case "OverconstrainedError":
      return `No ${what} found on this device. You can still join and use chat, or plug one in and try again.`;
    case "NotReadableError":
    case "AbortError":
      return `Your ${what} is being used by another app (another call or camera app). Close it, then try again.`;
    default:
      return e instanceof Error && e.message ? e.message : `Couldn't start your ${what}.`;
  }
}

export function audioConstraints(deviceId?: string | null): MediaTrackConstraints {
  return { echoCancellation: true, noiseSuppression: true, autoGainControl: true, ...(deviceId && { deviceId: { exact: deviceId } }) };
}

export function videoConstraints(opts: { deviceId?: string | null; facing?: "user" | "environment" }): MediaTrackConstraints {
  return {
    width: { ideal: 640 },
    height: { ideal: 480 },
    frameRate: { ideal: 24, max: 30 },
    ...(opts.deviceId ? { deviceId: { exact: opts.deviceId } } : { facingMode: { ideal: opts.facing ?? "user" } }),
  };
}

const rand = (n = 16) => {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => abc[b % abc.length]).join("");
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

// ─── Engine ──────────────────────────────────────────────────────────────────

export interface EngineOptions {
  code: string;
  token?: string | null;
  role: MeetingRole;
  name: string;
  /** Media from the pre-join screen (ownership moves to the engine). */
  audioTrack: MediaStreamTrack | null;
  camTrack: MediaStreamTrack | null;
  mic: boolean;
  facing: "user" | "environment";
  videoDeviceId?: string | null;
}

export class MeshEngine {
  readonly peerId: string;
  readonly joinedAt = Date.now();
  private opts: EngineOptions;
  private peers = new Map<string, PeerConn>();
  private info = new Map<string, ServerParticipant>();
  private seen = new Map<string, number>();
  private cursor = 0;
  private seq = 0;
  private stopped = false;
  private failures = 0;
  private timers: ReturnType<typeof setInterval>[] = [];
  private listeners = new Set<() => void>();
  private snapshot: MeshSnapshot;
  private chat: ChatMessage[] = [];
  private activePeer: string | null = null;
  private status: EngineStatus = "joining";
  private error: string | null = null;

  private audioTrack: MediaStreamTrack | null;
  private camTrack: MediaStreamTrack | null;
  private screenTrack: MediaStreamTrack | null = null;
  private mic: boolean;
  private facing: "user" | "environment";
  private videoDeviceId: string | null;
  private sendStream = new MediaStream();
  private preview = new MediaStream();
  private previewKey = "none";
  private iceServers = meetingIceServers();

  constructor(opts: EngineOptions) {
    this.opts = opts;
    this.peerId = `${opts.role === "agent" ? "a" : "g"}-${rand(16)}`;
    this.audioTrack = opts.audioTrack;
    this.camTrack = opts.camTrack;
    this.mic = opts.mic && !!opts.audioTrack;
    this.facing = opts.facing;
    this.videoDeviceId = opts.videoDeviceId ?? null;
    if (this.audioTrack) {
      this.audioTrack.enabled = this.mic;
      this.sendStream.addTrack(this.audioTrack);
    }
    this.setPreview(this.camTrack);
    this.snapshot = this.build();
  }

  // ── store (useSyncExternalStore) ──
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snapshot;

  private emit() {
    this.snapshot = this.build();
    for (const l of this.listeners) l();
  }

  private build(): MeshSnapshot {
    const peers: RemotePeer[] = [];
    for (const [id, i] of this.info) {
      const p = this.peers.get(id);
      peers.push({
        ...i,
        stream: p?.stream ?? new MediaStream(),
        trackKey: p?.trackKey ?? "",
        connection: p?.pc.connectionState ?? "new",
        quality: p?.quality ?? "unknown",
        rttMs: p?.rttMs ?? null,
        audioLevel: p?.audioLevel ?? 0,
      });
    }
    return {
      status: this.status,
      error: this.error,
      reconnecting: this.failures >= 2,
      peers,
      chat: this.chat,
      activePeer: this.activePeer && this.info.has(this.activePeer) ? this.activePeer : peers[0]?.peer ?? null,
      local: {
        mic: this.mic,
        cam: !!this.camTrack,
        screen: !!this.screenTrack,
        facing: this.facing,
        preview: this.preview,
        previewKey: this.previewKey,
      },
      peerId: this.peerId,
    };
  }

  // ── http ──
  private url(path: string, params: Record<string, string> = {}) {
    const q = new URLSearchParams(params);
    if (this.opts.token) q.set("t", this.opts.token);
    const qs = q.toString();
    return `/api/meetings/${encodeURIComponent(this.opts.code)}${path}${qs ? `?${qs}` : ""}`;
  }

  private async request<T>(path: string, init?: RequestInit & { params?: Record<string, string> }): Promise<T> {
    const res = await fetch(this.url(path, init?.params), {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      cache: "no-store",
      credentials: "same-origin",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new HttpError(res.status, data?.error ?? `Request failed (${res.status})`, data?.code);
    return data as T;
  }

  private presence() {
    return { name: this.opts.name, mic: this.mic, cam: !!this.camTrack, screen: !!this.screenTrack };
  }

  private async post(type: string, payload: Record<string, unknown> | null, toPeer: string | null = null) {
    return this.request<{ ok: boolean; id?: string; cursor?: string; participants?: ServerParticipant[] }>("/signal", {
      method: "POST",
      body: JSON.stringify({ fromPeer: this.peerId, toPeer, type, payload: payload ? { ...payload, seq: ++this.seq } : { seq: ++this.seq } }),
    });
  }

  /** Fire-and-forget send with one retry; ends the engine if the room is gone. */
  private send(type: string, payload: Record<string, unknown> | null, toPeer: string | null = null) {
    if (this.stopped) return;
    this.post(type, payload, toPeer).catch(async (e) => {
      if (this.handleFatal(e)) return;
      await sleep(600);
      if (!this.stopped) this.post(type, payload, toPeer).catch((err) => this.handleFatal(err));
    });
  }

  private handleFatal(e: unknown): boolean {
    if (!(e instanceof HttpError)) return false;
    if (e.status === 410) {
      this.finish("ended");
      return true;
    }
    if (e.status === 401 || e.status === 403 || e.status === 404) {
      this.finish("error", e.message);
      return true;
    }
    return false;
  }

  // ── lifecycle ──
  async start() {
    try {
      const res = await this.post("join", this.presence());
      this.cursor = res.cursor ? Date.parse(res.cursor) : Date.now();
      if (res.id) this.seen.set(res.id, this.cursor);
      this.status = "live";
      for (const p of res.participants ?? []) {
        this.info.set(p.peer, p);
        this.ensurePeer(p.peer);
      }
      this.emit();
    } catch (e) {
      if (e instanceof HttpError && e.code === "ROOM_FULL") this.finish("full", e.message);
      else if (e instanceof HttpError && e.status === 410) this.finish("ended");
      else this.finish("error", e instanceof Error ? e.message : "Couldn't join the meeting");
      return;
    }
    void this.pollLoop();
    this.timers.push(setInterval(() => this.send("heartbeat", this.presence()), 5_000));
    this.timers.push(setInterval(() => void this.collectStats(), 2_000));
  }

  private holders = 0;
  /** A mounted room view holds the engine; the last release (unmount) leaves after a tick, unless re-retained. */
  retain() {
    this.holders++;
  }
  release() {
    this.holders = Math.max(0, this.holders - 1);
    setTimeout(() => {
      if (this.holders === 0) this.leave();
    }, 0);
  }

  /** Leave normally (button / unmount). */
  leave() {
    if (this.stopped) return;
    fetch(this.url("/signal"), {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromPeer: this.peerId, type: "leave", payload: {} }),
    }).catch(() => undefined);
    this.finish("left");
  }

  /** Tab close: sendBeacon survives unload where fetch may not. */
  beaconLeave() {
    if (this.stopped) return;
    const body = new Blob([JSON.stringify({ fromPeer: this.peerId, type: "leave", payload: {} })], { type: "application/json" });
    if (!navigator.sendBeacon?.(this.url("/signal"), body)) this.leave();
    else this.finish("left");
  }

  private finish(status: EngineStatus, error: string | null = null) {
    if (this.stopped) return;
    this.stopped = true;
    this.status = status;
    this.error = error;
    this.timers.forEach(clearInterval);
    this.timers = [];
    for (const p of this.peers.values()) this.closePeer(p.id, false);
    this.audioTrack?.stop();
    this.camTrack?.stop();
    this.screenTrack?.stop();
    this.audioTrack = this.camTrack = this.screenTrack = null;
    this.setPreview(null);
    this.emit();
  }

  // ── polling ──
  private negotiating() {
    for (const p of this.peers.values()) {
      const c = p.pc.connectionState;
      if (p.pc.signalingState !== "stable" || c === "new" || c === "connecting") return true;
    }
    return false;
  }

  private async pollLoop() {
    while (!this.stopped) {
      try {
        await this.pollOnce();
        if (this.failures) {
          this.failures = 0;
          this.emit();
        }
      } catch (e) {
        if (this.handleFatal(e)) return;
        this.failures++;
        if (this.failures === 2) this.emit();
      }
      if (this.stopped) return;
      const base = this.negotiating() ? 800 : 1_500;
      await sleep(this.failures ? Math.min(base * 2 ** this.failures, 6_000) : base);
    }
  }

  private async pollOnce() {
    const data = await this.request<{ status: string; participants: ServerParticipant[]; signals: WireSignal[] }>("/signal", {
      params: { peer: this.peerId, since: String(this.cursor) },
    });
    if (this.stopped) return;

    const fresh = data.signals.filter((s) => !this.seen.has(s.id));
    for (const s of fresh) {
      const at = Date.parse(s.createdAt);
      this.seen.set(s.id, at);
      if (at > this.cursor) this.cursor = at;
    }
    // Forget ids well behind the cursor (the server only re-sends ~3 s of overlap).
    for (const [id, at] of this.seen) if (at < this.cursor - 30_000) this.seen.delete(id);

    // Per sender, process in the sender's own order (seq), since createdAt ties / commit order aren't reliable.
    const bySender = new Map<string, WireSignal[]>();
    for (const s of fresh) bySender.set(s.fromPeer, [...(bySender.get(s.fromPeer) ?? []), s]);
    let changed = false;
    for (const list of bySender.values()) {
      list.sort((a, b) => (Number(a.payload?.seq) || 0) - (Number(b.payload?.seq) || 0) || Date.parse(a.createdAt) - Date.parse(b.createdAt));
      for (const s of list) changed = this.dispatch(s) || changed;
    }

    if (data.status === "ENDED") return this.finish("ended");
    changed = this.reconcile(data.participants) || changed;
    if (changed) this.emit();
  }

  private reconcile(list: ServerParticipant[]): boolean {
    let changed = false;
    const live = new Set<string>();
    for (const p of list) {
      if (p.peer === this.peerId) continue;
      live.add(p.peer);
      const prev = this.info.get(p.peer);
      if (!prev || prev.name !== p.name || prev.mic !== p.mic || prev.cam !== p.cam || prev.screen !== p.screen) {
        this.info.set(p.peer, { peer: p.peer, role: p.role, name: p.name, mic: p.mic, cam: p.cam, screen: p.screen });
        changed = true;
      }
      this.ensurePeer(p.peer);
    }
    for (const id of [...this.info.keys()]) {
      const pc = this.peers.get(id);
      if (!live.has(id) && (!pc || Date.now() - pc.createdAt > 6_000)) {
        this.info.delete(id);
        this.closePeer(id, false);
        changed = true;
      }
    }
    return changed;
  }

  private dispatch(s: WireSignal): boolean {
    const from = s.fromPeer;
    const pl = s.payload ?? {};
    switch (s.type) {
      case "join":
      case "state": {
        const prev = this.info.get(from);
        this.info.set(from, {
          peer: from,
          role: from.startsWith("a-") ? "agent" : "guest",
          name: typeof pl.name === "string" ? pl.name : prev?.name ?? "Guest",
          mic: pl.mic === true,
          cam: pl.cam === true,
          screen: pl.screen === true,
        });
        this.ensurePeer(from);
        return true;
      }
      case "leave":
        this.info.delete(from);
        this.closePeer(from, false);
        return true;
      case "offer":
      case "answer": {
        const sdp = pl.sdp as RTCSessionDescriptionInit | undefined;
        if (!sdp || typeof sdp.sdp !== "string") return false;
        const p = this.ensurePeer(from);
        this.enqueue(p, () => this.onDescription(p, { type: s.type as RTCSdpType, sdp: sdp.sdp }));
        return false;
      }
      case "ice": {
        const list = Array.isArray(pl.candidates) ? (pl.candidates as RTCIceCandidateInit[]) : [];
        const p = this.ensurePeer(from);
        this.enqueue(p, () => this.onCandidates(p, list));
        return false;
      }
      case "chat": {
        if (typeof pl.text !== "string") return false;
        this.chat = [...this.chat, { id: s.id, peer: from, name: typeof pl.name === "string" ? pl.name : "Guest", text: pl.text, at: Date.parse(s.createdAt), mine: false }]
          .sort((a, b) => a.at - b.at)
          .slice(-200);
        return true;
      }
      case "end":
        this.finish("ended");
        return false;
      default:
        return false;
    }
  }

  private enqueue(p: PeerConn, fn: () => Promise<void>) {
    p.chain = p.chain.then(fn).catch((e) => console.warn("[meet] signal handling failed:", e));
  }

  // ── peer connections ──
  private currentVideoTrack() {
    return this.screenTrack ?? this.camTrack;
  }

  private ensurePeer(id: string): PeerConn {
    const existing = this.peers.get(id);
    if (existing) return existing;
    const pc = new RTCPeerConnection({ iceServers: this.iceServers, bundlePolicy: "max-bundle" });
    const audioTx = pc.addTransceiver(this.audioTrack ?? "audio", { direction: "sendrecv", streams: [this.sendStream] });
    const videoTx = pc.addTransceiver(this.currentVideoTrack() ?? "video", { direction: "sendrecv", streams: [this.sendStream] });
    const p: PeerConn = {
      id, pc, audioTx, videoTx,
      polite: this.peerId > id,
      makingOffer: false, ignoreOffer: false,
      pendingIce: [], iceOut: [], iceTimer: null,
      chain: Promise.resolve(),
      stream: new MediaStream(), trackKey: "0",
      createdAt: Date.now(), disconnectedAt: null, lastRestart: 0,
      lost: 0, recv: 0, quality: "unknown", rttMs: null, audioLevel: 0,
    };
    this.peers.set(id, p);

    pc.onnegotiationneeded = async () => {
      try {
        p.makingOffer = true;
        await pc.setLocalDescription();
        const d = pc.localDescription;
        if (d) this.send(d.type, { sdp: { type: d.type, sdp: d.sdp } }, id);
      } catch (e) {
        console.warn("[meet] offer failed:", e);
      } finally {
        p.makingOffer = false;
      }
    };
    pc.onicecandidate = ({ candidate }) => {
      if (!candidate) return;
      p.iceOut.push(candidate.toJSON());
      if (!p.iceTimer) {
        p.iceTimer = setTimeout(() => {
          p.iceTimer = null;
          const candidates = p.iceOut.splice(0, p.iceOut.length);
          if (candidates.length && this.peers.get(id) === p) this.send("ice", { candidates }, id);
        }, 150);
      }
    };
    pc.ontrack = ({ track }) => {
      for (const t of p.stream.getTracks()) if (t.kind === track.kind && t !== track) p.stream.removeTrack(t);
      if (!p.stream.getTracks().includes(track)) p.stream.addTrack(track);
      p.trackKey = p.stream.getTracks().map((t) => t.id).join(",");
      this.emit();
    };
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === "connected") p.disconnectedAt = null;
      else if (s === "disconnected" && !p.disconnectedAt) p.disconnectedAt = Date.now();
      else if (s === "failed") this.restartIce(p);
      this.emit();
    };
    return p;
  }

  private restartIce(p: PeerConn) {
    if (this.stopped || Date.now() - p.lastRestart < 8_000) return;
    p.lastRestart = Date.now();
    try {
      p.pc.restartIce(); // → negotiationneeded → offer with new ICE credentials (perfect negotiation handles glare)
    } catch (e) {
      console.warn("[meet] ICE restart failed:", e);
    }
  }

  private async onDescription(p: PeerConn, description: RTCSessionDescriptionInit) {
    const { pc } = p;
    if (pc.signalingState === "closed") return;
    const offerCollision = description.type === "offer" && (p.makingOffer || pc.signalingState !== "stable");
    p.ignoreOffer = !p.polite && offerCollision;
    if (p.ignoreOffer) return;
    if (description.type === "answer" && pc.signalingState !== "have-local-offer") return; // stale answer
    await pc.setRemoteDescription(description); // rolls back our own offer if needed (polite side)
    const pending = p.pendingIce.splice(0, p.pendingIce.length);
    for (const c of pending) await pc.addIceCandidate(c).catch(() => undefined);
    if (description.type === "offer") {
      await pc.setLocalDescription();
      const d = pc.localDescription;
      if (d) this.send(d.type, { sdp: { type: d.type, sdp: d.sdp } }, p.id);
    }
  }

  private async onCandidates(p: PeerConn, list: RTCIceCandidateInit[]) {
    for (const c of list) {
      if (!c || typeof c !== "object") continue;
      if (!p.pc.remoteDescription) {
        p.pendingIce.push(c);
        continue;
      }
      try {
        await p.pc.addIceCandidate(c);
      } catch (e) {
        if (!p.ignoreOffer) console.warn("[meet] addIceCandidate failed:", e);
      }
    }
  }

  private closePeer(id: string, emit = true) {
    const p = this.peers.get(id);
    if (!p) return;
    this.peers.delete(id);
    if (p.iceTimer) clearTimeout(p.iceTimer);
    try {
      p.pc.close();
    } catch {
      /* already closed */
    }
    if (this.activePeer === id) this.activePeer = null;
    if (emit) this.emit();
  }

  private async collectStats() {
    if (this.stopped) return;
    let changed = false;
    let loudest: { id: string; level: number } | null = null;
    for (const p of this.peers.values()) {
      if (p.disconnectedAt && Date.now() - p.disconnectedAt > 4_000) this.restartIce(p);
      if (p.pc.connectionState !== "connected") continue;
      try {
        const stats = await p.pc.getStats();
        let rtt: number | null = null;
        let lost = 0, recv = 0, level = 0;
        stats.forEach((r) => {
          if (r.type === "candidate-pair" && r.nominated && r.state === "succeeded" && typeof r.currentRoundTripTime === "number") rtt = r.currentRoundTripTime;
          if (r.type === "inbound-rtp") {
            lost += Math.max(0, r.packetsLost ?? 0);
            recv += r.packetsReceived ?? 0;
            if (r.kind === "audio" && typeof r.audioLevel === "number") level = Math.max(level, r.audioLevel);
          }
        });
        const dLost = lost - p.lost, dRecv = recv - p.recv;
        p.lost = lost;
        p.recv = recv;
        const loss = dLost + dRecv > 0 ? dLost / (dLost + dRecv) : 0;
        const rttMs: number | null = rtt === null ? null : Math.round((rtt as number) * 1000);
        const q: Quality = rttMs === null && dRecv <= 0 ? "unknown"
          : (rttMs ?? 0) < 300 && loss < 0.03 ? "good"
          : (rttMs ?? 0) < 700 && loss < 0.1 ? "fair" : "poor";
        if (q !== p.quality || rttMs !== p.rttMs) changed = true;
        p.quality = q;
        p.rttMs = rttMs;
        p.audioLevel = level;
        const micOn = this.info.get(p.id)?.mic;
        if (micOn && level > 0.04 && (!loudest || level > loudest.level)) loudest = { id: p.id, level };
      } catch {
        /* stats unavailable */
      }
    }
    const next = (loudest as { id: string; level: number } | null)?.id;
    if (next && next !== this.activePeer) {
      this.activePeer = next;
      changed = true;
    }
    if (changed) this.emit();
  }

  // ── local media ──
  private setPreview(track: MediaStreamTrack | null) {
    for (const t of this.preview.getTracks()) this.preview.removeTrack(t);
    if (track) this.preview.addTrack(track);
    this.previewKey = track?.id ?? "none";
  }

  private async replaceVideo(track: MediaStreamTrack | null) {
    this.setPreview(track);
    await Promise.all([...this.peers.values()].map((p) => p.videoTx.sender.replaceTrack(track).catch(() => undefined)));
  }

  private broadcastState() {
    this.send("state", this.presence());
    this.emit();
  }

  async setMic(on: boolean) {
    if (on && !this.audioTrack) {
      const s = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints() });
      this.audioTrack = s.getAudioTracks()[0] ?? null;
      if (this.audioTrack) {
        this.sendStream.addTrack(this.audioTrack);
        await Promise.all([...this.peers.values()].map((p) => p.audioTx.sender.replaceTrack(this.audioTrack).catch(() => undefined)));
      }
    }
    if (this.audioTrack) this.audioTrack.enabled = on;
    this.mic = on && !!this.audioTrack;
    this.broadcastState();
  }

  private async openCamera(): Promise<MediaStreamTrack> {
    const s = await navigator.mediaDevices.getUserMedia({ video: videoConstraints({ deviceId: this.videoDeviceId, facing: this.facing }) });
    const t = s.getVideoTracks()[0];
    if (!t) throw new Error("No camera track");
    return t;
  }

  async setCam(on: boolean) {
    if (on && !this.camTrack) {
      this.camTrack = await this.openCamera();
      if (!this.screenTrack) await this.replaceVideo(this.camTrack);
    } else if (!on && this.camTrack) {
      this.camTrack.stop();
      this.camTrack = null;
      if (!this.screenTrack) await this.replaceVideo(null);
    }
    this.broadcastState();
  }

  /** Front ↔ back camera (phones). The old track is stopped first – many phones can't open two cameras at once. */
  async switchCamera() {
    this.facing = this.facing === "user" ? "environment" : "user";
    this.videoDeviceId = null;
    if (!this.camTrack) return this.emit();
    this.camTrack.stop();
    try {
      this.camTrack = await this.openCamera();
    } catch (e) {
      this.facing = this.facing === "user" ? "environment" : "user";
      this.camTrack = await this.openCamera().catch(() => null);
      if (!this.screenTrack) await this.replaceVideo(this.camTrack);
      this.broadcastState();
      throw e;
    }
    if (!this.screenTrack) await this.replaceVideo(this.camTrack);
    this.broadcastState();
  }

  async startScreen() {
    if (this.screenTrack) return;
    const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15, max: 30 } }, audio: false });
    const t = s.getVideoTracks()[0];
    if (!t) return;
    t.contentHint = "detail";
    t.onended = () => void this.stopScreen();
    this.screenTrack = t;
    await this.replaceVideo(t);
    this.broadcastState();
  }

  async stopScreen() {
    if (!this.screenTrack) return;
    this.screenTrack.onended = null;
    this.screenTrack.stop();
    this.screenTrack = null;
    await this.replaceVideo(this.camTrack);
    if (!this.stopped) this.broadcastState();
  }

  sendChat(text: string) {
    const t = text.trim().slice(0, 1000);
    if (!t || this.stopped) return;
    const cid = rand(10);
    this.chat = [...this.chat, { id: `local-${cid}`, peer: this.peerId, name: this.opts.name, text: t, at: Date.now(), mine: true }].slice(-200);
    this.send("chat", { text: t, name: this.opts.name, cid });
    this.emit();
  }
}
