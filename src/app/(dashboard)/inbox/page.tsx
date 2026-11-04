"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { Icon } from "@/components/ui/icon";
import { pusherClient, PUSHER_EVENTS, orgChannel, conversationChannel, REALTIME_ENABLED } from "@/lib/pusher";
import { cn, getInitials, timeAgo } from "@/lib/utils";

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
interface Message {
  id: string; direction: "INBOUND" | "OUTBOUND"; type: string; status: string; content: string | null; mediaType: string | null;
  mediaCaption: string | null; templateName: string | null; failureReason: string | null; isBotMessage: boolean; createdAt: string;
  sentByUser: { id: string; name: string | null } | null; pending?: boolean;
}
interface Detail {
  id: string; status: Status; isRead: boolean; createdAt: string; sessionExpiresAt: string | null; lastMessageAt: string | null;
  contact: { id: string; name: string | null; phone: string; email: string | null; stage: string; createdAt: string; notes: string | null; tags: { tag: string }[]; _count: { conversations: number } };
  assignedAgent: { id: string; name: string | null; email: string } | null;
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
  if (m.content) return m.content;
  const map: Record<string, string> = { IMAGE: "📷 Photo", VIDEO: "🎥 Video", AUDIO: "🎤 Voice message", DOCUMENT: "📄 Document", LOCATION: "📍 Location", TEMPLATE: "Template message" };
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
function ChatArea({ conversationId, meta, onBack }: { conversationId: string; meta?: Meta; onBack: () => void }) {
  const qc = useQueryClient();
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [showInfo, setShowInfo] = useState(false);

  const { data: detail, refetch: refetchDetail } = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: () => axios.get(`/api/conversations/${conversationId}`).then((r) => r.data.conversation as Detail),
    refetchInterval: POLL_MS ? 15_000 : false,
  });

  const msgs = useInfiniteQuery({
    queryKey: ["messages", conversationId],
    queryFn: ({ pageParam }) => axios.get(`/api/conversations/${conversationId}/messages`, { params: { page: pageParam } }).then((r) => r.data as { messages: Message[]; page: number }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.messages.length === 50 ? last.page + 1 : undefined),
    refetchInterval: POLL_MS,
  });
  const messages = useMemo(() => (msgs.data?.pages ?? []).slice().reverse().flatMap((p) => p.messages), [msgs.data]);

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

  const win = windowInfo(detail?.sessionExpiresAt ?? null);
  const name = detail ? displayName(detail.contact) : "…";

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
              <p className="text-sm font-bold text-slate-900 truncate">{name}</p>
              <p className={cn("text-[11px] truncate flex items-center gap-1", !win.open ? "text-slate-500" : win.urgent ? "text-amber-600" : "text-green-600")}>
                <Icon name="schedule" className="w-3 h-3" /> {detail ? win.label : "Loading…"}
              </p>
            </div>
          </button>
          {detail && (
            <div className="flex items-center gap-1.5 shrink-0">
              <select value={detail.assignedAgent?.id ?? ""} onChange={(e) => assign(e.target.value)} aria-label="Assign conversation"
                className="hidden sm:block max-w-[160px] rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-500/30">
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
              <button onClick={() => setShowInfo((s) => !s)} aria-label="Contact details" aria-pressed={showInfo}
                className={cn("w-9 h-9 flex items-center justify-center rounded-lg border", showInfo ? "border-green-200 bg-green-50 text-green-700" : "border-slate-200 text-slate-500 hover:bg-slate-50")}>
                <Icon name="info" className="w-4 h-4" />
              </button>
            </div>
          )}
        </header>

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
          {msgs.isLoading && <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className={cn("h-12 w-2/3 rounded-2xl bg-white/70 animate-pulse", i % 2 && "ml-auto")} />)}</div>}
          {groups.map((g) => (
            <div key={g.day} className="space-y-1">
              <div className="sticky top-0 z-10 flex justify-center py-2">
                <span className="rounded-lg bg-white/90 px-3 py-1 text-[11px] font-semibold text-slate-500 shadow-sm">{g.day}</span>
              </div>
              {g.items.map((m, i) => {
                const prev = g.items[i - 1];
                return <Bubble key={m.id} m={m} grouped={!!prev && prev.direction === m.direction} />;
              })}
            </div>
          ))}
        </div>

        <Composer conversationId={conversationId} windowOpen={win.open} meta={meta} disabled={!detail}
          onSent={(m) => {
            qc.setQueryData(["messages", conversationId], (old: typeof msgs.data) => old && {
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
    </div>
  );
}

function Bubble({ m, grouped }: { m: Message; grouped: boolean }) {
  const own = m.direction === "OUTBOUND";
  const time = new Date(m.createdAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  const mediaIcon: Record<string, string> = { IMAGE: "image", VIDEO: "videocam", AUDIO: "mic", DOCUMENT: "description", LOCATION: "location_on" };
  let coords: { lat: number; lng: number } | null = null;
  if (m.type === "LOCATION" && m.content) {
    try { coords = JSON.parse(m.content); } catch { coords = null; }
  }
  const body: React.ReactNode = coords
    ? <a className="underline" target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${coords.lat},${coords.lng}`}>Open location in Maps</a>
    : m.content;
  return (
    <div className={cn("flex", own ? "justify-end" : "justify-start", grouped ? "mt-0.5" : "mt-2")}>
      <div className={cn("relative max-w-[85%] sm:max-w-[70%] rounded-2xl px-3 py-2 shadow-sm",
        own ? "bg-[#d9fdd3] text-slate-900" : "bg-white text-slate-900", !grouped && (own ? "rounded-tr-sm" : "rounded-tl-sm"), m.pending && "opacity-70")}>
        {own && !grouped && (m.sentByUser?.name || m.isBotMessage) && (
          <p className="text-[10px] font-semibold text-green-700 mb-0.5">{m.isBotMessage ? "Chatbot" : m.sentByUser?.name}</p>
        )}
        {m.type !== "TEXT" && m.type !== "TEMPLATE" && mediaIcon[m.type] && (
          <div className="mb-1 flex items-center gap-2 rounded-lg bg-black/5 px-2.5 py-2 text-xs text-slate-600">
            <Icon name={mediaIcon[m.type]} className="w-4 h-4" /> {m.type.charAt(0) + m.type.slice(1).toLowerCase()}
          </div>
        )}
        {m.type === "TEMPLATE" && <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5">Template · {m.templateName}</p>}
        {body && <p className="text-[14px] leading-snug whitespace-pre-wrap break-words">{body}</p>}
        {m.mediaCaption && <p className="text-[13px] text-slate-700 mt-1 whitespace-pre-wrap">{m.mediaCaption}</p>}
        <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-slate-400">
          {time}
          {own && <Ticks status={m.pending ? "PENDING" : m.status} />}
        </div>
        {m.status === "FAILED" && m.failureReason && <p className="mt-1 text-[11px] text-red-600">Failed: {m.failureReason}</p>}
      </div>
    </div>
  );
}

// ─── Composer ────────────────────────────────────────────────────────────────
function Composer({ conversationId, windowOpen, meta, disabled, onSent, onDone }: {
  conversationId: string; windowOpen: boolean; meta?: Meta; disabled: boolean; onSent: (m: Message) => void; onDone: () => void;
}) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [text]);

  const slash = text.startsWith("/") && !text.includes(" ") ? text.slice(1).toLowerCase() : null;
  const suggestions = slash !== null ? (meta?.quickReplies ?? []).filter((q) => q.shortcut.startsWith(slash)).slice(0, 6) : [];

  const send = async () => {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    const temp: Message = {
      id: `temp-${Date.now()}`, direction: "OUTBOUND", type: "TEXT", status: "PENDING", content, mediaType: null, mediaCaption: null,
      templateName: null, failureReason: null, isBotMessage: false, createdAt: new Date().toISOString(), sentByUser: null, pending: true,
    };
    onSent(temp);
    setText("");
    try {
      await axios.post(`/api/conversations/${conversationId}/messages`, { type: "text", content });
    } catch (e) {
      toast.error(err(e, "Message not sent"));
      setText(content);
    } finally {
      setSending(false);
      onDone();
    }
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
      <div className="flex items-end gap-2">
        <div className="flex">
          <button onClick={() => setShowTemplates(true)} title="Send a template" aria-label="Send a template" className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100">
            <Icon name="description" className="w-5 h-5" />
          </button>
          <button onClick={saveQuickReply} disabled={!text.trim()} title="Save as quick reply" aria-label="Save as quick reply" className="hidden sm:flex w-10 h-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 disabled:opacity-30">
            <Icon name="bolt" className="w-5 h-5" />
          </button>
        </div>
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (suggestions.length === 1) setText(suggestions[0].content);
              else send();
            }
          }}
          rows={1}
          disabled={disabled}
          placeholder={meta?.quickReplies.length ? "Type a message… (/ for quick replies)" : "Type a message…"}
          className="flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm leading-snug focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500 max-h-40"
        />
        <button onClick={send} disabled={!text.trim() || sending || disabled} aria-label="Send message"
          className="w-11 h-11 shrink-0 flex items-center justify-center rounded-full bg-[#25D366] text-white shadow-md shadow-green-500/30 hover:bg-[#1fb857] disabled:opacity-40 disabled:shadow-none transition">
          <Icon name="send" filled className="w-5 h-5" />
        </button>
      </div>
      <p className="hidden sm:block mt-1 px-1 text-[10px] text-slate-400">Enter to send · Shift + Enter for a new line</p>
      {showTemplates && <TemplatePicker conversationId={conversationId} templates={meta?.templates ?? []} onClose={() => setShowTemplates(false)} onDone={onDone} />}
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
