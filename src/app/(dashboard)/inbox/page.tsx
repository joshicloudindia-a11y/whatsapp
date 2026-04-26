"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useSession } from "next-auth/react";
import { pusherClient, PUSHER_EVENTS, orgChannel, conversationChannel } from "@/lib/pusher";
import { cn, timeAgo, getInitials } from "@/lib/utils";
import { toast } from "sonner";

type Filter = "all" | "me" | "unassigned";
type Status = "OPEN" | "RESOLVED" | "PENDING";

export default function InboxPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [status, setStatus] = useState<Status>("OPEN");
  const [search, setSearch] = useState("");

  // Live updates via Pusher
  useEffect(() => {
    if (!session?.user?.organizationId) return;
    const channel = pusherClient.subscribe(orgChannel(session.user.organizationId));
    channel.bind(PUSHER_EVENTS.NEW_CONVERSATION, () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    });
    channel.bind(PUSHER_EVENTS.CONVERSATION_UPDATED, () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    });
    return () => {
      pusherClient.unsubscribe(orgChannel(session.user.organizationId));
    };
  }, [session?.user?.organizationId, queryClient]);

  const { data, isLoading } = useQuery({
    queryKey: ["conversations", status, filter, search],
    queryFn: () =>
      axios
        .get(`/api/conversations?status=${status}&assignedTo=${filter === "all" ? "" : filter}&search=${search}`)
        .then((r) => r.data),
  });

  const conversations = data?.conversations ?? [];

  return (
    <div className="flex h-full">
      {/* Conversation List */}
      <div className="w-80 border-r flex flex-col bg-white shrink-0" style={{ borderColor: "#e2e8f0" }}>
        {/* Filters */}
        <div className="p-3 border-b space-y-2" style={{ borderColor: "#e2e8f0" }}>
          <input
            type="text"
            placeholder="Search conversations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <div className="flex gap-1">
            {(["all", "me", "unassigned"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "flex-1 text-xs py-1.5 rounded-md font-medium transition-colors",
                  filter === f ? "bg-green-100 text-green-700" : "text-slate-500 hover:bg-slate-100"
                )}
              >
                {f === "all" ? "All" : f === "me" ? "Mine" : "Unassigned"}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {(["OPEN", "PENDING", "RESOLVED"] as Status[]).map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={cn(
                  "flex-1 text-xs py-1.5 rounded-md font-medium transition-colors",
                  status === s ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"
                )}
              >
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 text-sm text-slate-400 text-center">Loading...</div>
          ) : conversations.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-sm">No conversations</div>
          ) : (
            conversations.map((conv: any) => (
              <ConversationItem
                key={conv.id}
                conv={conv}
                active={selectedId === conv.id}
                onClick={() => setSelectedId(conv.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedId ? (
          <ChatArea conversationId={selectedId} key={selectedId} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <InboxEmptyIcon />
            <p className="mt-3 text-sm font-medium">Select a conversation to start</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Conversation List Item ───────────────────────────────────────────────────

function ConversationItem({ conv, active, onClick }: { conv: any; active: boolean; onClick: () => void }) {
  const lastMsg = conv.messages?.[0];
  const name = conv.contact?.name || conv.contact?.phone;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left flex items-start gap-3 px-4 py-3 border-b transition-colors",
        active ? "bg-green-50" : "hover:bg-slate-50",
        !conv.isRead && !active && "border-l-2 border-l-green-500"
      )}
      style={{ borderBottomColor: "#f1f5f9" }}
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
        style={{ background: "#25D366" }}
      >
        {getInitials(name)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-900 truncate">{name}</span>
          <span className="text-xs text-slate-400 shrink-0 ml-2">
            {conv.lastMessageAt ? timeAgo(conv.lastMessageAt) : ""}
          </span>
        </div>
        <p className="text-xs text-slate-500 truncate mt-0.5">
          {lastMsg?.direction === "OUTBOUND" && "You: "}
          {lastMsg?.content || (lastMsg?.type !== "TEXT" ? `[${lastMsg?.type}]` : "No messages")}
        </p>
        {conv.labels?.length > 0 && (
          <div className="flex gap-1 mt-1">
            {conv.labels.slice(0, 2).map((l: any) => (
              <span
                key={l.id}
                className="text-xs px-1.5 py-0.5 rounded-full"
                style={{ background: l.label.color + "20", color: l.label.color }}
              >
                {l.label.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}

// ─── Chat Area ────────────────────────────────────────────────────────────────

function ChatArea({ conversationId }: { conversationId: string }) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const { data: msgData } = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: () => axios.get(`/api/conversations/${conversationId}/messages`).then((r) => r.data),
  });

  const { data: convData } = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: () =>
      axios.get(`/api/conversations?status=OPEN&page=1&limit=100`).then((r) => {
        return { conversation: r.data.conversations.find((c: any) => c.id === conversationId) };
      }),
  });

  const messages = msgData?.messages ?? [];
  const conv = convData?.conversation;

  // Subscribe to real-time messages
  useEffect(() => {
    const channel = pusherClient.subscribe(conversationChannel(conversationId));
    channel.bind(PUSHER_EVENTS.NEW_MESSAGE, (data: any) => {
      queryClient.setQueryData(["messages", conversationId], (old: any) => ({
        ...old,
        messages: [...(old?.messages ?? []), data.message],
      }));
    });
    channel.bind(PUSHER_EVENTS.MESSAGE_STATUS_UPDATE, (data: any) => {
      queryClient.setQueryData(["messages", conversationId], (old: any) => ({
        ...old,
        messages: old?.messages?.map((m: any) =>
          m.wamid === data.wamid ? { ...m, status: data.status } : m
        ),
      }));
    });
    return () => pusherClient.unsubscribe(conversationChannel(conversationId));
  }, [conversationId, queryClient]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const sendMessage = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await axios.post(`/api/conversations/${conversationId}/messages`, { type: "text", content: text.trim() });
      setText("");
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? "Failed to send");
    } finally {
      setSending(false);
    }
  };

  const resolveConversation = async () => {
    await axios.post(`/api/conversations/${conversationId}/resolve`, { status: "RESOLVED" });
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
    toast.success("Conversation resolved");
  };

  const contactName = conv?.contact?.name || conv?.contact?.phone || "Unknown";

  return (
    <>
      {/* Header */}
      <div className="h-16 flex items-center justify-between px-5 border-b bg-white shrink-0" style={{ borderColor: "#e2e8f0" }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ background: "#25D366" }}>
            {getInitials(contactName)}
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">{contactName}</p>
            <p className="text-xs text-slate-400">{conv?.contact?.phone}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={resolveConversation}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium"
          >
            Resolve
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2" style={{ background: "#f0f2f5" }}>
        {messages.map((msg: any) => (
          <MessageBubble key={msg.id} msg={msg} isOwn={msg.direction === "OUTBOUND"} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t bg-white p-3" style={{ borderColor: "#e2e8f0" }}>
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Type a message... (Enter to send)"
            rows={2}
            className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <button
            onClick={sendMessage}
            disabled={sending || !text.trim()}
            className="px-4 py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-50 transition-opacity"
            style={{ background: "#25D366" }}
          >
            {sending ? "..." : "Send"}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg, isOwn }: { msg: any; isOwn: boolean }) {
  return (
    <div className={cn("flex", isOwn ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-xs lg:max-w-md px-3 py-2 rounded-2xl text-sm shadow-sm",
          isOwn ? "bubble-outbound rounded-br-sm" : "bubble-inbound rounded-bl-sm"
        )}
      >
        {msg.type === "TEXT" || !msg.type ? (
          <p className="whitespace-pre-wrap text-slate-900">{msg.content}</p>
        ) : (
          <p className="text-slate-500 italic">[{msg.type.toLowerCase()}]</p>
        )}
        <div className={cn("flex items-center gap-1 mt-1", isOwn ? "justify-end" : "justify-start")}>
          <span className="text-[10px] text-slate-400">{timeAgo(msg.createdAt)}</span>
          {isOwn && <StatusTick status={msg.status} />}
        </div>
      </div>
    </div>
  );
}

function StatusTick({ status }: { status: string }) {
  if (status === "READ") return <span className="text-[10px] text-blue-500">✓✓</span>;
  if (status === "DELIVERED") return <span className="text-[10px] text-slate-400">✓✓</span>;
  if (status === "SENT") return <span className="text-[10px] text-slate-400">✓</span>;
  if (status === "FAILED") return <span className="text-[10px] text-red-500">✗</span>;
  return null;
}

function InboxEmptyIcon() {
  return (
    <svg className="w-16 h-16 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}
