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
  id: string; direction: "INBOUND" | "OUTBOUND"; type: string; status: string; content: string | null; mediaType: string | null; mediaUrl?: string | null;
  mediaCaption: string | null; templateName: string | null; failureReason: string | null; isBotMessage: boolean; createdAt: string;
  sentByUser: { id: string; name: string | null } | null; pending?: boolean;
}
interface Detail {
  id: string; status: Status; isRead: boolean; createdAt: string; sessionExpiresAt: string | null; lastMessageAt: string | null;
  contact: { id: string; name: string | null; phone: string; email: string | null; stage: string; createdAt: string; notes: string | null; tags: { tag: string }[]; _count: { conversations: number } };
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
  if (m.content) return m.content;
  const map: Record<string, string> = { IMAGE: "Photo", VIDEO: "Video", AUDIO: "Voice message", DOCUMENT: "Document", STICKER: "Sticker", LOCATION: "Location", TEMPLATE: "Template message" };
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
  const isMedia = MEDIA_KINDS.includes(m.type);
  let coords: { lat: number; lng: number } | null = null;
  if (m.type === "LOCATION" && m.content) {
    try { coords = JSON.parse(m.content); } catch { coords = null; }
  }
  const body: React.ReactNode = coords
    ? <a className="underline" target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${coords.lat},${coords.lng}`}>Open location in Maps</a>
    : m.type === "DOCUMENT" ? null // the filename is shown on the file card
    : m.content;
  const caption = m.mediaCaption && m.mediaCaption !== m.content ? m.mediaCaption : null;
  return (
    <div className={cn("flex", own ? "justify-end" : "justify-start", grouped ? "mt-0.5" : "mt-2")}>
      <div className={cn("relative max-w-[85%] sm:max-w-[70%] min-w-0 rounded-2xl shadow-sm", isMedia && m.type !== "AUDIO" && m.type !== "DOCUMENT" ? "p-1 pb-1.5" : "px-3 py-2",
        own ? "bg-[#d9fdd3] text-slate-900" : "bg-white text-slate-900", !grouped && (own ? "rounded-tr-sm" : "rounded-tl-sm"), m.pending && "opacity-70")}>
        {own && !grouped && (m.sentByUser?.name || m.isBotMessage) && (
          <p className={cn("text-[10px] font-semibold text-green-700 mb-0.5", isMedia && "px-2 pt-1")}>{m.isBotMessage ? "Chatbot" : m.sentByUser?.name}</p>
        )}
        {isMedia && <MediaContent m={m} />}
        {m.type === "TEMPLATE" && <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5">Template · {m.templateName}</p>}
        <div className={cn(isMedia && m.type !== "AUDIO" && m.type !== "DOCUMENT" && "px-2")}>
          {body && <p className={cn("text-[14px] leading-snug whitespace-pre-wrap break-words", isMedia && "mt-1")}>{body}</p>}
          {caption && <p className="text-[13px] text-slate-700 mt-1 whitespace-pre-wrap break-words">{caption}</p>}
        </div>
        <div className={cn("mt-0.5 flex items-center justify-end gap-1 text-[10px] text-slate-400", isMedia && m.type !== "AUDIO" && m.type !== "DOCUMENT" && "px-2")}>
          {time}
          {own && <Ticks status={m.pending ? "PENDING" : m.status} />}
        </div>
        {m.status === "FAILED" && m.failureReason && <p className={cn("mt-1 text-[11px] text-red-600", isMedia && "px-2")}>Failed: {m.failureReason}</p>}
      </div>
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
function Composer({ conversationId, windowOpen, meta, disabled, onSent, onDone }: {
  conversationId: string; windowOpen: boolean; meta?: Meta; disabled: boolean; onSent: (m: Message) => void; onDone: () => void;
}) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const previewUrl = useRef<string | null>(null);

  // Release the local preview URL when the composer goes away.
  useEffect(() => () => { if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); }, []);

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
    previewUrl.current = kind === "image" || kind === "video" ? URL.createObjectURL(file) : null;
    setAttachment({ file, kind, url: previewUrl.current });
    ref.current?.focus();
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
    } catch (e) {
      toast.error(err(e, "File not sent"));
    } finally {
      setSending(false);
      setProgress(null);
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
      <div className="flex items-end gap-2">
        <div className="flex">
          <button onClick={() => fileRef.current?.click()} disabled={disabled || sending} title="Attach a photo, video, audio or document (max 4 MB)" aria-label="Attach a file"
            className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 disabled:opacity-40">
            <Icon name="attach_file" className="w-5 h-5" />
          </button>
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
          onPaste={(e) => {
            const f = e.clipboardData.files?.[0];
            if (f) { e.preventDefault(); pickFile(f); }
          }}
          rows={1}
          disabled={disabled || (!!attachment && (attachment.kind === "audio" || sending))}
          maxLength={attachment ? 1024 : undefined}
          placeholder={attachment ? (attachment.kind === "audio" ? "Audio is sent without a caption" : "Add a caption…") : meta?.quickReplies.length ? "Type a message… (/ for quick replies)" : "Type a message…"}
          className="flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm leading-snug focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500 max-h-40"
        />
        <button onClick={send} disabled={(!text.trim() && !attachment) || sending || disabled} aria-label={attachment ? "Send file" : "Send message"}
          className="w-11 h-11 shrink-0 flex items-center justify-center rounded-full bg-[#25D366] text-white shadow-md shadow-green-500/30 hover:bg-[#1fb857] disabled:opacity-40 disabled:shadow-none transition">
          {sending && attachment
            ? <span className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
            : <Icon name="send" filled className="w-5 h-5" />}
        </button>
      </div>
      <p className="hidden sm:block mt-1 px-1 text-[10px] text-slate-400">Enter to send · Shift + Enter for a new line · Files up to 4 MB</p>
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
