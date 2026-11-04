"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Icon, MATERIAL_ICON_NAMES } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import {
  MeshEngine, audioConstraints, mediaErrorMessage, mediaSupportError, videoConstraints,
  type MeetingRole, type MeshSnapshot, type Quality, type RemotePeer, type ServerParticipant,
} from "./mesh-engine";

/**
 * [meetings] Shared video room UI: pre-join (name, preview, device pickers, permission help) → room
 * (grid, controls, chat, participants). Used by the public guest page (/meet/[code]?t=…) and the agent page
 * (/meetings/[code] inside the dashboard).
 */

// Icons not yet in MATERIAL_ICON_NAMES fall back to an existing glyph instead of rendering as text.
const ICONS = new Set<string>(MATERIAL_ICON_NAMES);
const ic = (name: string, fallback: string) => (ICONS.has(name) ? name : fallback);
const I = {
  camOff: ic("videocam_off", "visibility_off"),
  screen: ic("screen_share", "upload"),
  stopScreen: ic("stop_screen_share", "stop"),
  flip: ic("flip_camera_android", "refresh"),
  signal: ic("signal_cellular_alt", "wifi"),
  link: ic("link", "content_copy"),
};

const BRAND = "#25D366";

interface RoomInfo {
  room: { code: string; title: string; status: "ACTIVE" | "ENDED"; maxParticipants: number; expiresAt: string; conversationId?: string | null };
  role: MeetingRole;
  participants: ServerParticipant[];
  me?: { name: string };
  guestUrl?: string;
}

class InfoError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const noopSubscribe = () => () => undefined;
const useMounted = () => useSyncExternalStore(noopSubscribe, () => true, () => false);

function useMediaQuery(q: string) {
  return useSyncExternalStore(
    useCallback((cb: () => void) => {
      const m = window.matchMedia(q);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    }, [q]),
    () => window.matchMedia(q).matches,
    () => false,
  );
}

const NAME_KEY = "chatflow.meetName";

export interface MeetingRoomProps {
  code: string;
  /** Guest token from the link (?t=). Omit on the agent page (session auth). */
  token?: string | null;
  variant: "guest" | "agent";
  /** Where "Back" goes after leaving (agent: inbox). */
  exitHref?: string;
}

export function MeetingRoom(props: MeetingRoomProps) {
  const mounted = useMounted();
  return (
    <div
      className={cn(
        "relative flex flex-col overflow-hidden bg-slate-950 text-white",
        props.variant === "guest" ? "h-dvh min-h-dvh" : "h-full min-h-[420px]",
      )}
    >
      {mounted ? <MeetingApp {...props} /> : <Centered><Spinner label="Loading meeting…" /></Centered>}
    </div>
  );
}

function MeetingApp({ code, token, variant, exitHref }: MeetingRoomProps) {
  const [engine, setEngine] = useState<MeshEngine | null>(null);
  const [attempt, setAttempt] = useState(0);
  const infoQ = useQuery({
    queryKey: ["meeting", code, token ?? null],
    queryFn: async () => {
      const qs = token ? `?t=${encodeURIComponent(token)}` : "";
      const res = await fetch(`/api/meetings/${encodeURIComponent(code)}${qs}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new InfoError(res.status, data?.error ?? "Couldn't load the meeting");
      return data as RoomInfo;
    },
    retry: (n, e) => !(e instanceof InfoError && e.status < 500) && n < 2,
    refetchInterval: engine ? false : 5_000,
    refetchOnWindowFocus: false,
  });

  if (infoQ.isLoading) return <Centered><Spinner label="Loading meeting…" /></Centered>;
  if (infoQ.isError || !infoQ.data) {
    const e = infoQ.error;
    const status = e instanceof InfoError ? e.status : 0;
    return (
      <StatusScreen
        icon={status === 401 ? "lock" : "error"}
        title={status === 401 ? "Sign in to join" : status === 403 || status === 404 ? "This meeting link isn't valid" : "Couldn't load the meeting"}
        text={status === 403 || status === 404 ? "Ask the business to send you a new link." : e instanceof Error ? e.message : undefined}
        action={status >= 500 || !status ? { label: "Try again", onClick: () => void infoQ.refetch() } : undefined}
        exitHref={exitHref}
      />
    );
  }

  const info = infoQ.data;
  if (info.room.status === "ENDED" && !engine) {
    return <StatusScreen icon="call_end" title="This meeting has ended" text={variant === "guest" ? "You can close this page." : undefined} exitHref={exitHref} />;
  }

  const inviteLink = info.guestUrl ?? (typeof window !== "undefined" ? window.location.href : "");

  if (!engine) {
    return (
      <PreJoin
        key={attempt}
        info={info}
        variant={variant}
        onJoin={(opts) => {
          const e = new MeshEngine({ code, token, role: info.role, ...opts });
          setEngine(e);
          void e.start();
        }}
      />
    );
  }
  return (
    <Room
      engine={engine}
      info={info}
      inviteLink={inviteLink}
      exitHref={exitHref}
      onRejoin={() => {
        setEngine(null);
        setAttempt((a) => a + 1);
        void infoQ.refetch();
      }}
    />
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Pre-join
// ═════════════════════════════════════════════════════════════════════════════

interface JoinOpts {
  name: string;
  audioTrack: MediaStreamTrack | null;
  camTrack: MediaStreamTrack | null;
  mic: boolean;
  facing: "user" | "environment";
  videoDeviceId: string | null;
}

function PreJoin({ info, variant, onJoin }: { info: RoomInfo; variant: "guest" | "agent"; onJoin: (o: JoinOpts) => void }) {
  const isAgent = info.role === "agent";
  const [name, setName] = useState(() => {
    if (isAgent) return info.me?.name ?? "Agent";
    try {
      return window.localStorage.getItem(NAME_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const support = useMemo(() => mediaSupportError(), []);
  const [audioTrack, setAudioTrack] = useState<MediaStreamTrack | null>(null);
  const [camTrack, setCamTrack] = useState<MediaStreamTrack | null>(null);
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [busy, setBusy] = useState(!support);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioId, setAudioId] = useState("");
  const [videoId, setVideoId] = useState("");

  const audioRef = useRef<MediaStreamTrack | null>(null);
  const camRef = useRef<MediaStreamTrack | null>(null);
  const gen = useRef({ audio: 0, video: 0 });
  const alive = useRef(true);
  const handedOff = useRef(false);
  const videoEl = useRef<HTMLVideoElement>(null);

  const putAudio = useCallback((t: MediaStreamTrack | null) => {
    if (audioRef.current && audioRef.current !== t) audioRef.current.stop();
    audioRef.current = t;
    setAudioTrack(t);
  }, []);
  const putCam = useCallback((t: MediaStreamTrack | null) => {
    if (camRef.current && camRef.current !== t) camRef.current.stop();
    camRef.current = t;
    setCamTrack(t);
  }, []);

  /** Opens the requested kinds; partial success is kept, failures are explained. */
  const acquire = useCallback(async (want: { audio: boolean; video: boolean }, ids: { audio?: string; video?: string } = {}) => {
    const g = { audio: want.audio ? ++gen.current.audio : -1, video: want.video ? ++gen.current.video : -1 };
    let a: MediaStreamTrack | null = null;
    let v: MediaStreamTrack | null = null;
    let errA: unknown = null;
    let errV: unknown = null;
    const aC = audioConstraints(ids.audio || null);
    const vC = videoConstraints({ deviceId: ids.video || null, facing: "user" });
    if (want.audio && want.video) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: aC, video: vC });
        a = s.getAudioTracks()[0] ?? null;
        v = s.getVideoTracks()[0] ?? null;
      } catch (e) {
        errA = errV = e;
      }
    }
    if (want.audio && !a) {
      try {
        a = (await navigator.mediaDevices.getUserMedia({ audio: aC })).getAudioTracks()[0] ?? null;
        errA = null;
      } catch (e) {
        errA = e;
      }
    }
    if (want.video && !v) {
      try {
        v = (await navigator.mediaDevices.getUserMedia({ video: vC })).getVideoTracks()[0] ?? null;
        errV = null;
      } catch (e) {
        errV = e;
      }
    }
    // Unmounted or superseded by a newer request → discard.
    const stale = (kind: "audio" | "video") => !alive.current || gen.current[kind] !== g[kind];
    if (a && stale("audio")) { a.stop(); a = null; }
    if (v && stale("video")) { v.stop(); v = null; }
    if (!alive.current) return;
    if (want.audio && !stale("audio")) putAudio(a);
    if (want.video && !stale("video")) {
      putCam(v);
      setCam(!!v);
    }
    const failA = want.audio && !a && errA;
    const failV = want.video && !v && errV;
    setError(
      failA && failV ? mediaErrorMessage(errV ?? errA, "camera and microphone")
        : failV ? mediaErrorMessage(errV, "camera")
        : failA ? mediaErrorMessage(errA, "microphone")
        : null,
    );
    setBusy(false);
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      if (alive.current) setDevices(list.filter((d) => d.deviceId && (d.kind === "audioinput" || d.kind === "videoinput")));
    } catch {
      /* not available */
    }
  }, [putAudio, putCam]);

  useEffect(() => {
    alive.current = true;
    if (!support) void acquire({ audio: true, video: true });
    return () => {
      alive.current = false;
      if (!handedOff.current) {
        audioRef.current?.stop();
        camRef.current?.stop();
        audioRef.current = camRef.current = null;
      }
    };
  }, [acquire, support]);

  useEffect(() => {
    const v = videoEl.current;
    if (!v) return;
    v.srcObject = camTrack ? new MediaStream([camTrack]) : null;
    if (camTrack) v.play().catch(() => undefined);
  }, [camTrack]);

  useEffect(() => {
    const t = audioRef.current; // the same track as `audioTrack` (state can't be mutated)
    if (t) t.enabled = mic;
  }, [audioTrack, mic]);

  const retry = () => {
    setBusy(true);
    setError(null);
    void acquire({ audio: !audioTrack, video: cam && !camTrack }, { audio: audioId, video: videoId });
  };

  const toggleCam = () => {
    if (cam) {
      gen.current.video++;
      putCam(null);
      setCam(false);
    } else {
      setCam(true);
      setBusy(true);
      void acquire({ audio: false, video: true }, { video: videoId });
    }
  };
  const toggleMic = () => {
    if (!audioTrack) {
      setMic(true);
      void acquire({ audio: true, video: false }, { audio: audioId });
      return;
    }
    setMic((m) => !m);
  };

  const pickAudio = (id: string) => {
    setAudioId(id);
    putAudio(null);
    void acquire({ audio: true, video: false }, { audio: id });
  };
  const pickVideo = (id: string) => {
    setVideoId(id);
    if (!cam) return;
    putCam(null);
    setBusy(true);
    void acquire({ audio: false, video: true }, { video: id });
  };

  const others = info.participants;
  const trimmed = name.trim();
  const canJoin = trimmed.length > 0 && trimmed.length <= 40;
  const mics = devices.filter((d) => d.kind === "audioinput");
  const cams = devices.filter((d) => d.kind === "videoinput");

  const join = () => {
    if (!canJoin) return;
    if (!isAgent) {
      try {
        window.localStorage.setItem(NAME_KEY, trimmed);
      } catch {
        /* private mode */
      }
    }
    handedOff.current = true;
    onJoin({ name: trimmed, audioTrack, camTrack: cam ? camTrack : null, mic: mic && !!audioTrack, facing: "user", videoDeviceId: videoId || null });
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 md:flex-row md:items-center md:gap-10 md:py-10">
        {/* Preview */}
        <div className="w-full md:flex-[1.3]">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl bg-slate-900 ring-1 ring-white/10 sm:aspect-video">
            <video ref={videoEl} autoPlay playsInline muted className={cn("h-full w-full -scale-x-100 object-cover", !camTrack && "hidden")} />
            {!camTrack && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-400">
                {busy ? <Spinner label="Starting camera…" /> : (
                  <>
                    <Avatar name={trimmed || "You"} big />
                    <p className="text-sm">{cam ? "Camera unavailable" : "Camera is off"}</p>
                  </>
                )}
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 flex justify-center gap-3 bg-gradient-to-t from-black/60 to-transparent p-4">
              <RoundButton label={mic && audioTrack ? "Mute microphone" : "Unmute microphone"} icon={mic && audioTrack ? "mic" : "mic_off"} danger={!(mic && audioTrack)} onClick={toggleMic} disabled={!!support} />
              <RoundButton label={cam ? "Turn camera off" : "Turn camera on"} icon={cam && camTrack ? "videocam" : I.camOff} danger={!(cam && camTrack)} onClick={toggleCam} disabled={!!support} />
            </div>
          </div>

          {(mics.length > 0 || cams.length > 0) && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {mics.length > 0 && (
                <DeviceSelect label="Microphone" icon="mic" value={audioId || audioTrack?.getSettings().deviceId || ""} devices={mics} onChange={pickAudio} />
              )}
              {cams.length > 0 && (
                <DeviceSelect label="Camera" icon="videocam" value={videoId || camTrack?.getSettings().deviceId || ""} devices={cams} onChange={pickVideo} />
              )}
            </div>
          )}
        </div>

        {/* Join card */}
        <div className="w-full md:flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: BRAND }}>{variant === "agent" ? "Start your meeting" : "You're invited"}</p>
          <h1 className="mt-1 text-2xl font-bold leading-tight">{info.room.title}</h1>
          <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-400">
            <Icon name="group" className="w-4 h-4" />
            {others.length === 0 ? "No one else is here yet" : `${others.map((p) => p.name).slice(0, 3).join(", ")}${others.length > 3 ? ` +${others.length - 3}` : ""} ${others.length === 1 ? "is" : "are"} in the call`}
          </p>

          {support && <Notice tone="error" icon="error">{support}</Notice>}
          {error && !support && (
            <Notice tone="warn" icon="warning">
              {error}
              <button type="button" onClick={retry} disabled={busy} className="mt-2 block font-semibold underline underline-offset-2 disabled:opacity-50">
                {busy ? "Trying…" : "Try again"}
              </button>
            </Notice>
          )}

          <form
            className="mt-5 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              join();
            }}
          >
            {!isAgent && (
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-300">Your name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 40))}
                  placeholder="Enter your name"
                  autoComplete="name"
                  enterKeyHint="go"
                  maxLength={40}
                  className="h-12 w-full rounded-xl border border-white/10 bg-slate-900 px-4 text-base text-white placeholder:text-slate-500 focus:border-[#25D366] focus:outline-none focus:ring-2 focus:ring-[#25D366]/30"
                />
              </label>
            )}
            <button
              type="submit"
              disabled={!canJoin || (busy && !support)}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl text-base font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundColor: BRAND }}
            >
              <Icon name="videocam" filled className="w-5 h-5" />
              {!audioTrack && !camTrack && !busy ? "Join without camera & mic" : "Join now"}
            </button>
            {!canJoin && !isAgent && <p className="text-xs text-slate-500">Enter your name to join.</p>}
          </form>

          <p className="mt-6 flex items-start gap-1.5 text-xs text-slate-500">
            <Icon name="lock" className="mt-0.5 w-3.5 h-3.5 shrink-0" />
            Your video goes directly between participants&apos; browsers. Nothing is recorded.
          </p>
        </div>
      </div>
    </div>
  );
}

function DeviceSelect({ label, icon, value, devices, onChange }: { label: string; icon: string; value: string; devices: MediaDeviceInfo[]; onChange: (id: string) => void }) {
  return (
    <label className="flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-3 focus-within:ring-2 focus-within:ring-[#25D366]/30">
      <Icon name={icon} className="w-4 h-4 shrink-0 text-slate-400" />
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="min-w-0 flex-1 truncate bg-transparent text-sm text-slate-200 focus:outline-none">
        {!devices.some((d) => d.deviceId === value) && <option value="">Default {label.toLowerCase()}</option>}
        {devices.map((d, i) => (
          <option key={d.deviceId} value={d.deviceId} className="bg-slate-900">{d.label || `${label} ${i + 1}`}</option>
        ))}
      </select>
    </label>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Room
// ═════════════════════════════════════════════════════════════════════════════

function Room({ engine, info, inviteLink, exitHref, onRejoin }: { engine: MeshEngine; info: RoomInfo; inviteLink: string; exitHref?: string; onRejoin: () => void }) {
  const snap = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
  const isAgent = info.role === "agent";
  const wide = useMediaQuery("(min-width: 768px)");
  const [caps] = useState(() => {
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    return { screen: !coarse && !!navigator.mediaDevices?.getDisplayMedia, flip: coarse };
  });
  const [panel, setPanel] = useState<null | "chat" | "people">(null);
  const [seenChat, setSeenChat] = useState(0);
  const [leaveMenu, setLeaveMenu] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [busy, setBusy] = useState<null | "mic" | "cam" | "screen" | "flip" | "end">(null);

  // Leave on unmount (deferred inside the engine so React dev's double effect run doesn't end the call) and on tab close.
  useEffect(() => {
    engine.retain();
    const onHide = (e: PageTransitionEvent) => { if (!e.persisted) engine.beaconLeave(); };
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      engine.release();
    };
  }, [engine]);

  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - engine.joinedAt) / 1000)), 1_000);
    return () => clearInterval(id);
  }, [engine]);

  const onBlocked = useCallback(() => setAudioBlocked(true), []);
  const unlockAudio = () => {
    document.querySelectorAll<HTMLVideoElement>("video[data-remote]").forEach((v) => void v.play().catch(() => undefined));
    setAudioBlocked(false);
  };

  const run = async (key: NonNullable<typeof busy>, fn: () => Promise<void>, what: string) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      const name = (e as { name?: string })?.name;
      if (key === "screen" && name === "NotAllowedError") return; // user cancelled the picker
      toast.error(mediaErrorMessage(e, what));
    } finally {
      setBusy(null);
    }
  };

  const copyInvite = () => {
    navigator.clipboard?.writeText(inviteLink).then(() => toast.success("Invite link copied"), () => toast.error("Couldn't copy the link"));
  };

  const endForAll = async () => {
    setBusy("end");
    try {
      const res = await fetch(`/api/meetings/${encodeURIComponent(info.room.code)}/end`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Couldn't end the meeting");
      engine.leave();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't end the meeting");
    } finally {
      setBusy(null);
      setLeaveMenu(false);
    }
  };

  if (snap.status !== "live" && snap.status !== "joining") {
    const s = snap.status;
    return (
      <StatusScreen
        icon={s === "ended" ? "call_end" : s === "left" ? "logout" : s === "full" ? "group" : "error"}
        title={s === "ended" ? "The meeting has ended" : s === "left" ? "You left the meeting" : s === "full" ? "This meeting is full" : "Connection problem"}
        text={s === "full" ? snap.error ?? undefined : s === "error" ? snap.error ?? "Something went wrong." : s === "ended" && !isAgent ? "Thanks for joining. You can close this page." : undefined}
        action={s === "left" || s === "full" || s === "error" ? { label: s === "left" ? "Rejoin" : "Try again", onClick: onRejoin } : undefined}
        exitHref={exitHref}
      />
    );
  }

  const peers = snap.peers;
  const unread = panel === "chat" ? 0 : snap.chat.filter((m) => !m.mine).length - seenChat;
  const openPanel = (p: "chat" | "people") => {
    setPanel((cur) => (cur === p ? null : p));
    setSeenChat(snap.chat.filter((m) => !m.mine).length);
  };
  const closePanel = () => {
    setPanel(null);
    setSeenChat(snap.chat.filter((m) => !m.mine).length);
  };
  const worst = worstQuality(peers);
  const local = snap.local;

  const localTile = (cls?: string, compact?: boolean) => (
    <VideoTile
      key="local"
      className={cls}
      stream={local.preview}
      trackKey={local.previewKey}
      muted
      local
      name={`${info.me?.name && isAgent ? info.me.name : "You"}`}
      label="You"
      mic={local.mic}
      videoOn={local.cam || local.screen}
      mirrored={local.cam && !local.screen && local.facing === "user"}
      compact={compact}
    />
  );
  const remoteTile = (p: RemotePeer, cls?: string, compact?: boolean) => (
    <VideoTile
      key={p.peer}
      className={cls}
      stream={p.stream}
      trackKey={p.trackKey}
      name={p.name}
      label={p.role === "agent" ? `${p.name} · Host` : p.name}
      mic={p.mic}
      videoOn={p.cam || p.screen}
      contain={p.screen}
      quality={p.quality}
      connection={p.connection}
      speaking={peers.length > 1 && snap.activePeer === p.peer && p.audioLevel > 0.04}
      compact={compact}
      onBlocked={onBlocked}
    />
  );

  let stage: React.ReactNode;
  if (wide || peers.length === 0) {
    const n = peers.length + 1;
    stage = peers.length === 0 ? (
      <div className="relative h-full">
        {localTile("h-full")}
        <WaitingCard isAgent={isAgent} onCopy={copyInvite} />
      </div>
    ) : (
      <div className={cn("grid h-full gap-2", n === 2 ? "grid-cols-1 grid-rows-2 md:grid-cols-2 md:grid-rows-1" : "grid-cols-2 grid-rows-2")}>
        {peers.map((p) => remoteTile(p))}
        {localTile()}
      </div>
    );
  } else {
    // Phone: active speaker large, other remotes in a strip, yourself as a picture-in-picture.
    const main = peers.find((p) => p.peer === snap.activePeer) ?? peers[0];
    const rest = peers.filter((p) => p !== main);
    stage = (
      <div className="relative h-full">
        {remoteTile(main, "h-full")}
        {rest.length > 0 && (
          <div className="absolute bottom-2 left-2 flex gap-2">
            {rest.map((p) => remoteTile(p, "h-28 w-24 shadow-lg ring-1 ring-white/10", true))}
          </div>
        )}
        {localTile("absolute right-2 top-2 h-36 w-24 shadow-xl ring-1 ring-white/20", true)}
      </div>
    );
  }

  return (
    <>
      {/* Top bar */}
      <div className="flex items-center gap-3 px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{info.room.title}</p>
          <p className="flex items-center gap-2 text-xs text-slate-400">
            <span className="tabular-nums">{formatElapsed(elapsed)}</span>
            <span aria-hidden>·</span>
            <span>{peers.length + 1} / {info.room.maxParticipants}</span>
            {snap.reconnecting && <span className="flex items-center gap-1 text-amber-400"><Icon name="hourglass_top" className="w-3 h-3 animate-pulse" /> Reconnecting…</span>}
          </p>
        </div>
        {peers.length > 0 && <QualityBadge quality={worst} />}
        <button type="button" onClick={copyInvite} className="flex h-10 items-center gap-1.5 rounded-full bg-white/10 px-3 text-xs font-semibold hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366]">
          <Icon name={I.link} className="w-4 h-4" /> <span className="hidden sm:inline">Copy invite link</span><span className="sm:hidden">Invite</span>
        </button>
      </div>

      {audioBlocked && (
        <button type="button" onClick={unlockAudio} className="mx-3 mb-2 flex items-center justify-center gap-2 rounded-xl bg-amber-500/15 px-3 py-2 text-sm font-semibold text-amber-300 ring-1 ring-amber-500/30">
          <Icon name="touch_app" className="w-4 h-4" /> Tap to turn on sound
        </button>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1 px-2 pb-2">{stage}</div>
        {panel && (
          <SidePanel
            panel={panel}
            snap={snap}
            meName={isAgent ? info.me?.name ?? "You" : "You"}
            onClose={closePanel}
            onSend={(t) => engine.sendChat(t)}
            onSwitch={setPanel}
          />
        )}
      </div>

      {/* Controls */}
      <div className="relative flex items-center justify-center gap-2 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:gap-3">
        <RoundButton label={local.mic ? "Mute microphone" : "Unmute microphone"} icon={local.mic ? "mic" : "mic_off"} danger={!local.mic}
          disabled={busy === "mic"} onClick={() => run("mic", () => engine.setMic(!local.mic), "microphone")} />
        <RoundButton label={local.cam ? "Turn camera off" : "Turn camera on"} icon={local.cam ? "videocam" : I.camOff} danger={!local.cam}
          disabled={busy === "cam"} onClick={() => run("cam", () => engine.setCam(!local.cam), "camera")} />
        {caps.flip && local.cam && (
          <RoundButton label="Switch camera" icon={I.flip} disabled={busy === "flip"} onClick={() => run("flip", () => engine.switchCamera(), "camera")} />
        )}
        {caps.screen && (
          <RoundButton label={local.screen ? "Stop sharing screen" : "Share screen"} icon={local.screen ? I.stopScreen : I.screen} active={local.screen}
            disabled={busy === "screen"} onClick={() => run("screen", () => (local.screen ? engine.stopScreen() : engine.startScreen()), "screen")} />
        )}
        <RoundButton label="Chat" icon="chat" active={panel === "chat"} badge={unread > 0 ? unread : undefined} onClick={() => openPanel("chat")} />
        <RoundButton label="Participants" icon="group" active={panel === "people"} className="hidden sm:flex" onClick={() => openPanel("people")} />
        <div className="relative">
          <button
            type="button"
            onClick={() => (isAgent ? setLeaveMenu((v) => !v) : engine.leave())}
            aria-label={isAgent ? "Leave or end the meeting" : "Leave meeting"}
            aria-haspopup={isAgent ? "menu" : undefined}
            aria-expanded={isAgent ? leaveMenu : undefined}
            title="Leave"
            className="flex h-12 w-16 items-center justify-center rounded-full bg-red-600 text-white transition hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:h-14 sm:w-20"
          >
            <Icon name="call_end" filled className="w-6 h-6" />
          </button>
          {isAgent && leaveMenu && (
            <div role="menu" className="absolute bottom-16 right-0 z-50 w-56 overflow-hidden rounded-2xl bg-slate-800 p-1.5 shadow-2xl ring-1 ring-white/10">
              <button role="menuitem" type="button" onClick={() => engine.leave()} className="flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left text-sm hover:bg-white/10">
                <Icon name="logout" className="w-4 h-4" /> Leave meeting
              </button>
              <button role="menuitem" type="button" onClick={endForAll} disabled={busy === "end"} className="flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left text-sm font-semibold text-red-400 hover:bg-red-500/10 disabled:opacity-50">
                <Icon name="call_end" className="w-4 h-4" /> {busy === "end" ? "Ending…" : "End meeting for all"}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function WaitingCard({ isAgent, onCopy }: { isAgent: boolean; onCopy: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center px-4">
      <div className="pointer-events-auto max-w-sm rounded-2xl bg-slate-900/85 px-4 py-3 text-center text-sm shadow-xl ring-1 ring-white/10 backdrop-blur">
        <p className="font-semibold">{isAgent ? "Waiting for the customer to join…" : "Waiting for others to join…"}</p>
        {isAgent && (
          <button type="button" onClick={onCopy} className="mt-1 text-xs font-semibold hover:underline" style={{ color: BRAND }}>
            Copy invite link
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Tiles ───────────────────────────────────────────────────────────────────

function VideoTile(props: {
  stream: MediaStream; trackKey: string; name: string; label: string; mic: boolean; videoOn: boolean;
  muted?: boolean; local?: boolean; mirrored?: boolean; contain?: boolean; quality?: Quality; connection?: RTCPeerConnectionState;
  speaking?: boolean; compact?: boolean; className?: string; onBlocked?: () => void;
}) {
  const { stream, trackKey, muted, onBlocked } = props;
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (v.srcObject !== stream) v.srcObject = stream;
    v.play().catch((e) => {
      if (!muted && (e as { name?: string })?.name === "NotAllowedError") onBlocked?.();
    });
  }, [stream, trackKey, muted, onBlocked]);

  const connecting = !props.local && props.connection !== "connected";
  return (
    <div
      className={cn(
        "relative min-h-0 overflow-hidden rounded-2xl bg-slate-900 ring-2 transition-shadow",
        props.speaking ? "ring-[#25D366]" : "ring-transparent",
        props.className,
      )}
    >
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        data-remote={props.local ? undefined : ""}
        className={cn("h-full w-full", props.contain ? "object-contain" : "object-cover", props.mirrored && "-scale-x-100", !props.videoOn && "opacity-0")}
      />
      {!props.videoOn && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Avatar name={props.name} big={!props.compact} />
        </div>
      )}
      {connecting && (
        <div className="absolute inset-x-0 top-2 flex justify-center">
          <span className="rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-slate-200">
            {props.connection === "failed" || props.connection === "disconnected" ? "Reconnecting…" : "Connecting…"}
          </span>
        </div>
      )}
      <div className={cn("absolute bottom-1.5 left-1.5 flex max-w-[calc(100%-0.75rem)] items-center gap-1 rounded-lg bg-black/55 px-2 py-1", props.compact && "px-1.5 py-0.5")}>
        {!props.mic && <Icon name="mic_off" className="w-3.5 h-3.5 shrink-0 text-red-400" title="Microphone off" />}
        <span className={cn("truncate font-medium", props.compact ? "text-[10px]" : "text-xs")}>{props.compact ? props.name : props.label}</span>
        {!props.local && props.quality && props.quality !== "unknown" && !props.compact && <QualityDot quality={props.quality} />}
      </div>
    </div>
  );
}

function Avatar({ name, big }: { name: string; big?: boolean }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
  return (
    <span
      aria-hidden
      className={cn("flex items-center justify-center rounded-full font-semibold text-slate-950", big ? "h-20 w-20 text-2xl" : "h-10 w-10 text-sm")}
      style={{ backgroundColor: BRAND }}
    >
      {initials}
    </span>
  );
}

const QUALITY: Record<Quality, { color: string; label: string }> = {
  good: { color: "text-[#25D366]", label: "Good connection" },
  fair: { color: "text-amber-400", label: "Unstable connection" },
  poor: { color: "text-red-400", label: "Poor connection" },
  unknown: { color: "text-slate-400", label: "Checking connection" },
};

function worstQuality(peers: RemotePeer[]): Quality {
  const order: Quality[] = ["poor", "fair", "good"];
  for (const q of order) if (peers.some((p) => p.quality === q)) return q;
  return "unknown";
}

function QualityDot({ quality }: { quality: Quality }) {
  return <Icon name={I.signal} className={cn("w-3.5 h-3.5 shrink-0", QUALITY[quality].color)} title={QUALITY[quality].label} />;
}

function QualityBadge({ quality }: { quality: Quality }) {
  return (
    <span className={cn("flex h-10 items-center gap-1 rounded-full bg-white/5 px-2.5 text-xs", QUALITY[quality].color)} role="status" aria-label={QUALITY[quality].label} title={QUALITY[quality].label}>
      <Icon name={I.signal} className="w-4 h-4" />
      <span className="hidden lg:inline">{QUALITY[quality].label}</span>
    </span>
  );
}

// ─── Side panel (chat / participants) ────────────────────────────────────────

function SidePanel({ panel, snap, meName, onClose, onSend, onSwitch }: {
  panel: "chat" | "people"; snap: MeshSnapshot; meName: string; onClose: () => void; onSend: (t: string) => void; onSwitch: (p: "chat" | "people") => void;
}) {
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const count = snap.chat.length;
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count, panel]);

  const tab = (p: "chat" | "people", label: string) => (
    <button type="button" role="tab" aria-selected={panel === p} onClick={() => onSwitch(p)}
      className={cn("h-10 flex-1 rounded-lg text-sm font-semibold", panel === p ? "bg-white/10 text-white" : "text-slate-400 hover:text-white")}>
      {label}
    </button>
  );

  return (
    <aside
      aria-label={panel === "chat" ? "Chat" : "Participants"}
      className="fixed inset-0 z-40 flex flex-col bg-slate-900 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] md:static md:z-auto md:mb-2 md:mr-2 md:w-80 md:rounded-2xl md:pb-0 md:pt-0 md:ring-1 md:ring-white/10"
    >
      <div className="flex items-center gap-2 p-2">
        <div role="tablist" className="flex flex-1 gap-1 rounded-xl bg-black/20 p-1">
          {tab("chat", "Chat")}
          {tab("people", `People (${snap.peers.length + 1})`)}
        </div>
        <button type="button" onClick={onClose} aria-label="Close panel" className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 hover:bg-white/10 hover:text-white">
          <Icon name="close" className="w-5 h-5" />
        </button>
      </div>

      {panel === "chat" ? (
        <>
          <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-2" aria-live="polite">
            {snap.chat.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Messages are only visible during the meeting.</p>}
            {snap.chat.map((m) => (
              <div key={m.id} className={cn("flex flex-col", m.mine ? "items-end" : "items-start")}>
                {!m.mine && <span className="mb-0.5 px-1 text-[11px] font-semibold text-slate-400">{m.name}</span>}
                <p className={cn("max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm", m.mine ? "text-slate-950" : "bg-white/10 text-white")}
                  style={m.mine ? { backgroundColor: BRAND } : undefined}>
                  {m.text}
                </p>
              </div>
            ))}
          </div>
          <form
            className="flex items-center gap-2 border-t border-white/10 p-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!text.trim()) return;
              onSend(text);
              setText("");
            }}
          >
            <label htmlFor="meet-chat" className="sr-only">Message</label>
            <input id="meet-chat" value={text} onChange={(e) => setText(e.target.value.slice(0, 1000))} placeholder="Send a message" autoComplete="off" enterKeyHint="send"
              className="h-11 min-w-0 flex-1 rounded-xl bg-black/30 px-3 text-base text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#25D366]/40 sm:text-sm" />
            <button type="submit" disabled={!text.trim()} aria-label="Send message" className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-950 disabled:opacity-40" style={{ backgroundColor: BRAND }}>
              <Icon name="send" className="w-5 h-5" />
            </button>
          </form>
        </>
      ) : (
        <ul className="flex-1 space-y-1 overflow-y-auto px-2 py-2">
          <PersonRow name={`${meName} (you)`} host={snap.peerId.startsWith("a-")} mic={snap.local.mic} cam={snap.local.cam || snap.local.screen} screen={snap.local.screen} />
          {snap.peers.map((p) => (
            <PersonRow key={p.peer} name={p.name} host={p.role === "agent"} mic={p.mic} cam={p.cam || p.screen} screen={p.screen} quality={p.quality}
              status={p.connection === "connected" ? undefined : p.connection === "failed" || p.connection === "disconnected" ? "Reconnecting…" : "Connecting…"} />
          ))}
        </ul>
      )}
    </aside>
  );
}

function PersonRow({ name, host, mic, cam, screen, quality, status }: { name: string; host: boolean; mic: boolean; cam: boolean; screen: boolean; quality?: Quality; status?: string }) {
  return (
    <li className="flex items-center gap-3 rounded-xl px-2 py-2">
      <Avatar name={name} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="text-[11px] text-slate-400">{[host ? "Host" : "Guest", screen && "Sharing screen", status].filter(Boolean).join(" · ")}</p>
      </div>
      {quality && quality !== "unknown" && <QualityDot quality={quality} />}
      <Icon name={mic ? "mic" : "mic_off"} className={cn("w-4 h-4", mic ? "text-slate-300" : "text-red-400")} title={mic ? "Microphone on" : "Microphone off"} />
      <Icon name={cam ? "videocam" : I.camOff} className={cn("w-4 h-4", cam ? "text-slate-300" : "text-red-400")} title={cam ? "Camera on" : "Camera off"} />
    </li>
  );
}

// ─── Small pieces ────────────────────────────────────────────────────────────

function RoundButton({ label, icon, onClick, danger, active, disabled, badge, className }: {
  label: string; icon: string; onClick: () => void; danger?: boolean; active?: boolean; disabled?: boolean; badge?: number; className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        "relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366] disabled:opacity-50 sm:h-14 sm:w-14",
        danger ? "bg-white text-slate-900 hover:bg-slate-200" : active ? "bg-[#25D366] text-slate-950" : "bg-white/10 text-white hover:bg-white/20",
        className,
      )}
    >
      <Icon name={icon} filled={!danger} className="w-6 h-6" />
      {badge !== undefined && (
        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">{badge > 9 ? "9+" : badge}</span>
      )}
    </button>
  );
}

function Notice({ tone, icon, children }: { tone: "warn" | "error"; icon: string; children: React.ReactNode }) {
  return (
    <div role="alert" className={cn("mt-4 flex gap-2 rounded-xl p-3 text-sm", tone === "error" ? "bg-red-500/10 text-red-300 ring-1 ring-red-500/30" : "bg-amber-500/10 text-amber-200 ring-1 ring-amber-500/30")}>
      <Icon name={icon} className="mt-0.5 w-4 h-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 items-center justify-center p-6">{children}</div>;
}

function Spinner({ label }: { label: string }) {
  return (
    <div role="status" className="flex flex-col items-center gap-3 text-sm text-slate-400">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-[#25D366]" aria-hidden />
      {label}
    </div>
  );
}

function StatusScreen({ icon, title, text, action, exitHref }: { icon: string; title: string; text?: string; action?: { label: string; onClick: () => void }; exitHref?: string }) {
  return (
    <Centered>
      <div className="max-w-sm text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/5">
          <Icon name={icon} className="w-8 h-8 text-slate-300" />
        </span>
        <h1 className="mt-4 text-xl font-bold">{title}</h1>
        {text && <p className="mt-2 text-sm text-slate-400">{text}</p>}
        <div className="mt-6 flex flex-col gap-2">
          {action && (
            <button type="button" onClick={action.onClick} className="h-12 rounded-xl font-semibold text-slate-950 hover:brightness-110" style={{ backgroundColor: BRAND }}>
              {action.label}
            </button>
          )}
          {exitHref && (
            <Link href={exitHref} className="flex h-12 items-center justify-center gap-1.5 rounded-xl bg-white/10 font-semibold hover:bg-white/15">
              <Icon name="arrow_back" className="w-4 h-4" /> Back to inbox
            </Link>
          )}
        </div>
      </div>
    </Centered>
  );
}

function formatElapsed(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
