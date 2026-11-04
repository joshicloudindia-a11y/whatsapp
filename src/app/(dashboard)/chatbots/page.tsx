"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";
import { cn, timeAgo } from "@/lib/utils";
import ChatbotSettingsModal, { type BotSettings } from "@/components/chatbot/chatbot-settings-modal";
import { STARTER_TEMPLATES, TRIGGER_META, parseKeywords, type StarterTemplate, type TriggerType } from "@/components/chatbot/flow";

const ChatbotBuilder = dynamic(() => import("@/components/chatbot/chatbot-builder"), {
  ssr: false,
  loading: () => <div className="h-full grid place-items-center"><Icon name="refresh" className="w-6 h-6 text-slate-400 animate-spin" /></div>,
});

interface Bot {
  id: string; name: string; description: string | null; isActive: boolean;
  triggerType: TriggerType; triggerValue: string | null; createdAt: string; updatedAt: string; nodeCount: number;
  stats: { sessions: number; active: number; last7d: number; lastTriggeredAt: string | null };
}
interface ListData { chatbots: Bot[]; canManage: boolean }

const err = (e: unknown, f = "Something went wrong") => (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? f;
const fmt = (n: number) => n.toLocaleString("en-IN");

export default function ChatbotsPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState<{ template?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");

  const { data, isLoading } = useQuery({
    queryKey: ["chatbots"],
    queryFn: () => axios.get("/api/chatbots").then((r) => r.data as ListData),
    enabled: !editing,
  });
  const bots = useMemo(() => data?.chatbots ?? [], [data]);
  const canManage = !!data?.canManage;
  const refresh = () => qc.invalidateQueries({ queryKey: ["chatbots"] });

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bots.filter((b) =>
      (filter === "all" || (filter === "active") === b.isActive) &&
      (!q || b.name.toLowerCase().includes(q) || (b.description ?? "").toLowerCase().includes(q) || (b.triggerValue ?? "").toLowerCase().includes(q)));
  }, [bots, search, filter]);

  // Keywords claimed by more than one live bot (only the most recently edited one will answer).
  const keywordClash = useMemo(() => {
    const seen = new Map<string, number>();
    for (const b of bots) if (b.isActive && b.triggerType === "KEYWORD") for (const k of parseKeywords(b.triggerValue)) seen.set(k, (seen.get(k) ?? 0) + 1);
    return new Set([...seen].filter(([, n]) => n > 1).map(([k]) => k));
  }, [bots]);

  const totals = useMemo(() => ({
    live: bots.filter((b) => b.isActive).length,
    sessions: bots.reduce((s, b) => s + b.stats.sessions, 0),
    last7d: bots.reduce((s, b) => s + b.stats.last7d, 0),
    inFlow: bots.reduce((s, b) => s + b.stats.active, 0),
  }), [bots]);

  const create = async (v: BotSettings, tpl: StarterTemplate | null) => {
    setSaving(true);
    try {
      const flow = tpl ? tpl.build() : { nodes: [], edges: [] };
      const r = await axios.post("/api/chatbots", { ...v, ...flow });
      toast.success(tpl ? `Created from “${tpl.name}” — review and activate when ready` : "Chatbot created");
      setCreating(null);
      refresh();
      setEditing(r.data.chatbot.id);
    } catch (e) { toast.error(err(e)); }
    finally { setSaving(false); }
  };

  const toggle = async (b: Bot) => {
    setBusy(b.id);
    try {
      await axios.patch(`/api/chatbots/${b.id}`, { isActive: !b.isActive });
      toast.success(b.isActive ? "Chatbot paused" : "Chatbot is live");
      refresh();
    } catch (e) {
      toast.error(err(e), { action: { label: "Open builder", onClick: () => setEditing(b.id) } });
    } finally { setBusy(null); }
  };

  const duplicate = async (b: Bot) => {
    setBusy(b.id);
    try { await axios.post("/api/chatbots", { duplicateOf: b.id }); toast.success("Chatbot duplicated (inactive)"); refresh(); }
    catch (e) { toast.error(err(e)); }
    finally { setBusy(null); }
  };

  const remove = async (b: Bot) => {
    if (!confirm(`Delete "${b.name}"? Its sessions are deleted too. This can't be undone.`)) return;
    setBusy(b.id);
    try { await axios.delete(`/api/chatbots/${b.id}`); toast.success("Chatbot deleted"); refresh(); }
    catch (e) { toast.error(err(e)); }
    finally { setBusy(null); }
  };

  if (editing) {
    return <ChatbotBuilder chatbotId={editing} onBack={() => { setEditing(null); refresh(); }} />;
  }

  const stats = [
    { label: "Live bots", value: `${totals.live}/${bots.length}`, icon: "smart_toy", color: "#25D366", sub: "active right now" },
    { label: "Conversations handled", value: fmt(totals.sessions), icon: "forum", color: "#0ea5e9", sub: "all-time bot sessions" },
    { label: "Last 7 days", value: fmt(totals.last7d), icon: "trending_up", color: "#8b5cf6", sub: "sessions started" },
    { label: "In a flow now", value: fmt(totals.inFlow), icon: "hourglass_top", color: "#f59e0b", sub: "waiting for a reply" },
  ];

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-8 space-y-5 max-w-7xl mx-auto w-full">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Chatbots</h1>
          <p className="text-sm text-slate-500 mt-0.5">Answer customers instantly with automated WhatsApp flows.</p>
        </div>
        {canManage && (
          <button onClick={() => setCreating({})} className="self-start inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-green-500/25 hover:bg-[#1fb857]">
            <Icon name="add" className="w-4 h-4" /> New chatbot
          </button>
        )}
      </div>

      {bots.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${s.color}14`, color: s.color }}><Icon name={s.icon} className="w-4 h-4" /></span>
                <p className="text-xs font-medium text-slate-500">{s.label}</p>
              </div>
              <p className="mt-3 text-2xl font-bold text-slate-900 tabular-nums">{s.value}</p>
              <p className="text-[11px] text-slate-400">{s.sub}</p>
            </div>
          ))}
        </div>
      )}

      {bots.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div className="flex gap-1 p-1 bg-slate-100 rounded-xl self-start">
            {(["all", "active", "inactive"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={cn("px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap capitalize", filter === f ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800")}>
                {f === "all" ? `All (${bots.length})` : f === "active" ? `Live (${totals.live})` : `Off (${bots.length - totals.live})`}
              </button>
            ))}
          </div>
          <div className="relative sm:w-64">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search chatbots or keywords…"
              className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500" />
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-52 rounded-2xl bg-white border border-slate-200 animate-pulse" />)}</div>
      ) : bots.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-12 px-5 sm:px-8 text-center">
          <span className="mx-auto w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center"><Icon name="smart_toy" className="w-7 h-7 text-green-600" /></span>
          <p className="mt-3 text-sm font-semibold text-slate-800">No chatbots yet</p>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">Greet new customers, answer FAQs and collect leads 24/7. Start from a template — you can edit every step before it goes live.</p>
          {canManage ? (
            <>
              <div className="mt-6 grid gap-3 sm:grid-cols-3 max-w-3xl mx-auto text-left">
                {STARTER_TEMPLATES.map((t) => (
                  <button key={t.id} onClick={() => setCreating({ template: t.id })} className="group rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm hover:border-green-400 hover:shadow-md transition">
                    <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${t.color}18`, color: t.color }}><Icon name={t.icon} className="w-4 h-4" /></span>
                    <p className="mt-3 text-sm font-bold text-slate-900 group-hover:text-green-700">{t.name}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{t.description}</p>
                    <p className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500"><Icon name={TRIGGER_META[t.triggerType].icon} className="w-3 h-3" />{TRIGGER_META[t.triggerType].label}</p>
                  </button>
                ))}
              </div>
              <button onClick={() => setCreating({})} className="mt-4 text-xs font-semibold text-green-700 hover:underline">or start from scratch</button>
            </>
          ) : <p className="mt-4 text-xs text-slate-500">Ask an admin or automation manager to create one.</p>}
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-12 text-center">
          <Icon name="search" className="w-7 h-7 text-slate-300 mx-auto" />
          <p className="mt-2 text-sm font-semibold text-slate-700">No chatbots match</p>
          <button onClick={() => { setSearch(""); setFilter("all"); }} className="mt-2 text-xs font-semibold text-green-700 hover:underline">Clear filters</button>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((b) => {
            const kws = parseKeywords(b.triggerValue);
            const clash = b.isActive && b.triggerType === "KEYWORD" && kws.some((k) => keywordClash.has(k));
            return (
              <article key={b.id} className={cn("rounded-2xl border bg-white p-4 sm:p-5 shadow-sm flex flex-col gap-3", b.isActive ? "border-green-200" : "border-slate-200/70", busy === b.id && "opacity-60")}>
                <div className="flex items-start gap-3">
                  <span className={cn("w-10 h-10 shrink-0 rounded-xl flex items-center justify-center", b.isActive ? "bg-[#25D366] text-white" : "bg-slate-100 text-slate-400")}><Icon name="smart_toy" className="w-5 h-5" /></span>
                  <button onClick={() => setEditing(b.id)} className="min-w-0 flex-1 text-left">
                    <p className="text-sm font-bold text-slate-900 truncate hover:text-green-700">{b.name}</p>
                    <p className="text-[11px] text-slate-500 line-clamp-2">{b.description || `${b.nodeCount} step${b.nodeCount === 1 ? "" : "s"}`}</p>
                  </button>
                  {canManage ? (
                    <button onClick={() => toggle(b)} disabled={busy === b.id} role="switch" aria-checked={b.isActive} aria-label={b.isActive ? "Deactivate" : "Activate"} title={b.isActive ? "Live — click to pause" : "Off — click to activate"}
                      className={cn("relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors", b.isActive ? "bg-[#25D366]" : "bg-slate-300")}>
                      <span className={cn("absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform", b.isActive && "translate-x-5")} />
                    </button>
                  ) : (
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", b.isActive ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500")}>{b.isActive ? "Live" : "Off"}</span>
                  )}
                </div>

                <div className="rounded-xl bg-slate-50 px-3 py-2">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600"><Icon name={TRIGGER_META[b.triggerType]?.icon ?? "bolt"} className="w-3.5 h-3.5" />{TRIGGER_META[b.triggerType]?.label ?? b.triggerType}</p>
                  {kws.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {kws.slice(0, 6).map((k) => <span key={k} className={cn("rounded-md border px-1.5 py-px text-[10px] font-medium", keywordClash.has(k) && b.isActive ? "border-amber-200 bg-amber-50 text-amber-700" : "border-slate-200 bg-white text-slate-600")}>{k}</span>)}
                      {kws.length > 6 && <span className="text-[10px] text-slate-400">+{kws.length - 6}</span>}
                    </div>
                  ) : b.triggerType === "KEYWORD" ? (
                    <p className="mt-1 text-[10px] text-amber-600">No keywords set</p>
                  ) : <p className="mt-0.5 text-[10px] text-slate-500">{TRIGGER_META[b.triggerType]?.hint}</p>}
                  {clash && <p className="mt-1.5 flex items-center gap-1 text-[10px] text-amber-700"><Icon name="warning" className="w-3 h-3" /> Another live bot uses the same keyword.</p>}
                </div>

                <dl className="grid grid-cols-3 gap-2 text-center">
                  {([["Sessions", b.stats.sessions], ["Last 7d", b.stats.last7d], ["In flow", b.stats.active]] as const).map(([k, v]) => (
                    <div key={k} className="rounded-lg bg-slate-50 py-1.5"><dd className="text-sm font-bold text-slate-900 tabular-nums">{fmt(v)}</dd><dt className="text-[10px] text-slate-500">{k}</dt></div>
                  ))}
                </dl>

                <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  <Icon name="schedule" className="w-3.5 h-3.5" />
                  {b.stats.lastTriggeredAt ? `Last triggered ${timeAgo(b.stats.lastTriggeredAt)}` : `Edited ${timeAgo(b.updatedAt)}`}
                  <span className="ml-auto">{b.nodeCount} step{b.nodeCount === 1 ? "" : "s"}</span>
                </p>

                <div className="mt-auto flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                  <ActionBtn icon={canManage ? "edit" : "visibility"} primary onClick={() => setEditing(b.id)}>{canManage ? "Edit flow" : "View flow"}</ActionBtn>
                  {canManage && <ActionBtn icon="content_copy" onClick={() => duplicate(b)} disabled={busy === b.id}>Duplicate</ActionBtn>}
                  {canManage && <ActionBtn icon="delete" danger onClick={() => remove(b)} disabled={busy === b.id}>Delete</ActionBtn>}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {creating && (
        <ChatbotSettingsModal mode="create" initialTemplate={creating.template} saving={saving} onClose={() => setCreating(null)} onSubmit={create} />
      )}
    </div>
  );
}

function ActionBtn({ icon, children, onClick, primary, danger, disabled }: { icon: string; children: React.ReactNode; onClick: () => void; primary?: boolean; danger?: boolean; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className={cn("inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-50",
      primary ? "bg-[#25D366] text-white hover:bg-[#1fb857]" : danger ? "border border-red-100 text-red-500 hover:bg-red-50" : "border border-slate-200 text-slate-600 hover:bg-slate-50")}>
      <Icon name={icon} className="w-3.5 h-3.5" /> {children}
    </button>
  );
}
