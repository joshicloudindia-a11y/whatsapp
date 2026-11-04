"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { dismissCall, hangup, toggleMute, useCallSession, type CallSession, type PendingCall } from "./call-store";

const initials = (name: string) =>
  name.replace(/^\+/, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

export function formatClock(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

/** Hang-up glyph: Material "call" rotated like WhatsApp's end-call button (call_end isn't in the icon subset). */
export function HangupIcon({ className }: { className?: string }) {
  return <Icon name="call" filled className={cn("rotate-[135deg]", className)} />;
}

/** Mic glyph with a slash when muted (mic_off isn't in the icon subset). */
function MicGlyph({ muted, className }: { muted: boolean; className?: string }) {
  return (
    <span className="relative inline-flex">
      <Icon name="mic" filled={!muted} className={className} />
      {muted && <span aria-hidden className="absolute left-1/2 top-1/2 h-[2px] w-[130%] -translate-x-1/2 -translate-y-1/2 rotate-45 rounded bg-current" />}
    </span>
  );
}

function useTicker(active: boolean) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    const t0 = setTimeout(tick, 0);
    const t = setInterval(tick, 1000);
    return () => { clearTimeout(t0); clearInterval(t); };
  }, [active]);
  return now;
}

function statusLine(s: CallSession, now: number): string {
  switch (s.phase) {
    case "preparing": return "Starting call…";
    case "ringing": return s.deviceRinging ? "Ringing…" : "Calling…";
    case "connecting": return "Connecting…";
    case "connected": return s.connectedAt && now ? formatClock((now - s.connectedAt) / 1000) : "0:00";
    case "ended":
      if (s.outcome === "ended") return s.durationSec ? `Call ended · ${formatClock(s.durationSec)}` : "Call ended";
      if (s.outcome === "missed") return s.direction === "outbound" ? "No answer" : "Missed call";
      if (s.outcome === "rejected") return "Call declined";
      if (s.outcome === "failed") return "Call failed";
      return "Call ended";
  }
}

const CONN_LABEL: Partial<Record<CallSession["connectionState"], { text: string; tone: string }>> = {
  connecting: { text: "Connecting audio", tone: "text-amber-300" },
  connected: { text: "Audio connected", tone: "text-green-300" },
  disconnected: { text: "Reconnecting…", tone: "text-amber-300" },
  failed: { text: "Connection failed", tone: "text-red-300" },
};

/** Floating in-call card (bottom-right on desktop, bottom sheet on phones). Renders nothing without a call. */
export function CallPanel() {
  const s = useCallSession();
  const now = useTicker(s?.phase === "connected");
  if (!s) return null;
  const live = s.phase !== "ended";
  const conn = s.phase === "connected" || s.phase === "connecting" ? CONN_LABEL[s.connectionState] : undefined;

  return (
    <div role="region" aria-label={`WhatsApp call with ${s.contactName}`}
      className="fixed z-[70] inset-x-2 bottom-2 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[320px] rounded-2xl bg-[#0b141a] text-white shadow-2xl ring-1 ring-black/20 admin-pop">
      <div className="flex items-center gap-3 p-4">
        <span className={cn("relative w-12 h-12 shrink-0 rounded-full flex items-center justify-center text-base font-bold bg-gradient-to-br from-green-400 to-emerald-600",
          (s.phase === "ringing" || s.phase === "preparing") && "animate-pulse")}>
          {initials(s.contactName)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{s.contactName}</p>
          <p className="text-xs text-slate-300 flex items-center gap-1" aria-live="polite">
            <Icon name="call" className="w-3 h-3 text-[#25D366]" /> WhatsApp · <span className="tabular-nums">{statusLine(s, now)}</span>
          </p>
          {conn && <p className={cn("text-[11px] mt-0.5", conn.tone)}>{conn.text}</p>}
        </div>
        {!live && (
          <button onClick={dismissCall} aria-label="Close" className="w-8 h-8 rounded-full flex items-center justify-center text-slate-300 hover:bg-white/10">
            <Icon name="close" className="w-4 h-4" />
          </button>
        )}
      </div>

      {s.error && (
        <p role="alert" className="mx-4 -mt-1 mb-3 rounded-lg bg-red-500/15 px-3 py-2 text-xs text-red-200 flex gap-2">
          <Icon name="error" className="w-4 h-4 shrink-0" /> <span>{s.error}</span>
        </p>
      )}

      {live && (
        <div className="flex items-center justify-center gap-6 pb-4">
          <button onClick={toggleMute} disabled={s.phase !== "connected" && s.phase !== "connecting"} aria-pressed={s.muted} aria-label={s.muted ? "Unmute microphone" : "Mute microphone"}
            className={cn("w-12 h-12 rounded-full flex items-center justify-center transition disabled:opacity-40",
              s.muted ? "bg-white text-[#0b141a]" : "bg-white/10 text-white hover:bg-white/20")}>
            <MicGlyph muted={s.muted} className="w-5 h-5" />
          </button>
          <button onClick={() => void hangup()} aria-label="End call"
            className="w-14 h-14 rounded-full flex items-center justify-center bg-red-500 text-white shadow-lg hover:bg-red-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-400/40">
            <HangupIcon className="w-6 h-6" />
          </button>
        </div>
      )}
    </div>
  );
}

/** Soft two-tone ring while an incoming call is shown (WebAudio, no asset). Silently skipped if autoplay is blocked. */
function useRingtone(active: boolean) {
  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    let ctx: AudioContext | null = null;
    try { ctx = new Ctx(); } catch { return; }
    const ring = () => {
      if (!ctx || ctx.state === "closed") return;
      ctx.resume().catch(() => undefined);
      const t = ctx.currentTime;
      for (const [i, f] of [440, 480].entries()) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = f;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.05, t + 0.05);
        g.gain.setValueAtTime(0.05, t + 1.2);
        g.gain.linearRampToValueAtTime(0, t + 1.3);
        o.connect(g).connect(ctx.destination);
        o.start(t + i * 0.001);
        o.stop(t + 1.35);
      }
    };
    ring();
    const id = setInterval(ring, 3000);
    return () => { clearInterval(id); ctx?.close().catch(() => undefined); };
  }, [active]);
}

/** Incoming WhatsApp call dialog with Accept / Decline. */
export function IncomingCallModal({ call, busy, onAccept, onDecline, onOpenChat, onDismiss }: {
  call: PendingCall;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onOpenChat?: () => void;
  onDismiss: () => void;
}) {
  const titleId = useId();
  const acceptRef = useRef<HTMLButtonElement>(null);
  const name = call.contact.name || `+${call.contact.phone}`;
  useRingtone(!busy);
  useEffect(() => { acceptRef.current?.focus(); }, [call.messageId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onDismiss(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-slate-950/50 p-2 sm:p-4 admin-fade">
      <div role="alertdialog" aria-modal="true" aria-labelledby={titleId}
        className="w-full sm:w-[360px] rounded-3xl bg-[#0b141a] text-white shadow-2xl p-6 text-center admin-pop">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#25D366] flex items-center justify-center gap-1">
          <Icon name="call" filled className="w-3.5 h-3.5" /> Incoming WhatsApp voice call
        </p>
        <span className="relative mx-auto mt-5 mb-4 flex w-20 h-20 items-center justify-center">
          <span aria-hidden className="absolute inset-0 rounded-full bg-[#25D366]/30 animate-ping" />
          <span className="relative w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold bg-gradient-to-br from-green-400 to-emerald-600">{initials(name)}</span>
        </span>
        <h2 id={titleId} className="text-lg font-bold truncate">{name}</h2>
        {call.contact.name && <p className="text-sm text-slate-400">+{call.contact.phone}</p>}
        {onOpenChat && (
          <button onClick={onOpenChat} className="mt-2 text-xs font-semibold text-[#25D366] hover:underline">Open chat</button>
        )}
        <div className="mt-6 flex items-start justify-center gap-10">
          <div className="flex flex-col items-center gap-1.5">
            <button onClick={onDecline} disabled={busy} aria-label={`Decline call from ${name}`}
              className="w-14 h-14 rounded-full flex items-center justify-center bg-red-500 hover:bg-red-600 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-400/40">
              <HangupIcon className="w-6 h-6" />
            </button>
            <span className="text-xs text-slate-300">Decline</span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <button ref={acceptRef} onClick={onAccept} disabled={busy} aria-label={`Accept call from ${name}`}
              className="w-14 h-14 rounded-full flex items-center justify-center bg-[#25D366] hover:bg-[#1fb857] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-green-400/40">
              <Icon name="call" filled className="w-6 h-6" />
            </button>
            <span className="text-xs text-slate-300">{busy ? "Connecting…" : "Accept"}</span>
          </div>
        </div>
        <button onClick={onDismiss} className="mt-5 text-xs text-slate-400 hover:text-slate-200">Hide (keeps ringing for teammates)</button>
      </div>
    </div>
  );
}
