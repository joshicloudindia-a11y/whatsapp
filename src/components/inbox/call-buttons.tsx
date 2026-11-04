"use client";

import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { pusherClient, orgChannel } from "@/lib/pusher";
import { CALL_EVENTS } from "@/lib/calling-events";
import {
  acceptIncomingCall, declineIncomingCall, isCallActive, pokeCall, startOutboundCall, useCallSession,
  type PendingCall, type ServerCall,
} from "./call-store";
import { CallPanel, IncomingCallModal, formatClock } from "./call-panel";
import { DEFAULT_VIDEO_BASE, getVideoBase, newMeetingUrl, setVideoBase, useCallingStatus, usePendingCalls } from "./use-calling";

const apiErr = (e: unknown, f = "Something went wrong") =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? (e instanceof Error ? e.message : f);

const ENABLE_HELP_URL = "https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/call-settings";

// ═════════════════════════════════════════════════════════════════════════════
// Header buttons
// ═════════════════════════════════════════════════════════════════════════════

export interface CallButtonsContact {
  id: string;
  name: string | null;
  phone: string;
  isBlocked?: boolean;
  optedOut?: boolean;
}

/**
 * Phone + video buttons for the conversation header. The phone menu offers a WhatsApp voice call when the number
 * is calling-enabled and the customer granted permission (else a permission request), plus "Call by phone".
 * The video menu sends a meeting link (Jitsi by default) inside the 24 h window.
 */
export function CallButtons({ conversationId, contact, windowOpen }: { conversationId: string; contact: CallButtonsContact; windowOpen: boolean }) {
  const [menu, setMenu] = useState<null | "voice" | "video">(null);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent | TouchEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setMenu(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(null); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const blockedReason = contact.isBlocked ? "This contact is blocked." : contact.optedOut ? "This contact unsubscribed (STOP)." : null;
  const btn = (active: boolean) =>
    cn("w-9 h-9 flex items-center justify-center rounded-lg border transition",
      active ? "border-green-200 bg-green-50 text-green-700" : "border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700");

  return (
    <div ref={wrap} className="relative flex items-center gap-1.5">
      <button type="button" onClick={() => setMenu((m) => (m === "voice" ? null : "voice"))} aria-haspopup="dialog" aria-expanded={menu === "voice"}
        aria-label="Call" title="Call" className={btn(menu === "voice")}>
        <Icon name="call" className="w-4 h-4" />
      </button>
      <button type="button" onClick={() => setMenu((m) => (m === "video" ? null : "video"))} aria-haspopup="dialog" aria-expanded={menu === "video"}
        aria-label="Video meeting" title="Video meeting" className={btn(menu === "video")}>
        <Icon name="videocam" className="w-4 h-4" />
      </button>

      {menu && (
        <div role="dialog" aria-label={menu === "voice" ? "Call options" : "Video meeting"}
          className="absolute right-0 top-11 z-40 w-[min(92vw,320px)] rounded-2xl border border-slate-200 bg-white p-2 shadow-xl admin-pop">
          {blockedReason ? (
            <p className="flex gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-700"><Icon name="block" className="w-4 h-4 shrink-0" /> {blockedReason} Calls and meeting links are disabled.</p>
          ) : menu === "voice" ? (
            <VoiceMenu conversationId={conversationId} contact={contact} onClose={() => setMenu(null)} onVideo={() => setMenu("video")} />
          ) : (
            <VideoMenu conversationId={conversationId} windowOpen={windowOpen} />
          )}
        </div>
      )}
    </div>
  );
}

function VoiceMenu({ conversationId, contact, onClose, onVideo }: { conversationId: string; contact: CallButtonsContact; onClose: () => void; onVideo: () => void }) {
  const qc = useQueryClient();
  const status = useCallingStatus(conversationId, true);
  const session = useCallSession();
  const [busy, setBusy] = useState<null | "call" | "perm" | "recheck">(null);
  const digits = contact.phone.replace(/\D/g, "");
  const name = contact.name || `+${digits}`;
  const onCall = !!session && session.phase !== "ended";

  const refreshThread = () => {
    qc.invalidateQueries({ queryKey: ["messages", conversationId] });
    qc.invalidateQueries({ queryKey: ["conversations"] });
  };

  const startCall = async () => {
    if (isCallActive()) return toast.error("You're already on a call.");
    onClose();
    try {
      await startOutboundCall({ conversationId, contactName: name, contactPhone: digits });
    } catch (e) {
      toast.error(apiErr(e, "Couldn't start the call"));
    }
    refreshThread();
  };

  const askPermission = async () => {
    setBusy("perm");
    try {
      await axios.post("/api/calls/permission", { conversationId });
      toast.success("Call permission request sent. You can call once the customer allows it.");
      refreshThread();
      qc.invalidateQueries({ queryKey: ["call-status", conversationId] });
    } catch (e) {
      toast.error(apiErr(e, "Couldn't send the request"));
    } finally {
      setBusy(null);
    }
  };

  const recheck = async () => {
    setBusy("recheck");
    try {
      const r = await axios.get("/api/calls/status", { params: { conversationId, fresh: 1 } });
      qc.setQueryData(["call-status", conversationId], r.data);
    } catch (e) {
      toast.error(apiErr(e));
    } finally {
      setBusy(null);
    }
  };

  const logPhone = () => {
    onClose();
    axios.post("/api/calls/log", { conversationId, via: "phone" }).then(refreshThread).catch((e) => toast.error(apiErr(e, "Couldn't log the call")));
  };

  const d = status.data;
  const perm = d?.permission;

  return (
    <div className="space-y-1">
      <p className="px-2 pt-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">WhatsApp voice call</p>

      {status.isLoading ? (
        <div className="px-2 py-3 text-xs text-slate-500 flex items-center gap-2"><Icon name="hourglass_top" className="w-4 h-4 animate-pulse" /> Checking WhatsApp calling…</div>
      ) : status.isError || !d ? (
        <p className="px-2 py-2 text-xs text-red-600">{apiErr(status.error, "Couldn't check calling for this number.")}</p>
      ) : !d.calling.enabled ? (
        <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900 space-y-1.5">
          <p className="font-semibold flex items-center gap-1.5"><Icon name="warning" className="w-4 h-4" /> WhatsApp calling isn&apos;t enabled for this number</p>
          {d.calling.reason && <p className="text-amber-800 break-words">Meta: {d.calling.reason}</p>}
          <div className="flex flex-wrap items-center gap-3 pt-0.5">
            <a href={d.calling.docsUrl || ENABLE_HELP_URL} target="_blank" rel="noreferrer" className="font-semibold text-amber-900 underline">How to enable calling</a>
            <button type="button" onClick={recheck} disabled={busy === "recheck"} className="font-semibold text-amber-900 hover:underline disabled:opacity-50">
              {busy === "recheck" ? "Checking…" : "Check again"}
            </button>
          </div>
          <p className="text-amber-800">Meanwhile, call by phone or send a video meeting link below.</p>
        </div>
      ) : d.canCall ? (
        <>
          <MenuItem icon="call" iconClass="text-[#25D366]" label="Call on WhatsApp" hint={perm?.status === "permanent" ? "Customer allows calls" : perm?.status === "temporary" && perm.expirationTime ? `Allowed until ${new Date(perm.expirationTime * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : "Voice call from your browser"}
            onClick={startCall} disabled={onCall} />
          {onCall && <p className="px-2 text-[11px] text-slate-500">Finish your current call first.</p>}
        </>
      ) : (
        <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-700 space-y-2">
          {!d.calling.businessInitiatedAllowed ? (
            <p>Meta doesn&apos;t allow this number to start calls right now (business-initiated calling restricted). Customers can still call you on WhatsApp.</p>
          ) : perm?.canStartCall === false && (perm.status === "temporary" || perm.status === "permanent") ? (
            <p>Call limit reached for this customer. Try again later.</p>
          ) : (
            <>
              <p className="flex items-start gap-1.5"><Icon name="lock" className="w-4 h-4 shrink-0 text-slate-400" /> {name} hasn&apos;t allowed calls from your business yet.</p>
              {d.canRequestPermission ? (
                <button type="button" onClick={askPermission} disabled={busy === "perm"}
                  className="w-full rounded-lg bg-[#25D366] px-3 py-2 text-xs font-semibold text-white hover:bg-[#1fb857] disabled:opacity-60">
                  {busy === "perm" ? "Sending…" : "Ask permission to call"}
                </button>
              ) : (
                <p className="text-slate-500">
                  {!d.windowOpen
                    ? "The 24-hour window is closed: ask with an approved call-permission template, or wait for the customer to message you."
                    : "A permission request can't be sent right now (limit: 1 per day, 2 per week)."}
                </p>
              )}
            </>
          )}
        </div>
      )}

      <div className="my-1 border-t border-slate-100" />
      <a href={`tel:+${digits}`} onClick={logPhone}
        className="flex items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500/40">
        <span className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600"><Icon name="smartphone" className="w-4 h-4" /></span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-slate-800">Call by phone</span>
          <span className="block text-[11px] text-slate-500 truncate">+{digits} · opens your dialer / softphone</span>
        </span>
      </a>
      <MenuItem icon="videocam" iconClass="text-slate-600" label="Video meeting" hint="Send the customer a meeting link" onClick={onVideo} />
    </div>
  );
}

function MenuItem({ icon, iconClass, label, hint, onClick, disabled }: { icon: string; iconClass?: string; label: string; hint?: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="w-full flex items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500/40">
      <span className={cn("w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center", iconClass)}><Icon name={icon} filled className="w-4 h-4" /></span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-800">{label}</span>
        {hint && <span className="block text-[11px] text-slate-500 truncate">{hint}</span>}
      </span>
    </button>
  );
}

function VideoMenu({ conversationId, windowOpen }: { conversationId: string; windowOpen: boolean }) {
  const qc = useQueryClient();
  const [url, setUrl] = useState(() => (typeof window === "undefined" ? "" : newMeetingUrl()));
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editBase, setEditBase] = useState(false);
  const [base, setBase] = useState(() => (typeof window === "undefined" ? DEFAULT_VIDEO_BASE : getVideoBase()));

  const send = async () => {
    setBusy(true);
    try {
      await axios.post("/api/calls/video", { conversationId, url });
      setSent(url);
      toast.success("Meeting link sent");
      qc.invalidateQueries({ queryKey: ["messages", conversationId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    } catch (e) {
      toast.error(apiErr(e, "Couldn't send the link"));
    } finally {
      setBusy(false);
    }
  };

  const saveBase = () => {
    const err = setVideoBase(base);
    if (err) return toast.error(err);
    const b = getVideoBase();
    setBase(b);
    setUrl(newMeetingUrl(b));
    setEditBase(false);
    toast.success("Saved for this browser");
  };

  const copy = () => navigator.clipboard?.writeText(url).then(() => toast.success("Link copied"), () => toast.error("Couldn't copy"));

  return (
    <div className="space-y-2 p-1">
      <p className="px-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Video meeting</p>
      {!windowOpen && (
        <p className="rounded-xl bg-amber-50 p-2.5 text-xs text-amber-900">The 24-hour window is closed, so a link can&apos;t be sent as a normal message. Send an approved template first.</p>
      )}
      <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2">
        <Icon name="videocam" className="w-4 h-4 text-slate-400 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-xs text-slate-700" title={url}>{url}</span>
        <button type="button" onClick={copy} aria-label="Copy link" className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:bg-white"><Icon name="content_copy" className="w-3.5 h-3.5" /></button>
        <button type="button" onClick={() => { setUrl(newMeetingUrl()); setSent(null); }} aria-label="New link" className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:bg-white"><Icon name="refresh" className="w-3.5 h-3.5" /></button>
      </div>
      {sent === url ? (
        <a href={url} target="_blank" rel="noreferrer"
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-2 text-sm font-semibold text-white hover:bg-[#1fb857]">
          <Icon name="videocam" filled className="w-4 h-4" /> Join the meeting
        </a>
      ) : (
        <button type="button" onClick={send} disabled={!windowOpen || busy || !url}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-2 text-sm font-semibold text-white hover:bg-[#1fb857] disabled:opacity-50">
          <Icon name="send" className="w-4 h-4" /> {busy ? "Sending…" : "Send link to customer"}
        </button>
      )}
      {editBase ? (
        <div className="space-y-1.5 rounded-xl border border-slate-200 p-2">
          <label className="block text-[11px] font-semibold text-slate-600" htmlFor={`vbase-${conversationId}`}>Meeting link base (this browser)</label>
          <input id={`vbase-${conversationId}`} value={base} onChange={(e) => setBase(e.target.value)} placeholder={DEFAULT_VIDEO_BASE}
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500/30" />
          <p className="text-[10px] text-slate-500">Ending in &quot;/&quot; adds a unique room (Jitsi style). A full link (Zoom, Meet) is sent as is. Leave empty for the default.</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditBase(false)} className="text-xs font-semibold text-slate-500 hover:text-slate-700">Cancel</button>
            <button type="button" onClick={saveBase} className="text-xs font-semibold text-green-700 hover:underline">Save</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setEditBase(true)} className="flex items-center gap-1 px-1 text-[11px] font-semibold text-slate-500 hover:text-slate-700">
          <Icon name="settings" className="w-3.5 h-3.5" /> Change meeting provider
        </button>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Call log bubble (Message.type === "SYSTEM" with templateData.call)
// ═════════════════════════════════════════════════════════════════════════════

export interface CallLogMessage {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  type: string;
  content: string | null;
  createdAt: string;
  templateData?: unknown;
  sentByUser?: { name: string | null } | null;
}

export function readCallData(templateData: unknown): ServerCall | null {
  const c = (templateData as { call?: ServerCall } | null | undefined)?.call;
  return c && typeof c === "object" && typeof c.id === "string" ? c : null;
}

/** True for messages that should be rendered with <CallLogBubble>. */
export function isCallMessage(m: { type?: string; templateData?: unknown } | null | undefined): boolean {
  return m?.type === "SYSTEM" && !!readCallData(m.templateData);
}

export function CallLogBubble({ message }: { message: CallLogMessage }) {
  const call = readCallData(message.templateData);
  if (!call) return null;
  const time = new Date(message.createdAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  const inbound = call.direction === "inbound";
  const bad = call.status === "missed" || call.status === "rejected" || call.status === "failed";

  let icon = "call";
  let title: string;
  const parts: string[] = [];
  if (call.via === "video_link") {
    icon = "videocam";
    title = "Video meeting link sent";
  } else if (call.via === "phone") {
    icon = "smartphone";
    title = "Phone call";
    parts.push("Dialed from agent's phone");
  } else {
    title = {
      ringing: inbound ? "Incoming voice call" : "Calling…",
      connected: "Voice call in progress",
      ended: "Voice call",
      missed: inbound ? "Missed voice call" : "No answer",
      rejected: inbound ? "Declined voice call" : "Customer declined",
      failed: "Voice call failed",
    }[call.status];
    parts.push(inbound ? "Incoming" : "Outgoing", "WhatsApp");
    if (call.status === "ended" && call.durationSec != null) parts.push(formatClock(call.durationSec));
  }
  if (message.sentByUser?.name && !inbound) parts.push(message.sentByUser.name);
  parts.push(time);

  return (
    <div className="flex justify-center my-2" role="note" aria-label={`${title}, ${parts.join(", ")}`}>
      <div className="inline-flex max-w-[90%] items-center gap-2.5 rounded-xl bg-white/95 px-3 py-2 shadow-sm">
        <span className={cn("w-8 h-8 shrink-0 rounded-full flex items-center justify-center", bad ? "bg-red-50 text-red-600" : "bg-green-50 text-[#128C7E]")}>
          <Icon name={icon} filled className={cn("w-4 h-4", bad && call.via === "whatsapp" && "rotate-[135deg]")} />
        </span>
        <div className="min-w-0">
          <p className={cn("text-[13px] font-semibold leading-tight", bad ? "text-red-700" : "text-slate-800")}>{title}</p>
          <p className="text-[11px] text-slate-500 truncate">{parts.join(" · ")}</p>
          {call.via === "video_link" && call.url && (
            <a href={call.url} target="_blank" rel="noreferrer" className="block max-w-[260px] truncate text-[11px] font-semibold text-[#128C7E] hover:underline">{call.url}</a>
          )}
          {call.error && call.status === "failed" && <p className="text-[11px] text-red-600 break-words">{call.error}</p>}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Incoming-call listener (mount once in the inbox)
// ═════════════════════════════════════════════════════════════════════════════

type Bindable = { bind: (e: string, cb: (d: unknown) => void) => void; unbind?: (e: string, cb: (d: unknown) => void) => void };

/**
 * Watches for incoming WhatsApp calls (Pusher "incoming-call" when configured, plus polling of /api/calls/pending –
 * every 2 s without Pusher) and renders the incoming-call dialog and the in-call panel.
 */
export function IncomingCallListener({ organizationId, onOpenConversation }: { organizationId?: string | null; onOpenConversation?: (conversationId: string) => void }) {
  const qc = useQueryClient();
  const pending = usePendingCalls(!!organizationId);
  const session = useCallSession();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const notified = useRef(new Set<string>());

  // Realtime: refresh pending calls / the active call on events. Only unbinds (the inbox owns the org subscription).
  useEffect(() => {
    if (!organizationId) return;
    const ch = pusherClient.subscribe(orgChannel(organizationId)) as Bindable;
    const onIncoming = () => qc.invalidateQueries({ queryKey: ["calls-pending"] });
    const onUpdated = (d: unknown) => {
      const data = d as { messageId?: string; conversationId?: string } | null;
      qc.invalidateQueries({ queryKey: ["calls-pending"] });
      if (data?.conversationId) qc.invalidateQueries({ queryKey: ["messages", data.conversationId] });
      pokeCall(data?.messageId);
    };
    ch.bind(CALL_EVENTS.INCOMING, onIncoming);
    ch.bind(CALL_EVENTS.UPDATED, onUpdated);
    return () => {
      ch.unbind?.(CALL_EVENTS.INCOMING, onIncoming);
      ch.unbind?.(CALL_EVENTS.UPDATED, onUpdated);
    };
  }, [organizationId, qc]);

  // Refresh the thread when a call ends so the log bubble shows the final state.
  const endedConv = session?.phase === "ended" ? session.conversationId : null;
  useEffect(() => {
    if (endedConv) {
      qc.invalidateQueries({ queryKey: ["messages", endedConv] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    }
  }, [endedConv, qc]);

  const onCall = !!session && session.phase !== "ended";
  const incoming = !onCall ? pending.data?.find((c) => !dismissed.includes(c.messageId)) : undefined;
  const queued = onCall ? pending.data?.filter((c) => c.messageId !== session?.messageId && !dismissed.includes(c.messageId)) ?? [] : [];

  // Desktop notification when the tab is in the background (only if the user already granted permission).
  const incomingId = incoming?.messageId;
  const incomingName = incoming ? incoming.contact.name || `+${incoming.contact.phone}` : "";
  useEffect(() => {
    if (!incomingId || notified.current.has(incomingId)) return;
    notified.current.add(incomingId);
    if (typeof document !== "undefined" && document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
      try { new Notification("Incoming WhatsApp call", { body: incomingName, tag: incomingId }); } catch { /* unsupported */ }
    }
  }, [incomingId, incomingName]);

  const accept = async (c: PendingCall) => {
    setBusyId(c.messageId);
    try {
      await acceptIncomingCall(c);
    } catch (e) {
      toast.error(apiErr(e, "Couldn't answer the call"));
    } finally {
      setBusyId(null);
      setDismissed((d) => [...d, c.messageId]);
      qc.invalidateQueries({ queryKey: ["calls-pending"] });
      qc.invalidateQueries({ queryKey: ["messages", c.conversationId] });
    }
  };

  const decline = async (c: PendingCall) => {
    setBusyId(c.messageId);
    try {
      await declineIncomingCall(c);
    } catch (e) {
      toast.error(apiErr(e, "Couldn't decline the call"));
    } finally {
      setBusyId(null);
      setDismissed((d) => [...d, c.messageId]);
      qc.invalidateQueries({ queryKey: ["calls-pending"] });
      qc.invalidateQueries({ queryKey: ["messages", c.conversationId] });
    }
  };

  const openChat = (conversationId: string) => {
    if (onOpenConversation) onOpenConversation(conversationId);
    else window.location.assign(`/inbox?id=${encodeURIComponent(conversationId)}`);
  };

  return (
    <>
      {incoming && (
        <IncomingCallModal
          call={incoming}
          busy={busyId === incoming.messageId}
          onAccept={() => accept(incoming)}
          onDecline={() => decline(incoming)}
          onOpenChat={() => openChat(incoming.conversationId)}
          onDismiss={() => setDismissed((d) => [...d, incoming.messageId])}
        />
      )}
      {queued.length > 0 && (
        <div role="status" className="fixed z-[70] right-4 bottom-[200px] hidden sm:flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-slate-200">
          <Icon name="call" className="w-4 h-4 text-[#25D366]" />
          <span className="text-slate-700">Another call: <b>{queued[0].contact.name || `+${queued[0].contact.phone}`}</b></span>
          <button type="button" onClick={() => setDismissed((d) => [...d, queued[0].messageId])} aria-label="Hide" className="text-slate-400 hover:text-slate-600"><Icon name="close" className="w-3.5 h-3.5" /></button>
        </div>
      )}
      <CallPanel />
    </>
  );
}
