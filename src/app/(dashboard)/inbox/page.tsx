"use client";

import { CallButtons, CallLogBubble as CallLog, IncomingCallListener } from "@/components/inbox/call-buttons"; // [calls]
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { Icon } from "@/components/ui/icon";
import { pusherClient, PUSHER_EVENTS, orgChannel, conversationChannel, REALTIME_ENABLED } from "@/lib/pusher";
import { cn, getInitials, timeAgo } from "@/lib/utils";
// [chat] WhatsApp-style chat features
import type { ChatMessage } from "@/components/inbox/types";
import { asExtras, mergeExtras, messagePreview, toggleId } from "@/components/inbox/message-extras";
import { QUICK_REACTIONS } from "@/components/inbox/emoji-data";
import { EmojiPicker } from "@/components/inbox/emoji-picker";
import { PopoverMenu, type MenuItem } from "@/components/inbox/popover-menu";
import { VoiceRecorderButton, useVoiceSupported } from "@/components/inbox/voice-recorder";
import { setChatCleared, setConversationMuted, useChatClearedAt, useConversationMuted } from "@/components/inbox/chat-prefs";
import {
  ContactsCard, ForwardedLabel, InboundReplyTag, InteractivePreview, LocationCard, QuotedBlock, ReactionChips, SystemBubble, highlight,
} from "@/components/inbox/bubble-parts";
import {
  ConfirmDialog, ContactCardDialog, ForwardDialog, InteractiveDialog, LocationDialog, MessageInfoDialog, StarredDialog,
} from "@/components/inbox/chat-dialogs";

// Without Pusher, poll so new messages still appear.
const POLL_MS = REALTIME_ENABLED ? false : 5000;

type Filter = "all" | "me" | "unassigned";
type Status = "OPEN" | "PENDING" | "RESOLVED";

interface ListConversation {
  id: string; status: Status; isRead: boolean; lastMessageAt: string | null; createdAt: string; sessionExpiresAt: string | null;
  contact: { id: string; name: string | null; phone: string; tags: { tag: string }[] };
  assignedAgent: { id: string; name: string | null } | null;
  labels: { label: { id: string; name: string; color: string } }[];
  messages: { content: string | null; type: string; direction: "INBOUND" | "OUTBOUND"; status: string; createdAt: string }[];
}
type Message = ChatMessage;
interface Detail {
  id: string; status: Status; isRead: boolean; createdAt: string; sessionExpiresAt: string | null; lastMessageAt: string | null;
  contact: { id: string; name: string | null; phone: string; email: string | null; stage: string; isBlocked: boolean; optedOut: boolean; createdAt: string; notes: string | null; tags: { tag: string }[]; _count: { conversations: number } };
  assignedAgent: { id: string; name: string | null; email: string } | null;
  assignedTeam: { id: string; name: string } | null;
  labels: { label: { id: string; name: string; color: string } }[];
  whatsappAccount: { displayName: string; phoneNumber: string; isActive: boolean };
  notes: { id: string; content: string; createdAt: string; authorId: string | null; author: { name: string | null; email: string } | null }[];
  _count: { messages: number };
}
interface Meta {
  me: { userId: string; role: string };
  members: { id: string; name: string | null; email: string; role: string }[];
  quickReplies: { id: string; shortcut: string; content: string }[];
  templates: { id: string; name: string; language: string; category: string; body: string }[];
  labels: { id: string; name: string; color: string }[];
}

const err = (e: unknown, f = "Something went wrong") => (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? f;
const displayName = (c: { name: string | null; phone: string }) => c.name || `+${c.phone}`;

function useDebounced<T>(v: T, ms = 300) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

/** Remaining time in the 24h customer-service window. */
function windowInfo(expiresAt: string | null) {
  if (!expiresAt) return { open: false, label: "Window closed", short: "Closed", urgent: true };
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return { open: false, label: "24h window closed", short: "Closed", urgent: true };
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return { open: true, label: `Reply window: ${h > 0 ? `${h}h ` : ""}${m}m left`, short: h > 0 ? `${h}h` : `${m}m`, urgent: ms < 2 * 3_600_000 };
}

function Ticks({ status, className }: { status: string; className?: string }) {
  if (status === "PENDING") return <Icon name="schedule" className={cn("w-3.5 h-3.5 text-slate-400", className)} />;
  if (status === "FAILED") return <Icon name="error" className={cn("w-3.5 h-3.5 text-red-500", className)} />;
  if (status === "READ") return <Icon name="done_all" className={cn("w-3.5 h-3.5 text-sky-500", className)} />;
  if (status === "DELIVERED") return <Icon name="done_all" className={cn("w-3.5 h-3.5 text-slate-400", className)} />;
  return <Icon name="check" className={cn("w-3.5 h-3.5 text-slate-400", className)} />;
}

function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const s = { sm: "w-7 h-7 text-[10px]", md: "w-10 h-10 text-sm", lg: "w-14 h-14 text-lg" }[size];
  return <span className={cn("rounded-full flex items-center justify-center font-bold text-white shrink-0 bg-gradient-to-br from-green-400 to-emerald-600", s)}>{getInitials(name)}</span>;
}

function preview(m?: ListConversation["messages"][number]) {
  if (!m) return "No messages yet";
  if (m.type === "LOCATION") return "Location";
  if (m.content) return m.content;
  const map: Record<string, string> = { IMAGE: "Photo", VIDEO: "Video", AUDIO: "Voice message", DOCUMENT: "Document", STICKER: "Sticker", LOCATION: "Location", CONTACTS: "Contact card", INTERACTIVE: "Interactive message", TEMPLATE: "Template message", SYSTEM: "Call" };
  return map[m.type] ?? `[${m.type.toLowerCase()}]`;
}

// ═════════════════════════════════════════════════════════════════════════════
export default function InboxPage() {
  const { data: session } = useSession();
  const qc = useQueryClient();
  const params = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(() => params.get("id"));
  const [filter, setFilter] = useState<Filter>("all");
  const [status, setStatus] = useState<Status>("OPEN");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search);

  useEffect(() => {
    const orgId = session?.user?.organizationId;
    if (!orgId) return;
    const ch = pusherClient.subscribe(orgChannel(orgId));
    const refresh = () => qc.invalidateQueries({ queryKey: ["conversations"] });
    ch.bind(PUSHER_EVENTS.NEW_CONVERSATION, refresh);
    ch.bind(PUSHER_EVENTS.CONVERSATION_UPDATED, refresh);
    ch.bind(PUSHER_EVENTS.CONVERSATION_ASSIGNED, refresh);
    return () => pusherClient.unsubscribe(orgChannel(orgId));
  }, [session?.user?.organizationId, qc]);

  const { data, isLoading } = useQuery({
    queryKey: ["conversations", status, filter, debounced, unreadOnly],
    queryFn: () => axios.get("/api/conversations", {
      params: { status, assignedTo: filter === "all" ? "" : filter, search: debounced, unread: unreadOnly ? "1" : undefined, limit: 50 },
    }).then((r) => r.data as { conversations: ListConversation[]; total: number; counts: Record<string, number>; unread: number }),
    refetchInterval: POLL_MS,
    placeholderData: (p) => p,
  });
  const { data: meta } = useQuery({ queryKey: ["inbox-meta"], queryFn: () => axios.get("/api/inbox/meta").then((r) => r.data as Meta), staleTime: 60_000 });

  const conversations = data?.conversations ?? [];
  const select = (id: string | null) => {
    setSelectedId(id);
    window.history.replaceState(null, "", id ? `/inbox?id=${id}` : "/inbox");
  };

  return (
    <div className="flex h-full min-h-0 bg-white">
      {/* [calls] incoming WhatsApp calls (popup + ringing) */}
      <IncomingCallListener organizationId={session?.user?.organizationId} onOpenConversation={select} />
      {/* ── Conversation list ── */}
      <aside className={cn("w-full md:w-[340px] lg:w-[380px] border-r border-slate-200 flex-col bg-white shrink-0 min-h-0", selectedId ? "hidden md:flex" : "flex")}>
        <div className="p-3 sm:p-4 space-y-3 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">Conversations</h2>
            {!!data?.unread && <span className="rounded-full bg-[#25D366] px-2 py-0.5 text-[11px] font-bold text-white">{data.unread} unread</span>}
          </div>
          <div className="relative">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, phone or email…"
              className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500" />
          </div>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
            {(["OPEN", "PENDING", "RESOLVED"] as Status[]).map((s) => (
              <button key={s} onClick={() => setStatus(s)}
                className={cn("rounded-lg py-1.5 text-xs font-semibold transition inline-flex items-center justify-center gap-1.5", status === s ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
                {data?.counts && <span className={cn("rounded-full px-1.5 text-[10px] tabular-nums", status === s ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-600")}>{data.counts[s] ?? 0}</span>}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {(["all", "me", "unassigned"] as Filter[]).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={cn("shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition", filter === f ? "border-green-500 bg-green-50 text-green-700" : "border-slate-200 text-slate-600 hover:bg-slate-50")}>
                {f === "all" ? "All" : f === "me" ? "Assigned to me" : "Unassigned"}
              </button>
            ))}
            <button onClick={() => setUnreadOnly((u) => !u)}
              className={cn("shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition inline-flex items-center gap-1", unreadOnly ? "border-green-500 bg-green-50 text-green-700" : "border-slate-200 text-slate-600 hover:bg-slate-50")}>
              <span className="w-1.5 h-1.5 rounded-full bg-[#25D366]" /> Unread
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-3 space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />)}</div>
          ) : conversations.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <span className="mx-auto w-12 h-12 rounded-2xl bg-green-50 flex items-center justify-center"><Icon name="inbox" className="w-6 h-6 text-green-600" /></span>
              <p className="mt-3 text-sm font-semibold text-slate-700">{debounced ? "No matches" : `No ${status.toLowerCase()} conversations`}</p>
              <p className="text-xs text-slate-400 mt-1">{debounced ? "Try a different name or number." : "New WhatsApp messages will appear here automatically."}</p>
            </div>
          ) : (
            <ul>
              {conversations.map((c) => (
                <ConversationRow key={c.id} c={c} active={selectedId === c.id} onClick={() => select(c.id)} />
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* ── Chat ── */}
      <section className={cn("flex-1 min-w-0 min-h-0 flex-col", selectedId ? "flex" : "hidden md:flex")}>
        {selectedId ? (
          <ChatArea key={selectedId} conversationId={selectedId} meta={meta} onBack={() => select(null)} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6 bg-[#f0f2f5]">
            <span className="w-16 h-16 rounded-3xl bg-white shadow-sm flex items-center justify-center"><Icon name="forum" className="w-8 h-8 text-green-600" /></span>
            <p className="mt-4 text-base font-semibold text-slate-800">Select a conversation</p>
            <p className="mt-1 text-sm text-slate-500 max-w-xs">Pick a chat on the left to read and reply. Customer messages arrive here in real time.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function ConversationRow({ c, active, onClick }: { c: ListConversation; active: boolean; onClick: () => void }) {
  const last = c.messages?.[0];
  const unread = !c.isRead && !active;
  const win = windowInfo(c.sessionExpiresAt);
  return (
    <li>
      <button onClick={onClick}
        className={cn("w-full text-left flex items-start gap-3 px-3 sm:px-4 py-3 border-b border-slate-50 transition-colors relative",
          active ? "bg-green-50/70" : "hover:bg-slate-50")}>
        {active && <span className="absolute left-0 top-0 bottom-0 w-1 bg-[#25D366]" />}
        <Avatar name={displayName(c.contact)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn("text-sm truncate flex-1", unread ? "font-bold text-slate-900" : "font-semibold text-slate-800")}>{displayName(c.contact)}</span>
            <span className={cn("text-[11px] shrink-0", unread ? "text-green-600 font-semibold" : "text-slate-400")}>{c.lastMessageAt ? timeAgo(c.lastMessageAt) : ""}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            {last?.direction === "OUTBOUND" && <Ticks status={last.status} />}
            <p className={cn("text-xs truncate flex-1", unread ? "text-slate-800 font-medium" : "text-slate-500")}>{preview(last)}</p>
            {unread && <span className="w-2.5 h-2.5 rounded-full bg-[#25D366] shrink-0" aria-label="Unread" />}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
            {c.status !== "RESOLVED" && (
              <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                !win.open ? "bg-slate-100 text-slate-500" : win.urgent ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700")} title={win.label}>
                <Icon name="schedule" className="w-2.5 h-2.5" /> {win.short}
              </span>
            )}
            {c.labels.slice(0, 2).map((l) => (
              <span key={l.label.id} className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: `${l.label.color}1a`, color: l.label.color }}>{l.label.name}</span>
            ))}
            {c.assignedAgent && (
              <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-slate-400" title={`Assigned to ${c.assignedAgent.name}`}>
                <Icon name="person" className="w-3 h-3" /> {c.assignedAgent.name?.split(" ")[0]}
              </span>
            )}
          </div>
        </div>
      </button>
    </li>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
type MsgPages = { pages: { messages: Message[]; page: number; hasMore?: boolean }[]; pageParams: unknown[] };

function ChatArea({ conversationId, meta, onBack }: { conversationId: string; meta?: Meta; onBack: () => void }) {
  const qc = useQueryClient();
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [chatMenu, setChatMenu] = useState(false);
  const [dialog, setDialog] = useState<{ kind: "info" | "forward"; m: Message } | { kind: "starred" | "clear" | "block" } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);
  const debouncedQ = useDebounced(searchQ.trim(), 350);
  const myUserId = meta?.me.userId;
  const muted = useConversationMuted(conversationId);
  const clearedAt = useChatClearedAt(myUserId, conversationId);

  const { data: detail, refetch: refetchDetail } = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: () => axios.get(`/api/conversations/${conversationId}`).then((r) => r.data.conversation as Detail),
    refetchInterval: POLL_MS ? 15_000 : false,
  });

  const msgs = useInfiniteQuery({
    queryKey: ["messages", conversationId],
    queryFn: ({ pageParam }) => axios.get(`/api/conversations/${conversationId}/messages`, { params: { page: pageParam } }).then((r) => r.data as { messages: Message[]; page: number; hasMore?: boolean }),
    initialPageParam: 1,
    getNextPageParam: (last) => ((last.hasMore ?? last.messages.length === 50) ? last.page + 1 : undefined),
    refetchInterval: POLL_MS,
  });
  const allMessages = useMemo(() => (msgs.data?.pages ?? []).slice().reverse().flatMap((p) => p.messages), [msgs.data]);
  // "Clear chat" is a per-user, per-browser view filter: nothing is deleted.
  const messages = useMemo(() => (clearedAt ? allMessages.filter((m) => m.createdAt > clearedAt) : allMessages), [allMessages, clearedAt]);
  const byWamid = useMemo(() => new Map(allMessages.filter((m) => m.wamid).map((m) => [m.wamid as string, m])), [allMessages]);

  const searchResults = useQuery({
    queryKey: ["chat-search", conversationId, debouncedQ],
    queryFn: () => axios.get(`/api/conversations/${conversationId}/messages`, { params: { q: debouncedQ } })
      .then((r) => r.data.results as { id: string; createdAt: string; direction: string; type: string; snippet: string }[]),
    enabled: searchOpen && debouncedQ.length >= 2,
    placeholderData: (p) => p,
  });
  const loadedMatches = useMemo(() => {
    const q = debouncedQ.toLowerCase();
    if (q.length < 2) return 0;
    return messages.filter((m) => `${m.content ?? ""} ${m.mediaCaption ?? ""}`.toLowerCase().includes(q)).length;
  }, [messages, debouncedQ]);

  // Real-time (when Pusher is configured).
  useEffect(() => {
    const ch = pusherClient.subscribe(conversationChannel(conversationId));
    const refresh = () => qc.invalidateQueries({ queryKey: ["messages", conversationId] });
    ch.bind(PUSHER_EVENTS.NEW_MESSAGE, refresh);
    ch.bind(PUSHER_EVENTS.MESSAGE_STATUS_UPDATE, refresh);
    return () => pusherClient.unsubscribe(conversationChannel(conversationId));
  }, [conversationId, qc]);

  // Mark as read when opened (also sends blue ticks to the customer).
  useEffect(() => {
    if (detail && !detail.isRead) {
      axios.patch(`/api/conversations/${conversationId}`, { isRead: true }).then(() => qc.invalidateQueries({ queryKey: ["conversations"] })).catch(() => {});
    }
  }, [detail, conversationId, qc]);

  // Stick to the bottom on new messages unless the agent scrolled up.
  useEffect(() => {
    const el = scroller.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["messages", conversationId] });
    qc.invalidateQueries({ queryKey: ["conversations"] });
    refetchDetail();
  };

  const setStatus = async (status: Status) => {
    try {
      await axios.post(`/api/conversations/${conversationId}/resolve`, { status });
      toast.success(status === "RESOLVED" ? "Conversation resolved" : status === "OPEN" ? "Conversation reopened" : "Marked as pending");
      refreshAll();
    } catch (e) { toast.error(err(e)); }
  };

  const assign = async (agentId: string) => {
    try {
      await axios.post(`/api/conversations/${conversationId}/assign`, { agentId: agentId || null });
      toast.success(agentId ? `Assigned to ${meta?.members.find((m) => m.id === agentId)?.name ?? "agent"}` : "Unassigned");
      refreshAll();
    } catch (e) { toast.error(err(e)); }
  };

  // ── [chat] Message actions ──
  const patchMessage = (id: string, fn: (m: Message) => Message | null) => {
    qc.setQueryData(["messages", conversationId], (old: MsgPages | undefined) => old && {
      ...old,
      pages: old.pages.map((p) => ({ ...p, messages: p.messages.flatMap((m) => (m.id === id ? (fn(m) ?? []) : [m])) })),
    });
  };
  const react = async (m: Message, emoji: string) => {
    try {
      const r = await axios.post(`/api/messages/${m.id}/react`, { emoji });
      const reactions = r.data.reactions && Object.keys(r.data.reactions).length ? r.data.reactions : undefined;
      patchMessage(m.id, (x) => ({ ...x, interactive: mergeExtras(x.interactive, { reactions }) }));
    } catch (e) { toast.error(err(e, "Reaction not sent")); }
  };
  const star = async (m: Message, on: boolean) => {
    try {
      await axios.patch(`/api/messages/${m.id}`, { starred: on });
      patchMessage(m.id, (x) => ({ ...x, interactive: mergeExtras(x.interactive, { starredBy: toggleId(asExtras(x.interactive).starredBy, myUserId ?? "", on) }) }));
      qc.invalidateQueries({ queryKey: ["starred", conversationId] });
      toast.success(on ? "Starred" : "Unstarred");
    } catch (e) { toast.error(err(e)); }
  };
  const hide = async (m: Message) => {
    try {
      await axios.patch(`/api/messages/${m.id}`, { hidden: true });
      patchMessage(m.id, () => null);
      if (replyTo?.id === m.id) setReplyTo(null);
      toast.success("Deleted for you", {
        description: "The customer still has this message.",
        action: { label: "Undo", onClick: () => { axios.patch(`/api/messages/${m.id}`, { hidden: false }).then(() => qc.invalidateQueries({ queryKey: ["messages", conversationId] })).catch(() => {}); } },
      });
    } catch (e) { toast.error(err(e)); }
  };
  const copy = (m: Message) => {
    const text = m.content && m.type !== "LOCATION" ? m.content : messagePreview(m, 10_000);
    navigator.clipboard.writeText(text).then(() => toast.success("Copied"), () => toast.error("Couldn't copy"));
  };

  /** Scrolls to a message, loading older pages if needed. */
  const jumpTo = async (id: string) => {
    const find = () => document.getElementById(`msg-${id}`);
    let el = find();
    for (let i = 0; !el && i < 40; i++) {
      const cached = qc.getQueryData<MsgPages>(["messages", conversationId]);
      const loaded = cached?.pages.some((p) => p.messages.some((m) => m.id === id));
      if (loaded) { await new Promise((r) => setTimeout(r, 60)); el = find(); break; }
      const lastPage = cached?.pages[cached.pages.length - 1];
      if (!lastPage || !(lastPage.hasMore ?? lastPage.messages.length === 50)) break;
      atBottom.current = false;
      await msgs.fetchNextPage();
      await new Promise((r) => setTimeout(r, 60));
      el = find();
    }
    if (!el) { toast.message("That message isn't available here (it may have been deleted or cleared for you)."); return; }
    atBottom.current = false;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    setFlashId(id);
    setTimeout(() => setFlashId((f) => (f === id ? null : f)), 1800);
  };

  const setBlocked = async (blocked: boolean) => {
    try {
      await axios.post(`/api/conversations/${conversationId}/block`, { blocked });
      toast.success(blocked ? "Contact blocked" : "Contact unblocked");
      refetchDetail();
    } catch (e) { toast.error(err(e)); }
  };
  const exportChat = (format: "txt" | "csv") => {
    const a = document.createElement("a");
    a.href = `/api/conversations/${conversationId}/export?format=${format}`;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const win = windowInfo(detail?.sessionExpiresAt ?? null);
  const name = detail ? displayName(detail.contact) : "…";
  const blocked = !!detail?.contact.isBlocked;
  const canSendFreeForm = win.open && !blocked && !detail?.contact.optedOut && !!detail?.whatsappAccount.isActive;

  const chatMenuItems: MenuItem[] = [
    { id: "info", label: "Contact info", icon: "info", onSelect: () => setShowInfo(true) },
    { id: "search", label: "Search in chat", icon: "search", onSelect: () => setSearchOpen(true) },
    { id: "starred", label: "Starred messages", icon: "star", onSelect: () => setDialog({ kind: "starred" }) },
    { id: "mute", label: muted ? "Unmute notifications" : "Mute notifications", icon: muted ? "notifications" : "notifications_off", onSelect: () => { setConversationMuted(conversationId, !muted); toast.success(muted ? "Notifications on" : "Notifications muted on this device"); } },
    { id: "txt", label: "Export chat (TXT)", icon: "download", onSelect: () => exportChat("txt") },
    { id: "csv", label: "Export chat (CSV)", icon: "download", onSelect: () => exportChat("csv") },
    ...(clearedAt
      ? [{ id: "unclear", label: "Show cleared messages", icon: "visibility", onSelect: () => myUserId && setChatCleared(myUserId, conversationId, null) }]
      : [{ id: "clear", label: "Clear chat", icon: "delete_sweep", onSelect: () => setDialog({ kind: "clear" }) }]),
    { id: "block", label: blocked ? "Unblock contact" : "Block contact", icon: "block", danger: !blocked, onSelect: () => (blocked ? setBlocked(false) : setDialog({ kind: "block" })) },
  ];

  // Group messages by day for separators.
  const groups = useMemo(() => {
    const out: { day: string; items: Message[] }[] = [];
    for (const m of messages) {
      const d = new Date(m.createdAt);
      const today = new Date();
      const yest = new Date(today.getTime() - 86400000);
      const day = d.toDateString() === today.toDateString() ? "Today" : d.toDateString() === yest.toDateString() ? "Yesterday" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
      if (!out.length || out[out.length - 1].day !== day) out.push({ day, items: [] });
      out[out.length - 1].items.push(m);
    }
    return out;
  }, [messages]);

  const actions: BubbleActions = {
    onReply: (m) => setReplyTo(m),
    onReact: react,
    onInfo: (m) => setDialog({ kind: "info", m }),
    onCopy: copy,
    onForward: (m) => setDialog({ kind: "forward", m }),
    onStar: star,
    onHide: hide,
    onJump: jumpTo,
  };
  const closeDialog = () => setDialog(null);

  return (
    <div className="flex-1 flex min-h-0">
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Header */}
        <header className="h-16 flex items-center gap-2 sm:gap-3 px-2 sm:px-4 border-b border-slate-200 bg-white shrink-0">
          <button onClick={onBack} aria-label="Back to conversations" className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100">
            <Icon name="arrow_back" className="w-5 h-5" />
          </button>
          <button onClick={() => setShowInfo((s) => !s)} className="flex items-center gap-3 min-w-0 flex-1 text-left">
            <Avatar name={name} />
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate flex items-center gap-1">
                {name}
                {muted && <Icon name="notifications_off" className="w-3.5 h-3.5 text-slate-400" title="Muted" />}
                {blocked && <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">Blocked</span>}
              </p>
              <p className={cn("text-[11px] truncate flex items-center gap-1", !win.open ? "text-slate-500" : win.urgent ? "text-amber-600" : "text-green-600")}>
                <Icon name="schedule" className="w-3 h-3" /> {detail ? win.label : "Loading…"}
              </p>
            </div>
          </button>
          {detail && (
            <div className="flex items-center gap-1.5 shrink-0">
              {/* [calls] header buttons */}
              <CallButtons conversationId={conversationId} windowOpen={win.open}
                contact={{ id: detail.contact.id, name: detail.contact.name, phone: detail.contact.phone, isBlocked: detail.contact.isBlocked, optedOut: detail.contact.optedOut }} />
              <select value={detail.assignedAgent?.id ?? ""} onChange={(e) => assign(e.target.value)} aria-label="Assign conversation"
                className="hidden lg:block max-w-[160px] rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-500/30">
                <option value="">Unassigned</option>
                {meta?.members.map((m) => <option key={m.id} value={m.id}>{m.id === meta.me.userId ? `${m.name ?? m.email} (me)` : m.name ?? m.email}</option>)}
              </select>
              {detail.status === "RESOLVED" ? (
                <button onClick={() => setStatus("OPEN")} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  <Icon name="refresh" className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Reopen</span>
                </button>
              ) : (
                <button onClick={() => setStatus("RESOLVED")} className="inline-flex items-center gap-1 rounded-lg bg-[#25D366] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#1fb857]">
                  <Icon name="check_circle" className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Resolve</span>
                </button>
              )}
              <button onClick={() => setSearchOpen((s) => !s)} aria-label="Search in chat" aria-pressed={searchOpen}
                className={cn("hidden sm:flex w-9 h-9 items-center justify-center rounded-lg border", searchOpen ? "border-green-200 bg-green-50 text-green-700" : "border-slate-200 text-slate-500 hover:bg-slate-50")}>
                <Icon name="search" className="w-4 h-4" />
              </button>
              <button onClick={() => setShowInfo((s) => !s)} aria-label="Contact details" aria-pressed={showInfo}
                className={cn("hidden sm:flex w-9 h-9 items-center justify-center rounded-lg border", showInfo ? "border-green-200 bg-green-50 text-green-700" : "border-slate-200 text-slate-500 hover:bg-slate-50")}>
                <Icon name="info" className="w-4 h-4" />
              </button>
              <div className="relative">
                <button ref={menuBtn} onClick={() => setChatMenu((o) => !o)} aria-label="Chat menu" aria-haspopup="menu" aria-expanded={chatMenu}
                  className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
                  <Icon name="more_vert" className="w-4 h-4" />
                </button>
                <PopoverMenu open={chatMenu} onClose={() => setChatMenu(false)} items={chatMenuItems} label="Chat menu" triggerRef={menuBtn} className="sm:w-60" />
              </div>
            </div>
          )}
        </header>

        {searchOpen && (
          <div className="relative z-20 flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
            <Icon name="search" className="w-4 h-4 text-slate-400" />
            <input autoFocus value={searchQ} placeholder="Search this chat…" aria-label="Search this chat"
              onChange={(e) => { setSearchQ(e.target.value); setShowResults(true); }}
              onFocus={() => setShowResults(true)}
              onKeyDown={(e) => { if (e.key === "Escape") { setSearchOpen(false); setSearchQ(""); } }}
              className="flex-1 min-w-0 bg-transparent text-sm focus:outline-none" />
            {debouncedQ.length >= 2 && <span className="shrink-0 text-[11px] text-slate-400">{loadedMatches} on screen</span>}
            <button onClick={() => { setSearchOpen(false); setSearchQ(""); }} aria-label="Close search" className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
              <Icon name="close" className="w-4 h-4" />
            </button>
            {showResults && debouncedQ.length >= 2 && (
              <div className="absolute left-2 right-2 top-full mt-1 max-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl">
                {searchResults.isLoading ? <p className="p-4 text-xs text-slate-500">Searching…</p>
                  : !searchResults.data?.length ? <p className="p-4 text-xs text-slate-500">No messages match “{debouncedQ}”.</p>
                  : (
                    <ul>
                      <li className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{searchResults.data.length}{searchResults.data.length === 50 ? "+" : ""} matches · newest first</li>
                      {searchResults.data.map((r) => (
                        <li key={r.id}>
                          <button onClick={() => { setShowResults(false); jumpTo(r.id); }} className="w-full text-left px-4 py-2 hover:bg-slate-50">
                            <span className="block text-[10px] text-slate-400">{r.direction === "OUTBOUND" ? "You" : name} · {new Date(r.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
                            <span className="block text-xs text-slate-700 line-clamp-2">{highlight(r.snippet, debouncedQ)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
              </div>
            )}
          </div>
        )}

        {/* Messages */}
        <div ref={scroller} onScroll={(e) => { const el = e.currentTarget; atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}
          className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-1 bg-[#efeae2] [background-image:radial-gradient(#d9d3c7_1px,transparent_1px)] [background-size:18px_18px]">
          {msgs.hasNextPage && (
            <div className="flex justify-center pb-2">
              <button onClick={() => { atBottom.current = false; msgs.fetchNextPage(); }} disabled={msgs.isFetchingNextPage}
                className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm hover:bg-white">
                {msgs.isFetchingNextPage ? "Loading…" : "Load earlier messages"}
              </button>
            </div>
          )}
          {clearedAt && (
            <div className="flex justify-center pb-2">
              <button onClick={() => myUserId && setChatCleared(myUserId, conversationId, null)} className="rounded-lg bg-white/90 px-3 py-1 text-[11px] text-slate-500 shadow-sm hover:bg-white">
                You cleared this chat · show earlier messages
              </button>
            </div>
          )}
          {msgs.isLoading && <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className={cn("h-12 w-2/3 rounded-2xl bg-white/70 animate-pulse", i % 2 && "ml-auto")} />)}</div>}
          {groups.map((g) => (
            <div key={g.day} className="space-y-1">
              <div className="sticky top-0 z-10 flex justify-center py-2">
                <span className="rounded-lg bg-white/90 px-3 py-1 text-[11px] font-semibold text-slate-500 shadow-sm">{g.day}</span>
              </div>
              {g.items.map((m, i) => {
                const prev = g.items[i - 1];
                const ctx = asExtras(m.interactive).context;
                const quoted = ctx ? byWamid.get(ctx.wamid) : undefined;
                return (
                  <Bubble key={m.id} m={m} grouped={!!prev && prev.direction === m.direction && prev.type !== "SYSTEM"}
                    myUserId={myUserId} contactName={name} search={searchOpen ? debouncedQ : ""} flash={flashId === m.id}
                    quoted={quoted} canSend={canSendFreeForm} actions={actions} />
                );
              })}
            </div>
          ))}
        </div>

        <Composer conversationId={conversationId} windowOpen={win.open} meta={meta} disabled={!detail}
          blocked={blocked} optedOut={!!detail?.contact.optedOut} onUnblock={() => setBlocked(false)}
          replyTo={replyTo} contactName={name} onCancelReply={() => setReplyTo(null)}
          onSent={(m) => {
            qc.setQueryData(["messages", conversationId], (old: MsgPages | undefined) => old && {
              ...old, pages: old.pages.map((p, i) => (i === 0 ? { ...p, messages: [...p.messages, m] } : p)),
            });
            atBottom.current = true;
          }}
          onDone={refreshAll}
        />
      </div>

      {/* Contact panel: side column on xl, sheet on smaller screens */}
      {showInfo && detail && (
        <>
          <div className="xl:hidden fixed inset-0 z-50 bg-slate-950/40 admin-fade" onClick={() => setShowInfo(false)} />
          <aside className="fixed xl:static inset-y-0 right-0 z-50 w-full sm:w-[380px] xl:w-[340px] bg-white border-l border-slate-200 flex flex-col min-h-0 admin-pop xl:animate-none">
            <InfoPanel detail={detail} meta={meta} onClose={() => setShowInfo(false)} onChanged={refreshAll} onAssign={assign} onStatus={setStatus} />
          </aside>
        </>
      )}

      {dialog?.kind === "info" && <MessageInfoDialog m={dialog.m} onClose={closeDialog} />}
      {dialog?.kind === "forward" && <ForwardDialog m={dialog.m} currentConversationId={conversationId} onClose={closeDialog} onDone={() => qc.invalidateQueries({ queryKey: ["conversations"] })} />}
      {dialog?.kind === "starred" && <StarredDialog conversationId={conversationId} onClose={closeDialog} onJump={jumpTo} />}
      {dialog?.kind === "clear" && (
        <ConfirmDialog title="Clear this chat?" confirmLabel="Clear chat" danger onClose={closeDialog}
          onConfirm={() => { if (myUserId) { setChatCleared(myUserId, conversationId, new Date()); setReplyTo(null); toast.success("Chat cleared for you"); } }}
          body={<>Messages up to now will be hidden <b>for you on this device</b>. Nothing is deleted: teammates and the customer still see them, and exports include them. You can show them again from the chat menu.</>} />
      )}
      {dialog?.kind === "block" && (
        <ConfirmDialog title={`Block ${name}?`} confirmLabel="Block" danger onClose={closeDialog} onConfirm={() => setBlocked(true)}
          body={<>Nobody on your team will be able to message this contact, and broadcasts will skip them. Their incoming messages still arrive in the inbox. You can unblock at any time.</>} />
      )}
    </div>
  );
}

interface BubbleActions {
  onReply: (m: Message) => void;
  onReact: (m: Message, emoji: string) => void;
  onInfo: (m: Message) => void;
  onCopy: (m: Message) => void;
  onForward: (m: Message) => void;
  onStar: (m: Message, on: boolean) => void;
  onHide: (m: Message) => void;
  onJump: (id: string) => void;
}

function Bubble({ m, grouped, myUserId, contactName, search, flash, quoted, canSend, actions }: {
  m: Message; grouped: boolean; myUserId?: string; contactName: string; search: string; flash: boolean;
  quoted?: Message; canSend: boolean; actions: BubbleActions;
}) {
  const [menu, setMenu] = useState(false);
  const [place, setPlace] = useState<"below" | "above">("below");
  const [picker, setPicker] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const press = useRef<number | undefined>(undefined);

  if (m.type === "SYSTEM") {
    const isCall = !!(m.templateData as { call?: unknown } | null)?.call;
    return <div id={`msg-${m.id}`}>{isCall ? <CallLog message={m} /> : <SystemBubble m={m} />}</div>;
  }

  const own = m.direction === "OUTBOUND";
  const x = asExtras(m.interactive);
  const time = new Date(m.createdAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  const isMedia = MEDIA_KINDS.includes(m.type);
  const padded = isMedia && m.type !== "AUDIO" && m.type !== "DOCUMENT";
  const starred = !!myUserId && !!x.starredBy?.includes(myUserId);
  const temp = m.pending || m.id.startsWith("temp-");
  const canReact = canSend && !!m.wamid && !temp;
  const text = m.type === "LOCATION" || m.type === "CONTACTS" || m.type === "DOCUMENT" ? null : m.content;
  const caption = m.mediaCaption && m.mediaCaption !== m.content ? m.mediaCaption : null;

  const open = () => {
    if (temp) return;
    const r = trigger.current?.closest("[data-bubble]")?.getBoundingClientRect();
    setPicker(false);
    setPlace(r && r.bottom > window.innerHeight - 360 ? "above" : "below");
    setMenu(true);
  };
  const cancelPress = () => { if (press.current) { clearTimeout(press.current); press.current = undefined; } };

  const items: MenuItem[] = [
    { id: "reply", label: "Reply", icon: "reply", disabled: !canSend || !m.wamid, hint: !m.wamid ? "This message never reached WhatsApp" : !canSend ? "Replies need an open 24h window" : undefined, onSelect: () => actions.onReply(m) },
    { id: "info", label: "Message info", icon: "info", onSelect: () => actions.onInfo(m) },
    { id: "copy", label: "Copy text", icon: "content_copy", disabled: !messagePreview(m), onSelect: () => actions.onCopy(m) },
    { id: "forward", label: "Forward", icon: "forward", onSelect: () => actions.onForward(m) },
    { id: "star", label: starred ? "Unstar" : "Star", icon: "star", onSelect: () => actions.onStar(m, !starred) },
    { id: "hide", label: "Delete for me", icon: "delete", danger: true, hint: "WhatsApp can't delete messages for everyone", onSelect: () => actions.onHide(m) },
  ];

  const reactionBar = canReact ? (
    <div className="flex items-center gap-0.5 px-2 pb-1.5 mb-1 border-b border-slate-100">
      {QUICK_REACTIONS.map((e) => {
        const mine = !!myUserId && !!x.reactions?.[e]?.byUserIds?.includes(myUserId);
        return (
          <button key={e} role="menuitem" type="button" aria-label={mine ? `Remove ${e} reaction` : `React ${e}`}
            onClick={() => { setMenu(false); actions.onReact(m, mine ? "" : e); }}
            className={cn("w-9 h-9 rounded-full text-[20px] leading-none hover:bg-slate-100 focus:outline-none focus:bg-slate-100", mine && "bg-green-50")}>{e}</button>
        );
      })}
      <button role="menuitem" type="button" aria-label="More reactions" onClick={() => { setMenu(false); setPicker(true); }}
        className="w-9 h-9 flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 focus:outline-none focus:bg-slate-100">
        <Icon name="add_reaction" className="w-5 h-5" />
      </button>
    </div>
  ) : null;

  let body: React.ReactNode = null;
  if (m.type === "LOCATION") body = <LocationCard m={m} />;
  else if (m.type === "CONTACTS") body = <ContactsCard m={m} />;

  return (
    <div id={`msg-${m.id}`} className={cn("flex flex-col", own ? "items-end" : "items-start", grouped ? "mt-0.5" : "mt-2")}>
      <div data-bubble
        onTouchStart={() => { cancelPress(); press.current = window.setTimeout(open, 450); }}
        onTouchEnd={cancelPress} onTouchMove={cancelPress} onTouchCancel={cancelPress}
        onContextMenu={(e) => { if (window.matchMedia("(pointer: coarse)").matches) { e.preventDefault(); open(); } }}
        className={cn("group relative max-w-[85%] sm:max-w-[70%] min-w-0 rounded-2xl shadow-sm transition-shadow select-text", padded ? "p-1 pb-1.5" : "px-3 py-2",
          own ? "bg-[#d9fdd3] text-slate-900" : "bg-white text-slate-900", !grouped && (own ? "rounded-tr-sm" : "rounded-tl-sm"), m.pending && "opacity-70",
          flash && "ring-2 ring-amber-400 ring-offset-2 ring-offset-[#efeae2]")}>
        {!temp && (
          <button ref={trigger} type="button" onClick={() => (menu ? setMenu(false) : open())} aria-label="Message actions" aria-haspopup="menu" aria-expanded={menu}
            className={cn("absolute top-1 z-[2] w-7 h-7 flex items-center justify-center rounded-full bg-white/90 text-slate-500 shadow-sm transition-opacity",
              "right-1", "opacity-0 group-hover:opacity-100 focus:opacity-100", menu && "opacity-100", "[@media(pointer:coarse)]:hidden")}>
            <Icon name="expand_more" className="w-4 h-4" />
          </button>
        )}
        {own && !grouped && (m.sentByUser?.name || m.isBotMessage) && (
          <p className={cn("text-[10px] font-semibold text-green-700 mb-0.5", padded && "px-2 pt-1")}>{m.isBotMessage ? "Chatbot" : m.sentByUser?.name}</p>
        )}
        <div className={cn(padded && "px-1 pt-0.5")}>
          {x.forwarded && <ForwardedLabel />}
          {x.context && (
            <QuotedBlock ctx={x.context} own={own} contactName={contactName}
              resolvedPreview={quoted ? messagePreview(quoted) : undefined} resolvedDirection={quoted?.direction}
              onJump={quoted || x.context.messageId ? () => actions.onJump(quoted?.id ?? (x.context?.messageId as string)) : undefined} />
          )}
          {!own && <InboundReplyTag x={x} />}
        </div>
        {isMedia && <MediaContent m={m} />}
        {m.type === "TEMPLATE" && <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5">Template · {m.templateName}</p>}
        {m.type === "INTERACTIVE" && own && x.header?.text && <p className="text-[13px] font-bold">{x.header.text}</p>}
        {body}
        <div className={cn(padded && "px-2")}>
          {text && <p className={cn("text-[14px] leading-snug whitespace-pre-wrap break-words", isMedia && "mt-1")}>{highlight(text, search)}</p>}
          {caption && <p className="text-[13px] text-slate-700 mt-1 whitespace-pre-wrap break-words">{highlight(caption, search)}</p>}
        </div>
        {m.type === "INTERACTIVE" && own && <InteractivePreview x={x} />}
        <div className={cn("mt-0.5 flex items-center justify-end gap-1 text-[10px] text-slate-400", padded && "px-2")}>
          {starred && <Icon name="star" filled className="w-3 h-3 text-amber-500" title="Starred" />}
          {time}
          {own && <Ticks status={m.pending ? "PENDING" : m.status} />}
        </div>
        {m.status === "FAILED" && m.failureReason && <p className={cn("mt-1 text-[11px] text-red-600", isMedia && "px-2")}>Failed: {m.failureReason}</p>}

        <PopoverMenu open={menu} onClose={() => setMenu(false)} items={items} label="Message actions" triggerRef={trigger}
          align={own ? "right" : "left"} placement={place} header={reactionBar} className="sm:w-64" />
        {picker && (
          <>
            <div className="sm:hidden fixed inset-0 z-[55] bg-slate-950/30" aria-hidden onClick={() => setPicker(false)} />
            <EmojiPicker triggerRef={trigger} onClose={() => setPicker(false)} onPick={(e) => { setPicker(false); actions.onReact(m, e); }}
              className={cn("fixed inset-x-2 bottom-2 sm:inset-x-auto sm:bottom-auto sm:absolute", own ? "sm:right-0" : "sm:left-0", place === "above" ? "sm:bottom-full sm:mb-1" : "sm:top-full sm:mt-1")} />
          </>
        )}
      </div>
      <ReactionChips reactions={x.reactions} own={own} myUserId={myUserId}
        onToggle={canReact ? (emoji, business) => actions.onReact(m, business ? "" : emoji) : undefined} />
    </div>
  );
}

// ─── Media ───────────────────────────────────────────────────────────────────
const MEDIA_KINDS = ["IMAGE", "VIDEO", "AUDIO", "DOCUMENT", "STICKER"];
const MEDIA_LABEL: Record<string, string> = { IMAGE: "Photo", VIDEO: "Video", AUDIO: "Voice message", DOCUMENT: "Document", STICKER: "Sticker" };
const MEDIA_ICON: Record<string, string> = { IMAGE: "image", VIDEO: "videocam", AUDIO: "mic", DOCUMENT: "description", STICKER: "image" };

/** Mounts children only once the placeholder scrolls near the viewport. */
function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") { const t = setTimeout(() => setSeen(true), 0); return () => clearTimeout(t); }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); }
    }, { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen] as const;
}

function fileExt(name?: string | null) {
  const e = name?.split(".").pop();
  return e && e !== name && e.length <= 5 ? e.toUpperCase() : null;
}

function MediaError({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-black/5 px-3 py-3 text-xs text-slate-600 w-64 max-w-full">
      <Icon name="error" className="w-4 h-4 text-slate-400 shrink-0" />
      <span className="flex-1 min-w-0">{label} unavailable. It may have expired on WhatsApp.</span>
      <button onClick={onRetry} aria-label="Retry loading media" className="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg hover:bg-black/5">
        <Icon name="refresh" className="w-4 h-4" />
      </button>
    </div>
  );
}

function MediaContent({ m }: { m: Message }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const label = MEDIA_LABEL[m.type] ?? "Media";

  if (!m.mediaUrl || m.pending || m.id.startsWith("temp-")) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-black/5 px-3 py-2.5 text-xs text-slate-600">
        <Icon name={MEDIA_ICON[m.type] ?? "description"} className="w-4 h-4" /> {label}
      </div>
    );
  }

  const src = `/api/media/${encodeURIComponent(m.id)}${attempt ? `?r=${attempt}` : ""}`;
  const download = `/api/media/${encodeURIComponent(m.id)}?download=1`;
  const retry = () => { setState("loading"); setAttempt((a) => a + 1); };

  if (m.type === "DOCUMENT") {
    const name = m.content || "Document";
    const ext = fileExt(m.content) ?? (m.mediaType?.includes("/") ? m.mediaType.split("/")[1].split(".").pop()?.toUpperCase().slice(0, 5) : null) ?? "FILE";
    return (
      <div className="flex items-center gap-3 rounded-xl bg-black/5 p-2.5 w-64 max-w-full">
        <span className="w-10 h-10 shrink-0 rounded-lg bg-white flex flex-col items-center justify-center text-red-500 shadow-sm">
          <Icon name="description" className="w-5 h-5" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-slate-800 truncate" title={name}>{name}</p>
          <p className="text-[10px] text-slate-500">{ext}</p>
        </div>
        <a href={download} download={name} aria-label={`Download ${name}`} title="Download"
          className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full border border-slate-300 text-slate-600 hover:bg-white">
          <Icon name="download" className="w-4 h-4" />
        </a>
      </div>
    );
  }

  if (state === "error") return <MediaError label={label} onRetry={retry} />;

  if (m.type === "AUDIO") {
    return (
      <div ref={ref} className="w-64 max-w-full">
        {inView ? (
          <audio key={attempt} controls preload="metadata" src={src} onError={() => setState("error")} className="w-full h-10" />
        ) : <div className="h-10 rounded-full bg-black/5 animate-pulse" />}
      </div>
    );
  }

  if (m.type === "VIDEO") {
    return (
      <div ref={ref} className="relative w-64 sm:w-72 max-w-full overflow-hidden rounded-xl bg-black/80">
        {inView && (
          <video key={attempt} controls playsInline preload="metadata" src={src}
            onLoadedMetadata={() => setState("ready")} onError={() => setState("error")}
            className={cn("block w-full max-h-80", state !== "ready" && "h-40")} />
        )}
        {state === "loading" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-200 animate-pulse">
            <Icon name="videocam" className="w-8 h-8 text-slate-400" />
          </div>
        )}
      </div>
    );
  }

  // IMAGE / STICKER
  const sticker = m.type === "STICKER";
  return (
    <>
      <div ref={ref} className={cn("relative overflow-hidden", sticker ? "w-32 h-32" : "w-64 sm:w-72 max-w-full rounded-xl", state !== "ready" && !sticker && "h-48")}>
        {inView && (
          // eslint-disable-next-line @next/next/no-img-element -- authenticated proxy; next/image can't forward cookies
          <img key={attempt} src={src} alt={m.mediaCaption || m.content || label} loading="lazy" decoding="async"
            onLoad={() => setState("ready")} onError={() => setState("error")}
            onClick={() => !sticker && state === "ready" && setLightbox(true)}
            className={cn(sticker ? "w-full h-full object-contain" : "block w-full max-h-80 object-cover cursor-zoom-in", state !== "ready" && "opacity-0")} />
        )}
        {state === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-200/80 animate-pulse rounded-xl">
            <Icon name="image" className="w-8 h-8 text-slate-400" />
          </div>
        )}
      </div>
      {lightbox && <Lightbox src={src} download={download} alt={m.mediaCaption || m.content || label} onClose={() => setLightbox(false)} />}
    </>
  );
}

function Lightbox({ src, download, alt, onClose }: { src: string; download: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-slate-950/95 admin-fade" role="dialog" aria-modal="true" aria-label="Image preview" onClick={onClose}>
      <div className="flex items-center justify-end gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]" onClick={(e) => e.stopPropagation()}>
        <a href={download} download className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-2 text-xs font-semibold text-white hover:bg-white/20">
          <Icon name="download" className="w-4 h-4" /> Download
        </a>
        <button onClick={onClose} aria-label="Close preview" className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
          <Icon name="close" className="w-5 h-5" />
        </button>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {/* eslint-disable-next-line @next/next/no-img-element -- authenticated proxy */}
        <img src={src} alt={alt} onClick={(e) => e.stopPropagation()} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
      </div>
    </div>
  );
}

type AttachmentKind = "image" | "video" | "audio" | "document";
interface Attachment { file: File; kind: AttachmentKind; url: string | null }
// Request bodies are capped by the host (Vercel: 4.5 MB), so uploads stop at 4 MB.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const ATTACH_TYPES: Record<string, AttachmentKind> = {
  "image/jpeg": "image", "image/png": "image", "video/mp4": "video", "video/3gpp": "video",
  "audio/ogg": "audio", "audio/mpeg": "audio", "audio/aac": "audio", "audio/amr": "audio", "audio/mp4": "audio",
  "application/pdf": "document", "text/plain": "document", "application/msword": "document",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "document",
  "application/vnd.ms-excel": "document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "document",
  "application/vnd.ms-powerpoint": "document", "application/vnd.openxmlformats-officedocument.presentationml.presentation": "document",
};
const ATTACH_EXT: Record<string, AttachmentKind> = {
  jpg: "image", jpeg: "image", png: "image", mp4: "video", "3gp": "video", ogg: "audio", opus: "audio", mp3: "audio", aac: "audio", amr: "audio", m4a: "audio",
  pdf: "document", txt: "document", doc: "document", docx: "document", xls: "document", xlsx: "document", ppt: "document", pptx: "document",
};
const ACCEPT = [...Object.keys(ATTACH_TYPES), ...Object.keys(ATTACH_EXT).map((e) => `.${e}`)].join(",");
function attachmentKind(f: File): AttachmentKind | null {
  return ATTACH_TYPES[f.type.split(";")[0]] ?? ATTACH_EXT[f.name.split(".").pop()?.toLowerCase() ?? ""] ?? null;
}
function formatBytes(n: number) {
  return n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// ─── Composer ────────────────────────────────────────────────────────────────
const TYPING_THROTTLE_MS = 20_000;

function Composer({ conversationId, windowOpen, meta, disabled, blocked, optedOut, onUnblock, replyTo, contactName, onCancelReply, onSent, onDone }: {
  conversationId: string; windowOpen: boolean; meta?: Meta; disabled: boolean; blocked: boolean; optedOut: boolean; onUnblock: () => void;
  replyTo: Message | null; contactName: string; onCancelReply: () => void; onSent: (m: Message) => void; onDone: () => void;
}) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachMenu, setAttachMenu] = useState(false);
  const [extra, setExtra] = useState<null | "location" | "contact" | "button" | "list">(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const previewUrl = useRef<string | null>(null);
  const emojiBtn = useRef<HTMLButtonElement>(null);
  const attachBtn = useRef<HTMLButtonElement>(null);
  const lastTyping = useRef(0);
  const voiceOk = useVoiceSupported();

  // Release the local preview URL when the composer goes away.
  useEffect(() => () => { if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); }, []);

  // Focus the input when a reply is started.
  useEffect(() => { if (replyTo) ref.current?.focus(); }, [replyTo]);

  const clearAttachment = () => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
    setAttachment(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const pickFile = (file: File | undefined | null) => {
    if (!file) return;
    const kind = attachmentKind(file);
    if (!kind) { toast.error("Unsupported file. Send JPG/PNG, MP4, OGG/MP3/AAC/AMR audio, or PDF/Office/TXT documents."); return; }
    if (file.size > MAX_UPLOAD_BYTES) { toast.error(`"${file.name}" is ${formatBytes(file.size)}. Files must be 4 MB or smaller.`); return; }
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = kind === "image" || kind === "video" || kind === "audio" ? URL.createObjectURL(file) : null;
    setAttachment({ file, kind, url: previewUrl.current });
    ref.current?.focus();
  };

  /** [chat] "typing…" for the customer, at most once per 20 s (the server throttles too). */
  const pingTyping = () => {
    const now = Date.now();
    if (!windowOpen || now - lastTyping.current < TYPING_THROTTLE_MS) return;
    lastTyping.current = now;
    axios.post(`/api/conversations/${conversationId}/typing`).catch(() => {});
  };

  const sendMedia = async (a: Attachment) => {
    if (sending) return;
    setSending(true);
    setProgress(0);
    const caption = a.kind === "audio" ? "" : text.trim();
    const form = new FormData();
    form.append("file", a.file, a.file.name);
    if (caption) form.append("caption", caption);
    try {
      const r = await axios.post(`/api/conversations/${conversationId}/media`, form, {
        onUploadProgress: (ev) => setProgress(ev.total ? Math.round((ev.loaded / ev.total) * 100) : null),
      });
      if (r.data?.message) onSent(r.data.message as Message);
      setText("");
      clearAttachment();
      onCancelReply();
    } catch (e) {
      toast.error(err(e, "File not sent"));
    } finally {
      setSending(false);
      setProgress(null);
      onDone();
    }
  };

  /** Sends location / contacts / interactive through the messages route (with the reply quote). */
  const sendRich = async (payload: Record<string, unknown>, label: string) => {
    try {
      const r = await axios.post(`/api/conversations/${conversationId}/messages`, { ...payload, replyToId: replyTo?.id });
      if (r.data?.message) onSent(r.data.message as Message);
      onCancelReply();
      return true;
    } catch (e) {
      toast.error(err(e, `${label} not sent`));
      return false;
    } finally {
      onDone();
    }
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [text]);

  const slash = text.startsWith("/") && !text.includes(" ") ? text.slice(1).toLowerCase() : null;
  const suggestions = slash !== null ? (meta?.quickReplies ?? []).filter((q) => q.shortcut.startsWith(slash)).slice(0, 6) : [];

  const send = async () => {
    if (attachment) return sendMedia(attachment);
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    const quote = replyTo;
    const temp: Message = {
      id: `temp-${Date.now()}`, direction: "OUTBOUND", type: "TEXT", status: "PENDING", content, mediaType: null, mediaCaption: null,
      templateName: null, failureReason: null, isBotMessage: false, createdAt: new Date().toISOString(), sentByUser: null, pending: true,
      interactive: quote?.wamid ? { context: { wamid: quote.wamid, messageId: quote.id, preview: messagePreview(quote), direction: quote.direction } } : undefined,
    };
    onSent(temp);
    setText("");
    onCancelReply();
    try {
      await axios.post(`/api/conversations/${conversationId}/messages`, { type: "text", content, replyToId: quote?.id });
    } catch (e) {
      toast.error(err(e, "Message not sent"));
      setText(content);
    } finally {
      setSending(false);
      onDone();
    }
  };

  const insertEmoji = (e: string) => {
    const el = ref.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    setText((t) => t.slice(0, start) + e + t.slice(end));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + e.length, start + e.length); });
  };

  const saveQuickReply = async () => {
    const content = text.trim();
    if (!content) return;
    const shortcut = window.prompt("Shortcut for this quick reply (e.g. thanks):");
    if (!shortcut) return;
    try {
      await axios.post("/api/quick-replies", { shortcut, content });
      toast.success(`Saved. Type /${shortcut.toLowerCase()} to use it.`);
      qc.invalidateQueries({ queryKey: ["inbox-meta"] });
    } catch (e) { toast.error(err(e)); }
  };

  if (blocked || optedOut) {
    return (
      <div className="border-t border-slate-200 bg-white p-3 sm:p-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-3">
          <Icon name="block" className="w-5 h-5 text-red-600 shrink-0" />
          <p className="flex-1 text-xs text-red-900">
            {blocked
              ? <><b>You blocked this contact.</b> Messages can&apos;t be sent until you unblock them. Their incoming messages still arrive here.</>
              : <><b>This contact unsubscribed (STOP).</b> Nothing can be sent until they message START again.</>}
          </p>
          {blocked && (
            <button onClick={onUnblock} className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-white px-3.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-100">
              Unblock
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!windowOpen) {
    return (
      <div className="border-t border-slate-200 bg-white p-3 sm:p-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3">
          <Icon name="schedule" className="w-5 h-5 text-amber-600 shrink-0" />
          <p className="flex-1 text-xs text-amber-900">
            <b>The 24-hour reply window is closed.</b> WhatsApp only allows approved templates until the customer messages again.
          </p>
          <button onClick={() => setShowTemplates(true)} disabled={disabled}
            className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#25D366] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#1fb857] disabled:opacity-50">
            <Icon name="description" className="w-4 h-4" /> Send template
          </button>
        </div>
        {showTemplates && <TemplatePicker conversationId={conversationId} templates={meta?.templates ?? []} onClose={() => setShowTemplates(false)} onDone={onDone} />}
      </div>
    );
  }

  const attachItems: MenuItem[] = [
    { id: "file", label: "Photo, video, audio or document", icon: "attach_file", onSelect: () => fileRef.current?.click() },
    { id: "location", label: "Location", icon: "location_on", onSelect: () => setExtra("location") },
    { id: "contact", label: "Contact card", icon: "contact_page", onSelect: () => setExtra("contact") },
    { id: "button", label: "Reply buttons", icon: "touch_app", onSelect: () => setExtra("button") },
    { id: "list", label: "List message", icon: "list", onSelect: () => setExtra("list") },
    { id: "template", label: "Template", icon: "description", onSelect: () => setShowTemplates(true) },
  ];
  const showMic = voiceOk && !text.trim() && !attachment && !sending;

  return (
    <div className="relative border-t border-slate-200 bg-white px-2 sm:px-4 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
      {suggestions.length > 0 && (
        <ul className="absolute bottom-full left-2 right-2 sm:left-4 sm:right-4 mb-2 rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden">
          {suggestions.map((q) => (
            <li key={q.id}>
              <button onClick={() => { setText(q.content); ref.current?.focus(); }} className="w-full text-left px-4 py-2.5 hover:bg-slate-50">
                <span className="text-xs font-bold text-green-700">/{q.shortcut}</span>
                <span className="block text-xs text-slate-500 truncate">{q.content}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {replyTo && (
        <div className="mb-2 flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <QuotedBlock own={false} contactName={contactName}
              ctx={{ wamid: replyTo.wamid ?? "", messageId: replyTo.id, preview: messagePreview(replyTo), direction: replyTo.direction }} />
            {attachment && <p className="text-[10px] text-slate-400 px-1">Files from your device are sent without the quote.</p>}
          </div>
          <button onClick={onCancelReply} aria-label="Cancel reply" className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
            <Icon name="close" className="w-4 h-4" />
          </button>
        </div>
      )}
      {attachment && (
        <div className="mb-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-2 pr-3">
          {attachment.kind === "image" && attachment.url ? (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
            <img src={attachment.url} alt="" className="w-12 h-12 rounded-xl object-cover shrink-0" />
          ) : attachment.kind === "video" && attachment.url ? (
            <video src={attachment.url} muted preload="metadata" className="w-12 h-12 rounded-xl object-cover shrink-0 bg-black" />
          ) : (
            <span className="w-12 h-12 rounded-xl bg-white flex items-center justify-center shrink-0 shadow-sm">
              <Icon name={attachment.kind === "audio" ? "mic" : "description"} className="w-6 h-6 text-slate-500" />
            </span>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-800 truncate">{attachment.file.name}</p>
            {attachment.kind === "audio" && attachment.url && !sending && <audio src={attachment.url} controls preload="metadata" className="mt-1 h-8 w-full max-w-xs" />}
            <p className="text-[10px] text-slate-500">
              {sending
                ? progress !== null && progress < 100 ? `Uploading… ${progress}%` : "Sending to WhatsApp…"
                : `${formatBytes(attachment.file.size)} · ${attachment.kind === "audio" ? "audio can't have a caption" : "add an optional caption below"}`}
            </p>
            {sending && (
              <div className="mt-1 h-1 rounded-full bg-slate-200 overflow-hidden">
                <div className={cn("h-full bg-[#25D366] transition-all", (progress === null || progress >= 100) && "animate-pulse")} style={{ width: `${progress === null || progress >= 100 ? 100 : progress}%` }} />
              </div>
            )}
          </div>
          <button onClick={clearAttachment} disabled={sending} aria-label="Remove attachment" className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200 disabled:opacity-40">
            <Icon name="close" className="w-4 h-4" />
          </button>
        </div>
      )}
      <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
      <div className="flex items-end gap-1 sm:gap-2">
        <div className="flex">
          <div className="relative">
            <button ref={emojiBtn} onClick={() => setEmojiOpen((o) => !o)} disabled={disabled || sending} aria-label="Emoji" aria-expanded={emojiOpen} title="Emoji"
              className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 disabled:opacity-40">
              <Icon name="mood" className="w-5 h-5" />
            </button>
            {emojiOpen && <EmojiPicker triggerRef={emojiBtn} onClose={() => setEmojiOpen(false)} onPick={insertEmoji} className="absolute bottom-full left-0 mb-2" />}
          </div>
          <div className="relative">
            <button ref={attachBtn} onClick={() => setAttachMenu((o) => !o)} disabled={disabled || sending} aria-label="Attach" aria-haspopup="menu" aria-expanded={attachMenu}
              title="Attach a file, location, contact or interactive message"
              className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 disabled:opacity-40">
              <Icon name="attach_file" className="w-5 h-5" />
            </button>
            <PopoverMenu open={attachMenu} onClose={() => setAttachMenu(false)} items={attachItems} label="Attach" triggerRef={attachBtn} align="left" placement="above" className="sm:w-64" />
          </div>
          <button onClick={saveQuickReply} disabled={!text.trim()} title="Save as quick reply" aria-label="Save as quick reply" className="hidden sm:flex w-10 h-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 disabled:opacity-30">
            <Icon name="bolt" className="w-5 h-5" />
          </button>
        </div>
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => { setText(e.target.value); if (e.target.value.trim()) pingTyping(); }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && replyTo) { e.preventDefault(); onCancelReply(); return; }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (suggestions.length === 1) setText(suggestions[0].content);
              else send();
            }
          }}
          onPaste={(e) => {
            const f = e.clipboardData.files?.[0];
            if (f) { e.preventDefault(); pickFile(f); }
          }}
          rows={1}
          disabled={disabled || (!!attachment && (attachment.kind === "audio" || sending))}
          maxLength={attachment ? 1024 : 4096}
          placeholder={attachment ? (attachment.kind === "audio" ? "Audio is sent without a caption" : "Add a caption…") : meta?.quickReplies.length ? "Type a message… (/ for quick replies)" : "Type a message…"}
          className="flex-1 min-w-0 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm leading-snug focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500 max-h-40"
        />
        {showMic && <VoiceRecorderButton disabled={disabled} onRecorded={pickFile} />}
        {!showMic && (
          <button onClick={send} disabled={(!text.trim() && !attachment) || sending || disabled} aria-label={attachment ? "Send file" : "Send message"}
            className="w-11 h-11 shrink-0 flex items-center justify-center rounded-full bg-[#25D366] text-white shadow-md shadow-green-500/30 hover:bg-[#1fb857] disabled:opacity-40 disabled:shadow-none transition">
            {sending && attachment
              ? <span className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
              : <Icon name="send" filled className="w-5 h-5" />}
          </button>
        )}
      </div>
      <p className="hidden sm:block mt-1 px-1 text-[10px] text-slate-400">Enter to send · Shift + Enter for a new line · Files up to 4 MB</p>
      {showTemplates && <TemplatePicker conversationId={conversationId} templates={meta?.templates ?? []} onClose={() => setShowTemplates(false)} onDone={onDone} />}
      {extra === "location" && <LocationDialog onClose={() => setExtra(null)} onSend={(location) => sendRich({ type: "location", location }, "Location")} />}
      {extra === "contact" && <ContactCardDialog onClose={() => setExtra(null)} onSend={(contactIds) => sendRich({ type: "contacts", contactIds }, "Contact")} />}
      {(extra === "button" || extra === "list") && (
        <InteractiveDialog kind={extra} onClose={() => setExtra(null)} onSend={(interactive) => sendRich({ type: "interactive", interactive }, "Message")} />
      )}
    </div>
  );
}

function TemplatePicker({ conversationId, templates, onClose, onDone }: { conversationId: string; templates: Meta["templates"]; onClose: () => void; onDone: () => void }) {
  const [selected, setSelected] = useState<Meta["templates"][number] | null>(null);
  const [vars, setVars] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const placeholders = useMemo(() => (selected ? [...new Set(selected.body.match(/\{\{\d+\}\}/g) ?? [])].sort() : []), [selected]);
  const rendered = selected ? placeholders.reduce((b, p, i) => b.replaceAll(p, vars[i] || p), selected.body) : "";

  const send = async () => {
    if (!selected) return;
    setSending(true);
    try {
      await axios.post(`/api/conversations/${conversationId}/messages`, {
        type: "template",
        templateName: selected.name,
        languageCode: selected.language,
        content: rendered,
        components: placeholders.length ? [{ type: "body", parameters: placeholders.map((_, i) => ({ type: "text", text: vars[i] ?? "" })) }] : [],
      });
      toast.success("Template sent");
      onClose();
      onDone();
    } catch (e) { toast.error(err(e, "Template not sent")); }
    finally { setSending(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label="Send template">
      <div className="absolute inset-0 bg-slate-950/50 admin-fade" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg max-h-[88dvh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white shadow-2xl admin-pop">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          {selected && <button onClick={() => setSelected(null)} aria-label="Back" className="w-8 h-8 -ml-1 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"><Icon name="arrow_back" className="w-4 h-4" /></button>}
          <h3 className="flex-1 text-base font-bold text-slate-900">{selected ? selected.name : "Choose a template"}</h3>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"><Icon name="close" className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {!selected ? (
            templates.length === 0 ? (
              <div className="py-10 text-center">
                <Icon name="description" className="w-8 h-8 text-slate-300" />
                <p className="mt-2 text-sm font-semibold text-slate-700">No approved templates</p>
                <p className="text-xs text-slate-500 mt-1">Create one in Templates and wait for Meta approval.</p>
                <a href="/templates" className="mt-4 inline-block rounded-xl bg-[#25D366] px-4 py-2 text-xs font-semibold text-white">Go to Templates</a>
              </div>
            ) : (
              <ul className="space-y-2">
                {templates.map((t) => (
                  <li key={t.id}>
                    <button onClick={() => { setSelected(t); setVars([]); }} className="w-full text-left rounded-xl border border-slate-200 p-3 hover:border-green-300 hover:bg-green-50/30">
                      <div className="flex items-center gap-2"><span className="text-sm font-semibold text-slate-900">{t.name}</span><span className="text-[10px] rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">{t.category.toLowerCase()} · {t.language}</span></div>
                      <p className="mt-1 text-xs text-slate-500 line-clamp-2">{t.body}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <div className="space-y-4">
              {placeholders.map((p, i) => (
                <label key={p} className="block space-y-1.5">
                  <span className="text-xs font-semibold text-slate-600">Value for {p}</span>
                  <input value={vars[i] ?? ""} onChange={(e) => { const v = [...vars]; v[i] = e.target.value; setVars(v); }}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500" />
                </label>
              ))}
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-1.5">Preview</p>
                <div className="rounded-2xl bg-[#efeae2] p-3"><p className="ml-auto max-w-[90%] rounded-2xl rounded-tr-sm bg-[#d9fdd3] px-3 py-2 text-sm whitespace-pre-wrap">{rendered}</p></div>
              </div>
            </div>
          )}
        </div>
        {selected && (
          <div className="px-5 py-4 border-t border-slate-100 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button onClick={send} disabled={sending || placeholders.some((_, i) => !vars[i]?.trim())}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] py-3 text-sm font-semibold text-white hover:bg-[#1fb857] disabled:opacity-50">
              {sending && <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />}
              <Icon name="send" className="w-4 h-4" /> Send template
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Contact / conversation details ──────────────────────────────────────────
function InfoPanel({ detail, meta, onClose, onChanged, onAssign, onStatus }: {
  detail: Detail; meta?: Meta; onClose: () => void; onChanged: () => void; onAssign: (id: string) => void; onStatus: (s: Status) => void;
}) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const labelIds = detail.labels.map((l) => l.label.id);
  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: () => axios.get("/api/settings/teams").then((r) => r.data.teams as { id: string; name: string }[]),
    staleTime: 60_000,
  });
  const setTeam = async (teamId: string) => {
    try {
      await axios.post(`/api/conversations/${detail.id}/team`, { teamId: teamId || null });
      toast.success(teamId ? `Moved to ${teams?.find((t) => t.id === teamId)?.name ?? "team"}` : "Team removed");
      onChanged();
    } catch (e) { toast.error(err(e, "Couldn't change team")); }
  };

  const toggleLabel = async (id: string) => {
    const next = labelIds.includes(id) ? labelIds.filter((x) => x !== id) : [...labelIds, id];
    try { await axios.patch(`/api/conversations/${detail.id}`, { labelIds: next }); onChanged(); } catch (e) { toast.error(err(e)); }
  };
  const addNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.trim()) return;
    setSaving(true);
    try { await axios.post(`/api/conversations/${detail.id}/notes`, { content: note }); setNote(""); onChanged(); }
    catch (e) { toast.error(err(e)); }
    finally { setSaving(false); }
  };
  const deleteNote = async (noteId: string) => {
    try { await axios.delete(`/api/conversations/${detail.id}/notes`, { params: { noteId } }); onChanged(); } catch (e) { toast.error(err(e)); }
  };
  const copy = (v: string) => { navigator.clipboard.writeText(v); toast.success("Copied"); };

  return (
    <>
      <div className="h-16 flex items-center justify-between px-4 border-b border-slate-200 shrink-0">
        <p className="text-sm font-bold text-slate-900">Contact details</p>
        <button onClick={onClose} aria-label="Close details" className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"><Icon name="close" className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="text-center">
          <div className="flex justify-center"><Avatar name={displayName(detail.contact)} size="lg" /></div>
          <p className="mt-2 text-base font-bold text-slate-900">{displayName(detail.contact)}</p>
          <button onClick={() => copy(`+${detail.contact.phone}`)} className="text-xs text-slate-500 hover:text-green-700 inline-flex items-center gap-1">
            +{detail.contact.phone} <Icon name="content_copy" className="w-3 h-3" />
          </button>
          <div className="mt-2 flex justify-center gap-1.5 flex-wrap">
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">{detail.contact.stage}</span>
            {detail.contact.tags.map((t) => <span key={t.tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">#{t.tag}</span>)}
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-2 text-xs">
          {[
            ["Email", detail.contact.email ?? "—"],
            ["Customer since", new Date(detail.contact.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })],
            ["Conversations", String(detail.contact._count.conversations)],
            ["Messages here", String(detail._count.messages)],
            ["Via number", detail.whatsappAccount.displayName],
            ["Started", timeAgo(detail.createdAt)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-slate-50 p-2.5 min-w-0"><dt className="text-[10px] text-slate-400">{k}</dt><dd className="mt-0.5 font-semibold text-slate-800 truncate">{v}</dd></div>
          ))}
        </dl>

        <section className="space-y-2">
          <p className="text-xs font-bold text-slate-700">Assignment & status</p>
          <select value={detail.assignedAgent?.id ?? ""} onChange={(e) => onAssign(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30">
            <option value="">Unassigned</option>
            {meta?.members.map((m) => <option key={m.id} value={m.id}>{m.name ?? m.email}{m.id === meta.me.userId ? " (me)" : ""}</option>)}
          </select>
          {!!teams?.length && (
            <select value={detail.assignedTeam?.id ?? ""} onChange={(e) => setTeam(e.target.value)} aria-label="Assign team"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30">
              <option value="">No team</option>
              {teams.map((t) => <option key={t.id} value={t.id}>Team: {t.name}</option>)}
            </select>
          )}
          <div className="grid grid-cols-3 gap-1.5">
            {(["OPEN", "PENDING", "RESOLVED"] as Status[]).map((s) => (
              <button key={s} onClick={() => s !== detail.status && onStatus(s)}
                className={cn("rounded-lg border py-1.5 text-[11px] font-semibold", detail.status === s ? "border-green-500 bg-green-50 text-green-700" : "border-slate-200 text-slate-600 hover:bg-slate-50")}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </section>

        {!!meta?.labels.length && (
          <section className="space-y-2">
            <p className="text-xs font-bold text-slate-700">Labels</p>
            <div className="flex flex-wrap gap-1.5">
              {meta.labels.map((l) => {
                const on = labelIds.includes(l.id);
                return (
                  <button key={l.id} onClick={() => toggleLabel(l.id)} className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold border transition", on ? "border-transparent" : "border-slate-200 text-slate-500 bg-white")}
                    style={on ? { background: `${l.color}1f`, color: l.color } : undefined}>
                    {on && <Icon name="check" className="w-3 h-3 mr-0.5 inline" />}{l.name}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <section className="space-y-2">
          <p className="text-xs font-bold text-slate-700">Internal notes <span className="font-normal text-slate-400">· only your team sees these</span></p>
          <form onSubmit={addNote} className="space-y-2">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} placeholder="Add a note for your team…"
              className="w-full resize-none rounded-xl border border-slate-200 bg-amber-50/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400" />
            <button type="submit" disabled={!note.trim() || saving} className="w-full rounded-xl bg-amber-500 py-2 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-40">Add note</button>
          </form>
          <ul className="space-y-2">
            {detail.notes.map((n) => (
              <li key={n.id} className="group rounded-xl border border-amber-100 bg-amber-50/60 p-3">
                <p className="text-sm text-slate-800 whitespace-pre-wrap break-words">{n.content}</p>
                <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-500">
                  <span>{n.author?.name ?? n.author?.email ?? "Someone"} · {timeAgo(n.createdAt)}</span>
                  {(n.authorId === meta?.me.userId || meta?.me.role === "ADMIN") && (
                    <button onClick={() => deleteNote(n.id)} aria-label="Delete note" className="opacity-60 hover:opacity-100 text-red-500"><Icon name="delete" className="w-3.5 h-3.5" /></button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
