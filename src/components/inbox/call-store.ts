"use client";

import { useSyncExternalStore } from "react";
import axios from "axios";

/**
 * One active WhatsApp call per browser tab, shared by <CallButtons> (outgoing), <IncomingCallListener> (incoming)
 * and <CallPanel> (in-call UI). WebRTC objects live outside React; components subscribe with useCallSession().
 *
 * Media follows the Calling API docs: audio only, Opus (browser default 48 kHz / 20 ms), one SDP exchange
 * (no trickle ICE: we wait for ICE gathering before sending the SDP), the browser is the ICE-full / controlling
 * side against Meta's ICE-lite relay.
 */

export type CallPhase = "preparing" | "ringing" | "connecting" | "connected" | "ended";

export interface ServerCall {
  id: string;
  direction: "inbound" | "outbound";
  status: "ringing" | "connected" | "missed" | "rejected" | "ended" | "failed";
  via: "whatsapp" | "phone" | "video_link";
  startedAt: string;
  connectedAt?: string | null;
  endedAt?: string | null;
  durationSec?: number | null;
  deviceRinging?: boolean;
  error?: string | null;
  url?: string | null;
}

export interface CallSession {
  key: string;
  messageId: string | null;
  direction: "inbound" | "outbound";
  conversationId: string;
  contactName: string;
  contactPhone: string;
  phase: CallPhase;
  deviceRinging: boolean;
  connectedAt: number | null;
  muted: boolean;
  connectionState: RTCPeerConnectionState | "new";
  error: string | null;
  outcome: ServerCall["status"] | null;
  durationSec: number | null;
}

export interface PendingCall {
  messageId: string;
  callId: string;
  conversationId: string;
  contact: { id: string; name: string | null; phone: string };
  startedAt: string;
  offerSdp: string;
}

// ─── store ───────────────────────────────────────────────────────────────────

let session: CallSession | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const patch = (p: Partial<CallSession>) => {
  if (!session) return;
  session = { ...session, ...p };
  emit();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useCallSession() {
  return useSyncExternalStore(subscribe, () => session, () => null);
}
export const isCallActive = () => !!session && session.phase !== "ended";

// ─── WebRTC runtime (module scope, browser only) ─────────────────────────────

let pc: RTCPeerConnection | null = null;
let mic: MediaStream | null = null;
let remoteAudio: HTMLAudioElement | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let ringTimer: ReturnType<typeof setTimeout> | null = null;
let clearTimer: ReturnType<typeof setTimeout> | null = null;
let answerApplied = false;
let cancelled = false;

const RING_TIMEOUT_MS = 70_000;
const ICE_GATHER_TIMEOUT_MS = 3_000;

const apiError = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? (e instanceof Error ? e.message : fallback);

function iceServers(): RTCIceServer[] {
  const stun = (process.env.NEXT_PUBLIC_STUN_URLS ?? "stun:stun.l.google.com:19302").split(",").map((s) => s.trim()).filter(Boolean);
  const servers: RTCIceServer[] = stun.length ? [{ urls: stun }] : [];
  if (process.env.NEXT_PUBLIC_TURN_URL) {
    servers.push({ urls: process.env.NEXT_PUBLIC_TURN_URL, username: process.env.NEXT_PUBLIC_TURN_USERNAME, credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL });
  }
  return servers;
}

async function getMicrophone(): Promise<MediaStream> {
  if (typeof window === "undefined" || !window.isSecureContext) throw new Error("Calling needs a secure (https://) page.");
  if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") throw new Error("This browser doesn't support calling. Use a recent Chrome, Edge, Firefox or Safari.");
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
  } catch (e) {
    const name = (e as { name?: string })?.name;
    if (name === "NotAllowedError" || name === "SecurityError") throw new Error("Microphone access is blocked. Allow the microphone for this site in your browser settings, then try again.");
    if (name === "NotFoundError" || name === "OverconstrainedError") throw new Error("No microphone found. Connect a headset or microphone and try again.");
    if (name === "NotReadableError") throw new Error("Your microphone is being used by another app.");
    throw new Error("Couldn't access the microphone.");
  }
}

function createPeer(stream: MediaStream) {
  const peer = new RTCPeerConnection({ iceServers: iceServers(), bundlePolicy: "max-bundle", rtcpMuxPolicy: "require" });
  stream.getAudioTracks().forEach((t) => peer.addTrack(t, stream));
  peer.ontrack = (ev) => {
    if (!remoteAudio) {
      remoteAudio = new Audio();
      remoteAudio.autoplay = true;
    }
    remoteAudio.srcObject = ev.streams[0] ?? new MediaStream([ev.track]);
    remoteAudio.play().catch(() => undefined);
  };
  peer.onconnectionstatechange = () => {
    if (pc !== peer) return;
    patch({ connectionState: peer.connectionState });
    if (peer.connectionState === "failed" && session?.phase !== "ended") {
      void hangup("The audio connection failed (network/firewall). Try again or use Call by phone.");
    }
  };
  return peer;
}

/** Waits for ICE gathering so the SDP carries all candidates (Meta uses a single SDP exchange). */
function gatheredSdp(peer: RTCPeerConnection): Promise<string> {
  return new Promise((resolve, reject) => {
    const done = () => {
      clearTimeout(t);
      peer.removeEventListener("icegatheringstatechange", onChange);
      const sdp = peer.localDescription?.sdp;
      if (sdp) resolve(sdp);
      else reject(new Error("Couldn't create the call description (SDP)."));
    };
    const onChange = () => {
      if (peer.iceGatheringState === "complete") done();
    };
    const t = setTimeout(done, ICE_GATHER_TIMEOUT_MS);
    if (peer.iceGatheringState === "complete") done();
    else peer.addEventListener("icegatheringstatechange", onChange);
  });
}

function onBeforeUnload() {
  if (session?.messageId && session.phase !== "ended") navigator.sendBeacon?.(`/api/calls/${session.messageId}/terminate`);
}

function releaseMedia() {
  if (pollTimer) clearInterval(pollTimer);
  if (ringTimer) clearTimeout(ringTimer);
  pollTimer = ringTimer = null;
  mic?.getTracks().forEach((t) => t.stop());
  mic = null;
  if (pc) {
    pc.ontrack = null;
    pc.onconnectionstatechange = null;
    try { pc.close(); } catch { /* already closed */ }
  }
  pc = null;
  if (remoteAudio) {
    remoteAudio.pause();
    remoteAudio.srcObject = null;
  }
  answerApplied = false;
  if (typeof window !== "undefined") window.removeEventListener("beforeunload", onBeforeUnload);
}

function finish(outcome: ServerCall["status"] | null, opts: { error?: string | null; durationSec?: number | null } = {}) {
  releaseMedia();
  if (!session) return;
  const durationSec = opts.durationSec ?? (session.connectedAt ? Math.round((Date.now() - session.connectedAt) / 1000) : null);
  patch({ phase: "ended", outcome, error: opts.error ?? session.error, durationSec });
  if (clearTimer) clearTimeout(clearTimer);
  // Keep the summary on screen briefly unless something went wrong.
  if (!opts.error) clearTimer = setTimeout(() => dismissCall(), 4_000);
}

function begin(s: Omit<CallSession, "key" | "deviceRinging" | "connectedAt" | "muted" | "connectionState" | "error" | "outcome" | "durationSec">) {
  if (clearTimer) clearTimeout(clearTimer);
  cancelled = false;
  session = { ...s, key: `${Date.now()}-${Math.random()}`, deviceRinging: false, connectedAt: null, muted: false, connectionState: "new", error: null, outcome: null, durationSec: null };
  emit();
  window.addEventListener("beforeunload", onBeforeUnload);
}

async function poll() {
  const s = session;
  if (!s?.messageId || s.phase === "ended") return;
  try {
    const { data } = await axios.get(`/api/calls/${s.messageId}`);
    if (session?.key !== s.key || session.phase === "ended") return;
    const call = data.call as ServerCall;
    if (data.answerSdp && pc && !answerApplied && s.direction === "outbound") {
      answerApplied = true;
      await pc.setRemoteDescription({ type: "answer", sdp: data.answerSdp });
      if (session.phase === "ringing") patch({ phase: "connecting" });
    }
    if (call.status === "ringing") {
      if (call.deviceRinging && !session.deviceRinging) patch({ deviceRinging: true });
    } else if (call.status === "connected") {
      if (session.phase !== "connected") {
        if (ringTimer) clearTimeout(ringTimer);
        patch({ phase: "connected", connectedAt: call.connectedAt ? Math.min(Date.parse(call.connectedAt), Date.now()) : Date.now() });
      }
    } else {
      finish(call.status, { error: call.status === "failed" ? call.error ?? "The call failed." : null, durationSec: call.durationSec ?? null });
    }
  } catch (e) {
    if ((e as { response?: { status?: number } })?.response?.status === 404) finish("failed", { error: "This call no longer exists." });
  }
}

function startPolling(ms: number) {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => void poll(), ms);
}

/** Lets realtime events (Pusher "call-updated") refresh the active call immediately. */
export function pokeCall(messageId?: string) {
  if (session?.messageId && (!messageId || messageId === session.messageId)) void poll();
}

// ─── public actions ──────────────────────────────────────────────────────────

export async function startOutboundCall(opts: { conversationId: string; contactName: string; contactPhone: string }) {
  if (isCallActive()) throw new Error("You're already on a call.");
  begin({ messageId: null, direction: "outbound", conversationId: opts.conversationId, contactName: opts.contactName, contactPhone: opts.contactPhone, phase: "preparing" });
  const key = session!.key;
  try {
    mic = await getMicrophone();
    if (cancelled || session?.key !== key) return releaseMedia();
    pc = createPeer(mic);
    await pc.setLocalDescription(await pc.createOffer());
    const sdp = await gatheredSdp(pc);
    if (cancelled || session?.key !== key) return releaseMedia();

    const { data } = await axios.post("/api/calls/start", { conversationId: opts.conversationId, sdp });
    if (cancelled || session?.key !== key) {
      // The agent hung up while the call was being placed.
      void axios.post(`/api/calls/${data.messageId}/terminate`).catch(() => undefined);
      return;
    }
    patch({ messageId: data.messageId, phase: "ringing" });
    startPolling(1_500);
    ringTimer = setTimeout(() => {
      if (session?.key === key && session.phase !== "connected" && session.phase !== "ended") void hangup("No answer.");
    }, RING_TIMEOUT_MS);
  } catch (e) {
    if (session?.key === key) finish("failed", { error: apiError(e, "Couldn't start the call.") });
  }
}

export async function acceptIncomingCall(p: PendingCall) {
  if (isCallActive()) throw new Error("Finish your current call first.");
  begin({ messageId: p.messageId, direction: "inbound", conversationId: p.conversationId, contactName: p.contact.name || `+${p.contact.phone}`, contactPhone: p.contact.phone, phase: "connecting" });
  const key = session!.key;
  try {
    mic = await getMicrophone();
    if (session?.key !== key || cancelled) return releaseMedia();
    pc = createPeer(mic);
    await pc.setRemoteDescription({ type: "offer", sdp: p.offerSdp });
    await pc.setLocalDescription(await pc.createAnswer());
    const sdp = await gatheredSdp(pc);
    if (session?.key !== key || cancelled) return releaseMedia();
    await axios.post(`/api/calls/${p.messageId}/accept`, { sdp });
    if (session?.key !== key) return;
    patch({ phase: "connected", connectedAt: Date.now() });
    startPolling(2_000);
  } catch (e) {
    if (session?.key === key) finish("failed", { error: apiError(e, "Couldn't answer the call.") });
  }
}

export async function declineIncomingCall(p: PendingCall) {
  await axios.post(`/api/calls/${p.messageId}/reject`);
}

export async function hangup(reason?: string) {
  const s = session;
  if (!s || s.phase === "ended") return;
  cancelled = true;
  const id = s.messageId;
  releaseMedia();
  let outcome: ServerCall["status"] = s.phase === "connected" ? "ended" : s.direction === "outbound" ? "missed" : "rejected";
  let durationSec: number | null = null;
  if (id) {
    try {
      const { data } = await axios.post(`/api/calls/${id}/terminate`);
      const call = data.call as ServerCall | null;
      if (call) {
        outcome = call.status;
        durationSec = call.durationSec ?? null;
      }
    } catch { /* the server/webhook closes it anyway */ }
  }
  if (session?.key === s.key) finish(outcome, { error: reason && reason !== "No answer." ? reason : null, durationSec });
}

export function toggleMute() {
  if (!session || !mic) return;
  const muted = !session.muted;
  mic.getAudioTracks().forEach((t) => (t.enabled = !muted));
  patch({ muted });
}

export function dismissCall() {
  if (session && session.phase !== "ended") return;
  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = null;
  session = null;
  emit();
}
