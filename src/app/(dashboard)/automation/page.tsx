"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";
import { cn, timeAgo } from "@/lib/utils";
import {
  AUTOMATION_EVENTS, CONDITION_META, ACTION_META, EVENT_META, RECIPES, SUPPORTED_EVENTS,
  describeAction, describeCondition, parseActions, parseConditions,
  type AutomationEvent, type Recipe,
} from "@/components/automation/schema";
import { AutomationBuilder, Toggle, memberName, withDefaultAgents, type BuilderInitial, type Member } from "@/components/automation/automation-builder";

interface AutomationRow {
  id: string; name: string; isActive: boolean; triggerEvent: AutomationEvent;
  conditions: unknown; actions: unknown; runCount: number; createdAt: string; updatedAt: string;
}
interface ListData {
  automations: AutomationRow[];
  meta: { canManage: boolean; timezone: string; supportedEvents: AutomationEvent[]; members: Member[]; tags: string[] };
}

const err = (e: unknown, f = "Something went wrong") => (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? f;
const fmt = (n: number) => n.toLocaleString("en-IN");
const KEY = ["automations"];

export default function AutomationPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"ALL" | "ACTIVE" | "PAUSED">("ALL");
  const [trigger, setTrigger] = useState<"ALL" | AutomationEvent>("ALL");
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<BuilderInitial | "new" | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: KEY,
    queryFn: () => axios.get("/api/automations").then((r) => r.data as ListData),
    refetchInterval: 60000,
  });
  const all = useMemo(() => data?.automations ?? [], [data]);
  const meta = data?.meta;
  const canManage = !!meta?.canManage;
  const members = meta?.members ?? [];
  const nameOf = (id: string) => memberName(members.find((m) => m.id === id));
  const refresh = () => qc.invalidateQueries({ queryKey: KEY });

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((a) =>
      (filter === "ALL" || (filter === "ACTIVE" ? a.isActive : !a.isActive)) &&
      (trigger === "ALL" || a.triggerEvent === trigger) &&
      (!q || a.name.toLowerCase().includes(q) || EVENT_META[a.triggerEvent]?.label.toLowerCase().includes(q)));
  }, [all, filter, trigger, search]);

  const stats = [
    { label: "Automations", value: fmt(all.length), icon: "bolt", color: "#25D366", sub: `${fmt(all.filter((a) => a.isActive).length)} active` },
    { label: "Active", value: fmt(all.filter((a) => a.isActive).length), icon: "power_settings_new", color: "#0ea5e9", sub: `${fmt(all.filter((a) => !a.isActive).length)} paused` },
    { label: "Total runs", value: fmt(all.reduce((s, a) => s + a.runCount, 0)), icon: "monitoring", color: "#8b5cf6", sub: "Across all automations" },
    { label: "Most used", value: fmt(Math.max(0, ...all.map((a) => a.runCount))), icon: "trending_up", color: "#f59e0b", sub: [...all].sort((a, b) => b.runCount - a.runCount)[0]?.name ?? "No runs yet" },
  ];

  const toggle = async (a: AutomationRow) => {
    qc.setQueryData<ListData>(KEY, (d) => d && { ...d, automations: d.automations.map((x) => (x.id === a.id ? { ...x, isActive: !a.isActive } : x)) });
    try {
      await axios.patch(`/api/automations/${a.id}`, { isActive: !a.isActive });
      toast.success(a.isActive ? `"${a.name}" paused` : `"${a.name}" is active`);
    } catch (e) { toast.error(err(e)); }
    finally { refresh(); }
  };

  const duplicate = async (a: AutomationRow) => {
    try {
      await axios.post("/api/automations", {
        name: `${a.name.slice(0, 72)} (copy)`, isActive: false, triggerEvent: a.triggerEvent,
        conditions: parseConditions(a.conditions), actions: parseActions(a.actions),
      });
      toast.success("Duplicated. The copy is paused until you turn it on.");
      refresh();
    } catch (e) { toast.error(err(e, "Couldn't duplicate")); }
  };

  const remove = async (a: AutomationRow) => {
    if (!confirm(`Delete "${a.name}"? This can't be undone.`)) return;
    try {
      await axios.delete(`/api/automations/${a.id}`);
      toast.success("Automation deleted");
      refresh();
    } catch (e) { toast.error(err(e)); }
  };

  const edit = (a: AutomationRow) => setEditor({
    id: a.id, name: a.name, isActive: a.isActive, triggerEvent: a.triggerEvent,
    conditions: parseConditions(a.conditions), actions: parseActions(a.actions),
  });

  const applyRecipe = (r: Recipe) => setEditor({
    name: r.name, isActive: true, triggerEvent: r.triggerEvent, conditions: r.conditions, actions: withDefaultAgents(r.actions, members),
  });

  const filtered = filter !== "ALL" || trigger !== "ALL" || !!search.trim();

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-8 space-y-5 max-w-7xl mx-auto w-full">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Automation</h1>
          <p className="text-sm text-slate-500 mt-0.5">Auto-reply, assign and tag conversations the moment customers message you.</p>
        </div>
        {canManage && (
          <button onClick={() => setEditor("new")} className="self-start inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-green-500/25 hover:bg-[#1fb857]">
            <Icon name="add" className="w-4 h-4" /> New automation
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm min-w-0">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${s.color}14`, color: s.color }}><Icon name={s.icon} className="w-4 h-4" /></span>
              <p className="text-xs font-medium text-slate-500">{s.label}</p>
            </div>
            <p className="mt-3 text-2xl font-bold text-slate-900 tabular-nums">{isLoading ? "–" : s.value}</p>
            <p className="text-[11px] text-slate-400 truncate">{s.sub}</p>
          </div>
        ))}
      </div>

      {!canManage && data && (
        <p className="flex items-center gap-2 rounded-2xl border border-slate-200/70 bg-white px-4 py-3 text-xs text-slate-600">
          <Icon name="lock" className="w-4 h-4 text-slate-400" /> You can view automations. Only admins and automation managers can change them.
        </p>
      )}

      {all.length > 0 && (
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <div className="flex gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto no-scrollbar self-start">
              {(["ALL", "ACTIVE", "PAUSED"] as const).map((s) => (
                <button key={s} onClick={() => setFilter(s)}
                  className={cn("px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap", filter === s ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800")}>
                  {s === "ALL" ? `All (${all.length})` : s === "ACTIVE" ? "Active" : "Paused"}
                </button>
              ))}
            </div>
            <select value={trigger} onChange={(e) => setTrigger(e.target.value as typeof trigger)} aria-label="Filter by trigger"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500">
              <option value="ALL">All triggers</option>
              {AUTOMATION_EVENTS.filter((e) => SUPPORTED_EVENTS.includes(e) || all.some((a) => a.triggerEvent === e)).map((e) => <option key={e} value={e}>{EVENT_META[e].label}</option>)}
            </select>
          </div>
          <div className="relative lg:w-72">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search automations…"
              className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500" />
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-52 rounded-2xl bg-white border border-slate-200 animate-pulse" />)}</div>
      ) : isError ? (
        <div className="rounded-2xl border border-red-100 bg-white py-12 text-center">
          <Icon name="error" className="w-7 h-7 text-red-500" />
          <p className="mt-2 text-sm font-semibold text-slate-800">Couldn&apos;t load automations</p>
          <button onClick={() => refetch()} className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"><Icon name="refresh" className="w-4 h-4" /> Try again</button>
        </div>
      ) : all.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 sm:p-10">
          <div className="text-center">
            <span className="mx-auto w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center"><Icon name="bolt" className="w-7 h-7 text-green-600" /></span>
            <p className="mt-3 text-sm font-semibold text-slate-800">No automations yet</p>
            <p className="text-xs text-slate-500 mt-1">Start with a ready-made recipe or build your own rule.</p>
          </div>
          <RecipeGrid onPick={canManage ? applyRecipe : undefined} />
          {canManage && (
            <div className="mt-5 text-center">
              <button onClick={() => setEditor("new")} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <Icon name="add" className="w-4 h-4" /> Build from scratch
              </button>
            </div>
          )}
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-14 text-center">
          <Icon name="search" className="w-7 h-7 text-slate-300" />
          <p className="mt-2 text-sm font-semibold text-slate-800">No automations match</p>
          {filtered && <button onClick={() => { setFilter("ALL"); setTrigger("ALL"); setSearch(""); }} className="mt-2 text-xs font-semibold text-green-600 hover:underline">Clear filters</button>}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((a) => {
            const ev = EVENT_META[a.triggerEvent] ?? EVENT_META.MESSAGE_RECEIVED;
            const conditions = parseConditions(a.conditions);
            const actions = parseActions(a.actions);
            const supported = SUPPORTED_EVENTS.includes(a.triggerEvent);
            return (
              <article key={a.id} className={cn("rounded-2xl border border-slate-200/70 bg-white p-4 sm:p-5 shadow-sm flex flex-col gap-3 transition", !a.isActive && "opacity-75")}>
                <div className="flex items-start gap-3">
                  <span className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", a.isActive ? "bg-green-50 text-green-600" : "bg-slate-100 text-slate-400")}>
                    <Icon name={ev.icon} className="w-5 h-5" />
                  </span>
                  <button onClick={() => canManage && edit(a)} className={cn("min-w-0 flex-1 text-left", !canManage && "cursor-default")}>
                    <p className="text-sm font-bold text-slate-900 truncate hover:text-green-700">{a.name}</p>
                    <p className="text-[11px] text-slate-500">{a.isActive ? "Active" : "Paused"} · {ev.label}</p>
                  </button>
                  <Toggle on={a.isActive} onChange={() => toggle(a)} label={a.isActive ? "Pause automation" : "Activate automation"} disabled={!canManage} />
                </div>

                <div className="rounded-xl bg-slate-50 p-3 space-y-2 text-xs text-slate-700">
                  <Flow tag="When" cls="bg-green-100 text-green-800">{ev.when}</Flow>
                  {conditions.length > 0 && (
                    <Flow tag="If" cls="bg-amber-100 text-amber-800">
                      <ul className="space-y-1">
                        {conditions.map((c, i) => <li key={i} className="flex gap-1.5"><Icon name={CONDITION_META[c.type].icon} className="w-3.5 h-3.5 text-slate-400 mt-px shrink-0" />{describeCondition(c)}</li>)}
                      </ul>
                    </Flow>
                  )}
                  <Flow tag="Then" cls="bg-sky-100 text-sky-800">
                    {actions.length ? (
                      <ul className="space-y-1">
                        {actions.map((x, i) => <li key={i} className="flex gap-1.5 min-w-0"><Icon name={ACTION_META[x.type].icon} className="w-3.5 h-3.5 text-slate-400 mt-px shrink-0" /><span className="break-words min-w-0">{describeAction(x, nameOf)}</span></li>)}
                      </ul>
                    ) : <span className="text-red-600">No valid actions. Edit to fix.</span>}
                  </Flow>
                </div>

                {!supported && (
                  <p className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-800">
                    <Icon name="warning" className="w-3.5 h-3.5" /> This trigger doesn&apos;t run yet. Edit it to use a supported trigger.
                  </p>
                )}

                <div className="flex items-center gap-3 text-[11px] text-slate-500">
                  <span className="inline-flex items-center gap-1"><Icon name="bolt" className="w-3.5 h-3.5" /><b className="text-slate-700 tabular-nums">{fmt(a.runCount)}</b> run{a.runCount === 1 ? "" : "s"}</span>
                  <span className="inline-flex items-center gap-1"><Icon name="history" className="w-3.5 h-3.5" />Updated {timeAgo(a.updatedAt)}</span>
                </div>

                {canManage && (
                  <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-100">
                    <ActionBtn icon="edit" onClick={() => edit(a)}>Edit</ActionBtn>
                    <ActionBtn icon="content_copy" onClick={() => duplicate(a)}>Duplicate</ActionBtn>
                    <ActionBtn icon="delete" danger onClick={() => remove(a)}>Delete</ActionBtn>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {all.length > 0 && canManage && (
        <details className="group rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-slate-800">
            <Icon name="rocket_launch" className="w-4 h-4 text-green-600" /> Recipes
            <span className="text-xs font-normal text-slate-500">Ready-made automations you can customise</span>
            <Icon name="expand_more" className="ml-auto w-4 h-4 text-slate-400 transition group-open:rotate-180" />
          </summary>
          <RecipeGrid onPick={applyRecipe} />
        </details>
      )}

      {editor && meta && (
        <AutomationBuilder
          initial={editor === "new" ? null : editor}
          meta={{ timezone: meta.timezone, members: meta.members, tags: meta.tags }}
          onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); refresh(); }}
        />
      )}
    </div>
  );
}

function Flow({ tag, cls, children }: { tag: string; cls: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className={cn("h-fit w-11 shrink-0 rounded-md py-0.5 text-center text-[10px] font-bold uppercase", cls)}>{tag}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function RecipeGrid({ onPick }: { onPick?: (r: Recipe) => void }) {
  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {RECIPES.map((r) => (
        <button key={r.key} type="button" disabled={!onPick} onClick={() => onPick?.(r)}
          className="group/r text-left rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm transition hover:border-green-300 hover:shadow disabled:cursor-default disabled:hover:border-slate-200/70">
          <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${r.color}14`, color: r.color }}><Icon name={r.icon} className="w-5 h-5" /></span>
          <p className="mt-2.5 text-sm font-bold text-slate-900">{r.name}</p>
          <p className="mt-0.5 text-xs text-slate-500">{r.blurb}</p>
          <p className="mt-2 text-[11px] text-slate-400">When {EVENT_META[r.triggerEvent].when}</p>
          {onPick && <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-green-600 group-hover/r:underline">Use recipe <Icon name="arrow_forward" className="w-3.5 h-3.5" /></span>}
        </button>
      ))}
    </div>
  );
}

function ActionBtn({ icon, children, onClick, danger }: { icon: string; children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={cn("inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition",
      danger ? "border border-red-100 text-red-500 hover:bg-red-50" : "border border-slate-200 text-slate-600 hover:bg-slate-50")}>
      <Icon name={icon} className="w-3.5 h-3.5" /> {children}
    </button>
  );
}
