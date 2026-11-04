"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import { Icon } from "@/components/ui/icon";
import { cn, getInitials, timeAgo } from "@/lib/utils";
import {
  Card, CardHeader, KpiCard, KpiSkeleton, BlockSkeleton, EmptyState, Segmented, TrendChip,
  fmtNum, fmtPct, fmtDuration, fmtDay,
} from "@/components/analytics/ui";
import { HourHeatmap } from "@/components/analytics/hour-heatmap";

// ─── Types ───────────────────────────────────────────────────────────────────

type Preset = "7d" | "30d" | "90d";
type Query = { preset: Preset } | { from: string; to: string };

interface Kpis {
  conversations: number; messagesIn: number; messagesOut: number; uniqueCustomers: number; newContacts: number;
  resolved: number; resolutionRate: number | null; medianFirstResponseSecs: number | null; avgFirstResponseSecs: number | null;
  responseRate: number | null; messageDeliveryRate: number | null; messageFailed: number;
  broadcasts: number; broadcastRecipients: number; broadcastSent: number; broadcastDelivered: number; broadcastRead: number;
  broadcastFailed: number; broadcastReplied: number; broadcastDeliveryRate: number | null; broadcastReadRate: number | null;
}
interface DailyPoint { date: string; inbound: number; outbound: number; conversations: number; newContacts: number }
interface Agent {
  id: string; name: string; email: string | null; avatar: string | null; replies: number; conversationsHandled: number;
  assigned: number; resolved: number; firstResponses: number; avgFirstResponseSecs: number | null;
}
interface TopContact { id: string; name: string | null; phone: string; stage: string | null; total: number; inbound: number; outbound: number; lastAt: string }
interface BroadcastRow {
  id: string; name: string; status: string; createdAt: string; startedAt: string | null; template: string | null;
  totalCount: number; sentCount: number; deliveredCount: number; readCount: number; failedCount: number; repliedCount: number;
  deliveryRate: number | null; readRate: number | null;
}
interface Insights {
  range: { preset: Preset | null; from: string; to: string; days: number; timezone: string; previous: { from: string; to: string } };
  kpis: Kpis; previous: Kpis; trends: Record<keyof Kpis, number | null>;
  firstResponse: { sampled: number; answered: number; capped: boolean; medianSecs: number | null; avgSecs: number | null; within5m: number | null; within1h: number | null };
  conversationsByStatus: Record<string, number>;
  daily: DailyPoint[];
  hourly: { hour: number; inbound: number }[];
  heatmap: number[][];
  agents: Agent[];
  automated: { replies: number; conversationsHandled: number } | null;
  topContacts: TopContact[];
  broadcasts: BroadcastRow[];
  generatedAt: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PRESETS: { value: Preset; label: string }[] = [
  { value: "7d", label: "7 days" }, { value: "30d", label: "30 days" }, { value: "90d", label: "90 days" },
];
const MAX_DAYS = 180;

const STATUS_COLORS: Record<string, string> = { OPEN: "#3b82f6", PENDING: "#f59e0b", RESOLVED: "#25D366", SNOOZED: "#94a3b8" };

const BROADCAST_STATUS: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600", SCHEDULED: "bg-violet-50 text-violet-700", RUNNING: "bg-blue-50 text-blue-700",
  PAUSED: "bg-amber-50 text-amber-700", COMPLETED: "bg-green-50 text-green-700", FAILED: "bg-red-50 text-red-600",
};

type SeriesKey = "messages" | "conversations" | "contacts";
const SERIES_OPTIONS: { value: SeriesKey; label: string }[] = [
  { value: "messages", label: "Messages" }, { value: "conversations", label: "Conversations" }, { value: "contacts", label: "Contacts" },
];

const tooltipStyle = { borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12, boxShadow: "0 4px 16px rgba(15,23,42,.08)" };
const axisTick = { fontSize: 11, fill: "#94a3b8" };

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const errorMessage = (e: unknown) =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Could not load analytics. Please try again.";

function toQueryString(q: Query) {
  return "preset" in q ? `range=${q.preset}` : `from=${q.from}&to=${q.to}`;
}

function downloadCsv(data: Insights) {
  const header = ["Date", "Messages received", "Messages sent", "Total messages", "Conversations started", "New contacts"];
  const rows = data.daily.map((d) => [d.date, d.inbound, d.outbound, d.inbound + d.outbound, d.conversations, d.newContacts]);
  const totals = data.daily.reduce(
    (a, d) => [a[0] + d.inbound, a[1] + d.outbound, a[2] + d.inbound + d.outbound, a[3] + d.conversations, a[4] + d.newContacts],
    [0, 0, 0, 0, 0],
  );
  const csv = [header, ...rows, ["Total", ...totals]].map((r) => r.join(",")).join("\n");
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `analytics-${data.range.from}_to_${data.range.to}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ─── Range picker ────────────────────────────────────────────────────────────

function RangePicker({ query, onChange, current }: { query: Query; onChange: (q: Query) => void; current?: Insights["range"] }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const isCustom = !("preset" in query);

  const span = from && to ? Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1 : 0;
  const invalid = !from || !to || from > to || span > MAX_DAYS;

  function toggleCustom() {
    if (!open) {
      setFrom(isCustom ? query.from : current?.from ?? "");
      setTo(isCustom ? query.to : current?.to ?? "");
    }
    setOpen((o) => !o);
  }

  return (
    <div className="relative flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 rounded-xl bg-white/10 p-1" role="tablist" aria-label="Date range">
        {PRESETS.map((p) => (
          <button key={p.value} type="button" role="tab" aria-selected={"preset" in query && query.preset === p.value}
            onClick={() => { setOpen(false); onChange({ preset: p.value }); }}
            className={cn("px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-colors",
              "preset" in query && query.preset === p.value ? "bg-white text-slate-900" : "text-slate-300 hover:text-white")}>
            {p.label}
          </button>
        ))}
        <button type="button" onClick={toggleCustom} aria-expanded={open}
          className={cn("inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-colors",
            isCustom ? "bg-white text-slate-900" : "text-slate-300 hover:text-white")}>
          <Icon name="tune" className="w-4 h-4" /> Custom
        </button>
      </div>

      {open && (
        <div className="absolute right-0 sm:right-auto sm:left-0 top-full mt-2 z-20 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-xl">
          <p className="text-sm font-bold">Custom range</p>
          <p className="text-xs text-slate-400 mt-0.5">Up to {MAX_DAYS} days, in your workspace timezone.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-[11px] font-semibold text-slate-500">From
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} max={to || undefined}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500/30" />
            </label>
            <label className="text-[11px] font-semibold text-slate-500">To
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} min={from || undefined}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500/30" />
            </label>
          </div>
          {from && to && from > to && <p className="mt-2 text-xs text-red-600">Start date must be before end date.</p>}
          {span > MAX_DAYS && <p className="mt-2 text-xs text-red-600">Please pick {MAX_DAYS} days or fewer ({span} selected).</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
            <button type="button" disabled={invalid}
              onClick={() => { onChange({ from, to }); setOpen(false); }}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-[#25D366] hover:bg-[#1fb857] disabled:opacity-40 disabled:cursor-not-allowed">
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sections ────────────────────────────────────────────────────────────────

function ActivityChart({ daily }: { daily: DailyPoint[] }) {
  const [series, setSeries] = useState<SeriesKey>("messages");
  const empty = daily.every((d) => d.inbound + d.outbound + d.conversations + d.newContacts === 0);
  const lines = series === "messages"
    ? [{ key: "inbound", name: "Received", color: "#3b82f6" }, { key: "outbound", name: "Sent", color: "#25D366" }]
    : series === "conversations"
      ? [{ key: "conversations", name: "Conversations started", color: "#8b5cf6" }]
      : [{ key: "newContacts", name: "New contacts", color: "#f59e0b" }];

  return (
    <Card className="lg:col-span-2 min-w-0">
      <CardHeader title="Activity over time" subtitle="Daily totals in your workspace timezone" icon="monitoring"
        action={<Segmented label="Series" value={series} options={SERIES_OPTIONS} onChange={setSeries} />} />
      {empty ? (
        <EmptyState icon="monitoring" title="No activity in this period" hint="Messages, conversations and new contacts will appear here." className="h-[268px]" />
      ) : (
        <div className="px-2 sm:px-4 pt-3 pb-2">
          <div className="flex flex-wrap items-center gap-4 px-2 pb-2 text-[11px] text-slate-500">
            {lines.map((l) => (
              <span key={l.key} className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: l.color }} /> {l.name}</span>
            ))}
          </div>
          <div className="h-[220px] sm:h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daily} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  {lines.map((l) => (
                    <linearGradient key={l.key} id={`ga-${l.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={l.color} stopOpacity={0.22} /><stop offset="95%" stopColor={l.color} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="date" tick={axisTick} tickLine={false} axisLine={false} minTickGap={24} tickFormatter={(d: string) => fmtDay(d)} />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} width={48} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ fontWeight: 600 }}
                  labelFormatter={(d) => fmtDay(String(d), { weekday: "short", day: "numeric", month: "short", year: "numeric" })} />
                {lines.map((l) => (
                  <Area key={l.key} type="monotone" dataKey={l.key} name={l.name} stroke={l.color} fill={`url(#ga-${l.key})`} strokeWidth={2} dot={false} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </Card>
  );
}

function StatusChart({ byStatus }: { byStatus: Record<string, number> }) {
  const data = Object.entries(byStatus).map(([name, value]) => ({ name, value })).filter((d) => d.value > 0);
  const total = data.reduce((a, b) => a + b.value, 0);
  return (
    <Card className="min-w-0">
      <CardHeader title="Conversations by status" subtitle="Conversations started in this period" icon="forum" />
      {total === 0 ? (
        <EmptyState icon="forum" title="No conversations started" className="h-[268px]" />
      ) : (
        <div className="p-4">
          <div className="relative h-[170px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} innerRadius={52} outerRadius={78} dataKey="value" nameKey="name" paddingAngle={3} stroke="none">
                  {data.map((d) => <Cell key={d.name} fill={STATUS_COLORS[d.name] ?? "#94a3b8"} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-xl font-bold text-slate-900 tabular-nums">{fmtNum(total)}</p>
              <p className="text-[10px] uppercase tracking-wider text-slate-400">started</p>
            </div>
          </div>
          <ul className="mt-3 space-y-1.5">
            {Object.entries(byStatus).map(([name, value]) => (
              <li key={name} className="flex items-center gap-2 text-xs">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: STATUS_COLORS[name] ?? "#94a3b8" }} />
                <span className="text-slate-600 flex-1">{titleCase(name)}</span>
                <span className="font-semibold text-slate-800 tabular-nums">{fmtNum(value)}</span>
                <span className="w-10 text-right text-slate-400 tabular-nums">{total ? Math.round((value / total) * 100) : 0}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function BusiestHours({ data }: { data: Insights }) {
  const [view, setView] = useState<"heatmap" | "hourly">("heatmap");
  const total = data.hourly.reduce((a, b) => a + b.inbound, 0);
  const peak = data.hourly.reduce((best, h) => (h.inbound > best.inbound ? h : best), data.hourly[0] ?? { hour: 0, inbound: 0 });
  const hourName = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? "am" : "pm"}`;

  return (
    <Card className="lg:col-span-2 min-w-0">
      <CardHeader title="Busiest hours" icon="schedule"
        subtitle={total ? `Inbound messages · peak ${hourName(peak.hour)}–${hourName((peak.hour + 1) % 24)} · ${data.range.timezone}` : `Inbound messages · ${data.range.timezone}`}
        action={<Segmented label="View" value={view} onChange={setView} options={[{ value: "heatmap", label: "Heatmap" }, { value: "hourly", label: "By hour" }]} />} />
      {total === 0 ? (
        <EmptyState icon="schedule" title="No inbound messages yet" hint="Once customers message you, you'll see when they're most active." />
      ) : view === "heatmap" ? (
        <div className="p-4 sm:p-5"><HourHeatmap data={data.heatmap} /></div>
      ) : (
        <div className="px-2 sm:px-4 pt-4 pb-2 h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.hourly} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="hour" tick={axisTick} tickLine={false} axisLine={false} interval={2} tickFormatter={(h: number) => hourName(h)} />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} width={48} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f8fafc" }} labelFormatter={(h) => `${hourName(Number(h))} – ${hourName((Number(h) + 1) % 24)}`} />
              <Bar dataKey="inbound" name="Inbound" radius={[4, 4, 0, 0]}>
                {data.hourly.map((h) => <Cell key={h.hour} fill={h.hour === peak.hour ? "#25D366" : "#86efac"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

function ResponseCard({ data }: { data: Insights }) {
  const fr = data.firstResponse;
  const rows = [
    { label: "Median first response", value: fmtDuration(fr.medianSecs), trend: data.trends.medianFirstResponseSecs, invert: true },
    { label: "Average first response", value: fmtDuration(fr.avgSecs), trend: data.trends.avgFirstResponseSecs, invert: true },
    { label: "Replied to", value: fmtPct(data.kpis.responseRate), trend: data.trends.responseRate, invert: false },
  ];
  return (
    <Card className="min-w-0">
      <CardHeader title="Response time" icon="timer"
        subtitle={fr.sampled ? `${fmtNum(fr.answered)} of ${fmtNum(fr.sampled)} conversations answered${fr.capped ? " (sampled)" : ""}` : "First reply after a customer writes"} />
      {fr.sampled === 0 ? (
        <EmptyState icon="timer" title="No customer messages" hint="Response times are measured from a customer's first message to your first reply." />
      ) : (
        <div className="p-4 sm:p-5 space-y-4">
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.label} className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-500">{r.label}</span>
                <span className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-900 tabular-nums">{r.value}</span>
                  <TrendChip value={r.trend} invert={r.invert} />
                </span>
              </li>
            ))}
          </ul>
          {[["Within 5 minutes", fr.within5m], ["Within 1 hour", fr.within1h]].map(([label, v]) => (
            <div key={label as string}>
              <div className="flex justify-between text-[11px] font-semibold text-slate-500 mb-1">
                <span>{label}</span><span className="tabular-nums text-slate-700">{fmtPct(v as number | null)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full bg-[#25D366]" style={{ width: `${(v as number | null) ?? 0}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function AgentTable({ data }: { data: Insights }) {
  const max = Math.max(1, ...data.agents.map((a) => a.replies));
  return (
    <Card className="overflow-hidden min-w-0">
      <CardHeader title="Agent performance" icon="support_agent" subtitle="Replies, conversations and first-response speed" />
      {data.agents.length === 0 && !data.automated ? (
        <EmptyState icon="support_agent" title="No agent replies in this period" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 bg-slate-50/60">
                <th className="px-4 sm:px-5 py-2.5 font-semibold">Agent</th>
                <th className="px-3 py-2.5 font-semibold text-right">Replies</th>
                <th className="px-3 py-2.5 font-semibold text-right hidden sm:table-cell">Chats handled</th>
                <th className="px-3 py-2.5 font-semibold text-right hidden md:table-cell">Assigned</th>
                <th className="px-3 py-2.5 font-semibold text-right hidden md:table-cell">Resolved</th>
                <th className="px-4 sm:px-5 py-2.5 font-semibold text-right">Avg 1st reply</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.agents.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50/60">
                  <td className="px-4 sm:px-5 py-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0 bg-gradient-to-br from-green-400 to-emerald-600">
                        {getInitials(a.name)}
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate max-w-[9rem] sm:max-w-[14rem]">{a.name}</p>
                        <div className="mt-1 h-1 w-20 sm:w-28 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full bg-[#25D366]" style={{ width: `${(a.replies / max) * 100}%` }} />
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums text-slate-900">{fmtNum(a.replies)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-600 hidden sm:table-cell">{fmtNum(a.conversationsHandled)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-600 hidden md:table-cell">{fmtNum(a.assigned)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-600 hidden md:table-cell">{fmtNum(a.resolved)}</td>
                  <td className="px-4 sm:px-5 py-3 text-right tabular-nums text-slate-600">{fmtDuration(a.avgFirstResponseSecs)}</td>
                </tr>
              ))}
              {data.automated && (
                <tr className="bg-slate-50/40">
                  <td className="px-4 sm:px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="w-8 h-8 rounded-full flex items-center justify-center bg-slate-200 text-slate-600 shrink-0"><Icon name="smart_toy" className="w-4 h-4" /></span>
                      <div>
                        <p className="font-semibold text-slate-700">Automated</p>
                        <p className="text-[11px] text-slate-400">Bots, broadcasts and API</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums text-slate-700">{fmtNum(data.automated.replies)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-500 hidden sm:table-cell">{fmtNum(data.automated.conversationsHandled)}</td>
                  <td className="px-3 py-3 text-right text-slate-300 hidden md:table-cell">—</td>
                  <td className="px-3 py-3 text-right text-slate-300 hidden md:table-cell">—</td>
                  <td className="px-4 sm:px-5 py-3 text-right text-slate-300">—</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function TopContacts({ contacts }: { contacts: TopContact[] }) {
  const max = Math.max(1, ...contacts.map((c) => c.total));
  return (
    <Card className="overflow-hidden min-w-0">
      <CardHeader title="Top contacts" icon="contacts" subtitle="Most messages exchanged" />
      {contacts.length === 0 ? (
        <EmptyState icon="contacts" title="No contact activity yet" />
      ) : (
        <ul className="divide-y divide-slate-100">
          {contacts.map((c, i) => (
            <li key={c.id}>
              <div className="flex items-center gap-3 px-4 sm:px-5 py-3">
                <span className="w-5 text-[11px] font-bold text-slate-300 tabular-nums">{i + 1}</span>
                <span className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0 bg-gradient-to-br from-sky-400 to-blue-600">
                  {getInitials(c.name || c.phone)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900 truncate">{c.name || c.phone || "Unknown"}</p>
                    <span className="text-sm font-bold text-slate-900 tabular-nums">{fmtNum(c.total)}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden flex" title={`${c.inbound} received · ${c.outbound} sent`}>
                    <div className="h-full bg-blue-500" style={{ width: `${(c.inbound / max) * 100}%` }} />
                    <div className="h-full bg-[#25D366]" style={{ width: `${(c.outbound / max) * 100}%` }} />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400 truncate">
                    {fmtNum(c.inbound)} received · {fmtNum(c.outbound)} sent · {timeAgo(c.lastAt)}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function BroadcastTable({ data }: { data: Insights }) {
  const k = data.kpis;
  return (
    <Card className="overflow-hidden min-w-0">
      <CardHeader title="Broadcast performance" icon="campaign"
        subtitle={k.broadcasts ? `${fmtNum(k.broadcasts)} broadcast${k.broadcasts === 1 ? "" : "s"} · ${fmtNum(k.broadcastSent)} sent · ${fmtNum(k.broadcastReplied)} replies` : "Broadcasts created in this period"}
        action={<Link href="/broadcasts" className="inline-flex items-center gap-1 text-xs font-semibold text-green-600 hover:text-green-700">View all <Icon name="arrow_forward" className="w-3 h-3" /></Link>} />
      {data.broadcasts.length === 0 ? (
        <EmptyState icon="campaign" title="No broadcasts in this period" hint="Send a broadcast to see delivery and read rates here." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 bg-slate-50/60">
                <th className="px-4 sm:px-5 py-2.5 font-semibold">Broadcast</th>
                <th className="px-3 py-2.5 font-semibold text-right hidden sm:table-cell">Recipients</th>
                <th className="px-3 py-2.5 font-semibold text-right">Sent</th>
                <th className="px-3 py-2.5 font-semibold text-right hidden md:table-cell">Delivered</th>
                <th className="px-3 py-2.5 font-semibold text-right">Read</th>
                <th className="px-3 py-2.5 font-semibold text-right hidden md:table-cell">Failed</th>
                <th className="px-4 sm:px-5 py-2.5 font-semibold hidden lg:table-cell w-40">Funnel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.broadcasts.map((b) => {
                const t = Math.max(b.totalCount, 1);
                return (
                  <tr key={b.id} className="hover:bg-slate-50/60">
                    <td className="px-4 sm:px-5 py-3">
                      <p className="font-semibold text-slate-900 truncate max-w-[10rem] sm:max-w-[16rem]">{b.name}</p>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                        <span className={cn("rounded-full px-1.5 py-0.5 font-semibold", BROADCAST_STATUS[b.status] ?? BROADCAST_STATUS.DRAFT)}>{titleCase(b.status)}</span>
                        <span className="truncate">{timeAgo(b.startedAt ?? b.createdAt)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-600 hidden sm:table-cell">{fmtNum(b.totalCount)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-900 font-semibold">{fmtNum(b.sentCount)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-600 hidden md:table-cell">
                      {fmtNum(b.deliveredCount)} <span className="text-[11px] text-slate-400">{fmtPct(b.deliveryRate)}</span>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-600">
                      {fmtNum(b.readCount)} <span className="text-[11px] text-slate-400 hidden sm:inline">{fmtPct(b.readRate)}</span>
                    </td>
                    <td className={cn("px-3 py-3 text-right tabular-nums hidden md:table-cell", b.failedCount ? "text-red-600" : "text-slate-400")}>{fmtNum(b.failedCount)}</td>
                    <td className="px-4 sm:px-5 py-3 hidden lg:table-cell">
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden flex">
                        <div className="bg-[#25D366]" style={{ width: `${(b.readCount / t) * 100}%` }} title="Read" />
                        <div className="bg-green-300" style={{ width: `${(Math.max(0, b.deliveredCount - b.readCount) / t) * 100}%` }} title="Delivered" />
                        <div className="bg-sky-300" style={{ width: `${(Math.max(0, b.sentCount - b.deliveredCount) / t) * 100}%` }} title="Sent" />
                        <div className="bg-red-400" style={{ width: `${(b.failedCount / t) * 100}%` }} title="Failed" />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [query, setQuery] = useState<Query>({ preset: "30d" });
  const [compare, setCompare] = useState(true);

  const { data, isLoading, isFetching, isError, error, refetch, dataUpdatedAt } = useQuery<Insights>({
    queryKey: ["analytics-insights", toQueryString(query)],
    queryFn: () => axios.get(`/api/analytics/insights?${toQueryString(query)}`).then((r) => r.data),
    placeholderData: (prev) => prev,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  const rangeLabel = data
    ? `${fmtDay(data.range.from, { day: "numeric", month: "short", year: "numeric" })} – ${fmtDay(data.range.to, { day: "numeric", month: "short", year: "numeric" })}`
    : "";
  const prevLabel = data ? `vs ${fmtDay(data.range.previous.from)} – ${fmtDay(data.range.previous.to)}` : "";

  const kpis = useMemo(() => {
    if (!data) return [];
    const k = data.kpis;
    const p = data.previous;
    const t = data.trends;
    const prevSub = (v: string) => (compare ? `Previous: ${v}` : undefined);
    return [
      { label: "Conversations started", value: fmtNum(k.conversations), icon: "forum", color: "#25D366", trend: t.conversations, sub: prevSub(fmtNum(p.conversations)) },
      { label: "Messages received", value: fmtNum(k.messagesIn), icon: "move_to_inbox", color: "#3b82f6", trend: t.messagesIn, sub: prevSub(fmtNum(p.messagesIn)) },
      { label: "Messages sent", value: fmtNum(k.messagesOut), icon: "outbox", color: "#10b981", trend: t.messagesOut, sub: compare ? prevSub(fmtNum(p.messagesOut)) : `${fmtPct(k.messageDeliveryRate)} delivered` },
      { label: "Unique customers", value: fmtNum(k.uniqueCustomers), icon: "group", color: "#8b5cf6", trend: t.uniqueCustomers, sub: prevSub(fmtNum(p.uniqueCustomers)) },
      { label: "New contacts", value: fmtNum(k.newContacts), icon: "person_add", color: "#f59e0b", trend: t.newContacts, sub: prevSub(fmtNum(p.newContacts)) },
      { label: "Median first response", value: fmtDuration(k.medianFirstResponseSecs), icon: "timer", color: "#0ea5e9", trend: t.medianFirstResponseSecs, invert: true, sub: compare ? prevSub(fmtDuration(p.medianFirstResponseSecs)) : `Avg ${fmtDuration(k.avgFirstResponseSecs)}` },
      { label: "Avg first response", value: fmtDuration(k.avgFirstResponseSecs), icon: "hourglass_top", color: "#64748b", trend: t.avgFirstResponseSecs, invert: true, sub: prevSub(fmtDuration(p.avgFirstResponseSecs)) },
      { label: "Resolution rate", value: fmtPct(k.resolutionRate), icon: "task_alt", color: "#16a34a", trend: t.resolutionRate, sub: compare ? prevSub(fmtPct(p.resolutionRate)) : `${fmtNum(k.resolved)} resolved` },
      { label: "Broadcast delivery", value: fmtPct(k.broadcastDeliveryRate), icon: "done_all", color: "#06b6d4", trend: t.broadcastDeliveryRate, sub: compare ? prevSub(fmtPct(p.broadcastDeliveryRate)) : `${fmtNum(k.broadcastDelivered)} of ${fmtNum(k.broadcastSent)}` },
      { label: "Broadcast read rate", value: fmtPct(k.broadcastReadRate), icon: "visibility", color: "#ec4899", trend: t.broadcastReadRate, sub: compare ? prevSub(fmtPct(p.broadcastReadRate)) : `${fmtNum(k.broadcastRead)} read` },
    ];
  }, [data, compare]);

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-8 space-y-5 max-w-7xl mx-auto w-full">
      {/* ── Header ── */}
      <section className="relative rounded-3xl bg-slate-950 text-white px-5 py-6 sm:px-8 sm:py-7">
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
          <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-green-500/25 blur-3xl" />
          <div className="absolute right-24 -bottom-20 w-52 h-52 rounded-full bg-emerald-400/10 blur-3xl" />
        </div>
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-green-400">
              <Icon name="monitoring" className="w-3.5 h-3.5" /> Analytics
            </p>
            <h1 className="mt-2 text-2xl sm:text-3xl font-bold">Performance insights</h1>
            <p className="mt-1.5 text-sm text-slate-400">
              {data ? <>{rangeLabel} <span className="text-slate-500">· {data.range.days} days · {data.range.timezone}</span></> : "Conversations, response times, agents and broadcasts."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <RangePicker query={query} onChange={setQuery} current={data?.range} />
            <button type="button" onClick={() => setCompare((c) => !c)} aria-pressed={compare}
              className={cn("inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-colors",
                compare ? "bg-[#25D366] text-white hover:bg-[#1fb857]" : "bg-white/10 text-slate-200 hover:bg-white/15")}>
              <Icon name="trending_up" className="w-4 h-4" /> Compare
            </button>
            <button type="button" onClick={() => data && downloadCsv(data)} disabled={!data}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/15 disabled:opacity-40">
              <Icon name="description" className="w-4 h-4" /> Export CSV
            </button>
            <button type="button" onClick={() => refetch()} aria-label="Refresh"
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/15">
              <Icon name="refresh" className={cn("w-4 h-4", isFetching && "animate-spin")} />
              <span className="hidden sm:inline">{dataUpdatedAt ? `Updated ${timeAgo(new Date(dataUpdatedAt))}` : "Refresh"}</span>
            </button>
          </div>
        </div>
        {compare && data && <p className="relative mt-4 text-[11px] text-slate-400">Trends compare against the previous {data.range.days} days ({prevLabel.slice(3)}).</p>}
      </section>

      {isError && (
        <Card className="flex items-start gap-3 p-4 border-red-200 bg-red-50/60">
          <Icon name="warning" className="w-5 h-5 text-red-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-700">{errorMessage(error)}</p>
            {data && <p className="text-xs text-red-500 mt-0.5">Showing the last loaded results.</p>}
          </div>
          <button type="button" onClick={() => refetch()} className="text-xs font-semibold text-red-700 hover:underline">Retry</button>
        </Card>
      )}

      {/* ── KPIs ── */}
      <div className={cn("grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 transition-opacity", isFetching && !isLoading && "opacity-70")}>
        {isLoading || !data
          ? Array.from({ length: 10 }).map((_, i) => <KpiSkeleton key={i} />)
          : kpis.map((k) => (
              <KpiCard key={k.label} label={k.label} value={k.value} icon={k.icon} color={k.color}
                trend={compare ? k.trend : undefined} invert={k.invert} sub={k.sub} />
            ))}
      </div>

      {isLoading || !data ? (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2 p-5"><BlockSkeleton className="h-6 w-40" /><BlockSkeleton className="mt-4 h-[240px]" /></Card>
            <Card className="p-5"><BlockSkeleton className="h-6 w-32" /><BlockSkeleton className="mt-4 h-[240px]" /></Card>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2 p-5"><BlockSkeleton className="h-6 w-32" /><BlockSkeleton className="mt-4 h-[200px]" /></Card>
            <Card className="p-5"><BlockSkeleton className="h-6 w-32" /><BlockSkeleton className="mt-4 h-[200px]" /></Card>
          </div>
          <Card className="p-5"><BlockSkeleton className="h-6 w-40" /><BlockSkeleton className="mt-4 h-[180px]" /></Card>
        </>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <ActivityChart daily={data.daily} />
            <StatusChart byStatus={data.conversationsByStatus} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <BusiestHours data={data} />
            <ResponseCard data={data} />
          </div>

          <div className="grid gap-4 xl:grid-cols-5">
            <div className="xl:col-span-3 min-w-0"><AgentTable data={data} /></div>
            <div className="xl:col-span-2 min-w-0"><TopContacts contacts={data.topContacts} /></div>
          </div>

          <BroadcastTable data={data} />

          {data.firstResponse.capped && (
            <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <Icon name="info" className="w-3.5 h-3.5" />
              Response times are based on the {fmtNum(data.firstResponse.sampled)} most recent conversations in this period.
            </p>
          )}
        </>
      )}
    </div>
  );
}
