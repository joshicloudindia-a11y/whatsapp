"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";

/** WhatsApp voice notes must be OGG/Opus; we only record when the browser can produce exactly that. */
export const VOICE_MIME = "audio/ogg;codecs=opus";
const MAX_SECONDS = 300;

const noop = () => () => {};
export function useVoiceSupported() {
  return useSyncExternalStore(
    noop,
    () => typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia && MediaRecorder.isTypeSupported(VOICE_MIME),
    () => false,
  );
}

/** [chat] Mic button → records a voice note and hands back an .ogg File (uploaded via the media route). */
export function VoiceRecorderButton({ disabled, onRecorded }: { disabled?: boolean; onRecorded: (file: File) => void }) {
  const supported = useVoiceSupported();
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const cancelled = useRef(false);
  const stream = useRef<MediaStream | null>(null);

  const stopTracks = () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; };

  useEffect(() => {
    if (!recording) return;
    const started = Date.now();
    const t = setInterval(() => {
      const s = Math.floor((Date.now() - started) / 1000);
      setSeconds(s);
      if (s >= MAX_SECONDS) recorder.current?.stop();
    }, 250);
    return () => clearInterval(t);
  }, [recording]);

  // Release the microphone if the composer unmounts mid-recording.
  useEffect(() => () => { cancelled.current = true; if (recorder.current?.state === "recording") recorder.current.stop(); stopTracks(); }, []);

  if (!supported) return null;

  const start = async () => {
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream.current, { mimeType: VOICE_MIME });
      chunks.current = [];
      cancelled.current = false;
      rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      rec.onstop = () => {
        stopTracks();
        setRecording(false);
        setSeconds(0);
        if (cancelled.current || !chunks.current.length) return;
        const blob = new Blob(chunks.current, { type: "audio/ogg" });
        onRecorded(new File([blob], `voice-${new Date().toISOString().replace(/[:.]/g, "-")}.ogg`, { type: "audio/ogg" }));
      };
      recorder.current = rec;
      rec.start(1000);
      setRecording(true);
    } catch (e) {
      stopTracks();
      toast.error((e as { name?: string })?.name === "NotAllowedError" ? "Microphone permission was denied." : "Couldn't start recording.");
    }
  };
  const stop = (cancel: boolean) => { cancelled.current = cancel; recorder.current?.stop(); };

  if (recording) {
    return (
      <div className="flex items-center gap-1 rounded-full bg-red-50 pl-3 pr-1 h-11" role="status" aria-live="polite">
        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        <span className="text-xs font-semibold tabular-nums text-red-700 w-10">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span>
        <button onClick={() => stop(true)} aria-label="Cancel recording" className="w-9 h-9 flex items-center justify-center rounded-full text-slate-500 hover:bg-white"><Icon name="delete" className="w-4 h-4" /></button>
        <button onClick={() => stop(false)} aria-label="Stop recording" className="w-9 h-9 flex items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600"><Icon name="stop" filled className="w-4 h-4" /></button>
      </div>
    );
  }
  return (
    <button onClick={start} disabled={disabled} aria-label="Record a voice message" title="Record a voice message"
      className="w-11 h-11 shrink-0 flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 disabled:opacity-40">
      <Icon name="mic" className="w-5 h-5" />
    </button>
  );
}
