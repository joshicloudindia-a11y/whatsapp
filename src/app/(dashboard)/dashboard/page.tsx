"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import { timeAgo, getInitials, cn } from "@/lib/utils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBullhorn, faComments, faUserPlus, faFileAlt } from "@fortawesome/free-solid-svg-icons";

type Range = "7d" | "30d" | "90d";

// ─── Trend badge ──────────────────────────────────────────────────────────────
function Trend({ pct }: { pct: number }) {
  if (pct === 0) return <span className="text-xs text-slate-400">—</span>;
  const up = pct > 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", up ? "text-green-600" : "text-red-500")}>
      {up ? "▲" : "▼"} {Math.abs(pct)}%
    </span>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({
  label, value, trend, color, sub,
}: {
  label: string; value: number | string; trend?: number; color: string; sub?: string;
}) {
  return (
    <div className="bg-white rounded-xl border p-5 flex flex-col gap-2" style={{ borderColor: "#e2e8f0" }}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
        {trend !== undefined && <Trend pct={trend} />}
      </div>
      <p className="text-3xl font-bold" style={{ color }}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

// ─── Status pill ──────────────────────────────────────────────────────────────
function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    OPEN: "bg-blue-100 text-blue-700",
    RESOLVED: "bg-green-100 text-green-700",
    PENDING: "bg-amber-100 text-amber-700",
    CLOSED: "bg-slate-100 text-slate-500",
    COMPLETED: "bg-green-100 text-green-700",
    RUNNING: "bg-blue-100 text-blue-700",
    DRAFT: "bg-slate-100 text-slate-500",
    FAILED: "bg-red-100 text-red-600",
    SCHEDULED: "bg-purple-100 text-purple-700",
  };
  return (
    <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", map[status] ?? "bg-slate-100 text-slate-500")}>
      {status}
    </span>
  );
}

const PIE_COLORS: Record<string, string> = {
  OPEN: "#3b82f6",
  PENDING: "#f59e0b",
  RESOLVED: "#25D366",
  CLOSED: "#94a3b8",
};

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { data: session } = useSession();
  const [range, setRange] = useState<Range>("7d");

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", range],
    queryFn: () => axios.get(`/api/analytics?range=${range}`).then((r) => r.data),
    refetchInterval: 60_000,
  });

  const ov = data?.overview ?? {};
  const convStatus: Record<string, number> = data?.convByStatus ?? {};
  const pieData = Object.entries(convStatus).map(([name, value]) => ({ name, value }));
  const totalConvStatus = Object.values(convStatus).reduce((a, b) => a + b, 0);

  const firstName = session?.user?.name?.split(" ")[0] ?? "there";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const rangeLabel = range === "7d" ? "last 7 days" : range === "30d" ? "last 30 days" : "last 90 days";

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{greeting}, {firstName} 👋</h1>
          <p className="text-sm text-slate-400 mt-0.5">Here's what's happening with your WhatsApp inbox</p>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
          {(["7d", "30d", "90d"] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                "px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
                range === r ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "New Broadcast", href: "/broadcasts", bg: "#25D366", icon: faBullhorn },
          { label: "Open Inbox",    href: "/inbox",      bg: "#3b82f6", icon: faComments },
          { label: "Add Contact",   href: "/contacts",   bg: "#8b5cf6", icon: faUserPlus },
          { label: "New Template",  href: "/templates",  bg: "#f59e0b", icon: faFileAlt  },
        ].map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="flex items-center gap-3 px-5 py-3.5 rounded-xl text-white text-sm font-semibold hover:brightness-110 transition-all shadow-sm"
            style={{ background: a.bg }}
          >
            <FontAwesomeIcon icon={a.icon} className="w-4 h-4 shrink-0" />
            {a.label}
          </Link>
        ))}
      </div>

      {/* ── Stat Cards ── */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border p-5 h-24 animate-pulse" style={{ borderColor: "#e2e8f0" }}>
              <div className="h-3 bg-slate-100 rounded w-1/2 mb-3" />
              <div className="h-8 bg-slate-100 rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard label="Open Conversations" value={ov.openConversations ?? 0} color="#3b82f6"
            sub={`${ov.resolvedConversations ?? 0} resolved in ${rangeLabel}`} />
          <StatCard label="Messages Sent" value={ov.messagesSent ?? 0} color="#25D366"
            trend={ov.messagesSentTrend} sub={`vs previous ${range}`} />
          <StatCard label="Messages Received" value={ov.messagesReceived ?? 0} color="#8b5cf6"
            trend={ov.messagesReceivedTrend} sub={`vs previous ${range}`} />
          <StatCard label="New Contacts" value={ov.newContacts ?? 0} color="#f59e0b"
            trend={ov.newContactsTrend} sub={`${ov.totalContacts ?? 0} total contacts`} />
          <StatCard label="Broadcasts" value={ov.broadcasts ?? 0} color="#ef4444"
            trend={ov.broadcastsTrend} sub={`sent in ${rangeLabel}`} />
          <StatCard label="Total Conversations" value={ov.totalConversations ?? 0} color="#64748b"
            sub={`started in ${rangeLabel}`} />
        </div>
      )}

      {/* ── Chart + Status Pie ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-xl border p-5" style={{ borderColor: "#e2e8f0" }}>
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Message Volume — {rangeLabel}</h2>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data?.dailyMessages ?? []} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gSent" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#25D366" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#25D366" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gReceived" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }}
                labelStyle={{ fontWeight: 600 }}
              />
              <Area type="monotone" dataKey="sent" stroke="#25D366" fill="url(#gSent)" strokeWidth={2} name="Sent" />
              <Area type="monotone" dataKey="received" stroke="#3b82f6" fill="url(#gReceived)" strokeWidth={2} name="Received" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border p-5" style={{ borderColor: "#e2e8f0" }}>
          <h2 className="text-sm font-semibold text-slate-900 mb-1">Conversation Status</h2>
          <p className="text-xs text-slate-400 mb-3">{totalConvStatus.toLocaleString()} total</p>
          {pieData.length === 0 ? (
            <div className="h-[180px] flex items-center justify-center text-slate-300 text-sm">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="45%" innerRadius={50} outerRadius={75}
                  dataKey="value" paddingAngle={3}>
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={PIE_COLORS[entry.name] ?? "#94a3b8"} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any) => [v.toLocaleString(), ""]}
                  contentStyle={{ borderRadius: 10, fontSize: 12 }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Recent Conversations + Broadcasts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Recent Conversations */}
        <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: "#e2e8f0" }}>
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#f1f5f9" }}>
            <h2 className="text-sm font-semibold text-slate-900">Recent Conversations</h2>
            <Link href="/inbox" className="text-xs font-medium hover:underline" style={{ color: "#25D366" }}>View all →</Link>
          </div>
          {(data?.recentConversations ?? []).length === 0 ? (
            <div className="py-12 text-center text-slate-300 text-sm">No conversations yet</div>
          ) : (
            <div className="divide-y" style={{ borderColor: "#f8fafc" }}>
              {(data?.recentConversations ?? []).map((c: any) => (
                <Link
                  key={c.id}
                  href={`/inbox?id=${c.id}`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors"
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                    style={{ background: "#25D366" }}
                  >
                    {getInitials(c.contact?.name || c.contact?.phone)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {c.contact?.name || c.contact?.phone || "Unknown"}
                    </p>
                    <p className="text-xs text-slate-400">
                      {c.assignedAgent ? `Assigned to ${c.assignedAgent.name}` : "Unassigned"}
                      {" · "}{c.lastMessageAt ? timeAgo(c.lastMessageAt) : timeAgo(c.createdAt)}
                    </p>
                  </div>
                  <StatusPill status={c.status} />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Recent Broadcasts */}
        <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: "#e2e8f0" }}>
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#f1f5f9" }}>
            <h2 className="text-sm font-semibold text-slate-900">Recent Broadcasts</h2>
            <Link href="/broadcasts" className="text-xs font-medium hover:underline" style={{ color: "#25D366" }}>View all →</Link>
          </div>
          {(data?.recentBroadcasts ?? []).length === 0 ? (
            <div className="py-12 text-center text-slate-300 text-sm">No broadcasts yet</div>
          ) : (
            <div className="divide-y" style={{ borderColor: "#f8fafc" }}>
              {(data?.recentBroadcasts ?? []).map((b: any) => {
                const readRate = b.sentCount > 0 ? Math.round((b.readCount / b.sentCount) * 100) : 0;
                return (
                  <div key={b.id} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <p className="text-sm font-medium text-slate-900 truncate flex-1">{b.name}</p>
                      <StatusPill status={b.status} />
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span>{b.totalCount.toLocaleString()} recipients</span>
                      <span className="text-green-600">✓ {b.sentCount} sent</span>
                      <span className="text-blue-600">👁 {b.readCount} read</span>
                      {b.sentCount > 0 && (
                        <span className="ml-auto font-medium text-slate-700">{readRate}% read rate</span>
                      )}
                    </div>
                    {b.sentCount > 0 && (
                      <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${readRate}%`, background: "#25D366" }} />
                      </div>
                    )}
                    <p className="text-xs text-slate-400 mt-1">{timeAgo(b.createdAt)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Agent Leaderboard ── */}
      {(data?.agentLeaderboard ?? []).length > 0 && (
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: "#e2e8f0" }}>
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Agent Leaderboard — {rangeLabel}</h2>
          <div className="space-y-3">
            {(data.agentLeaderboard as { name: string; count: number }[]).map((agent, i) => {
              const maxCount = data.agentLeaderboard[0]?.count ?? 1;
              const widthPct = Math.round((agent.count / maxCount) * 100);
              return (
                <div key={agent.name} className="flex items-center gap-3">
                  <span className="w-5 text-xs font-bold text-slate-400 text-right">{i + 1}</span>
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                    style={{ background: i === 0 ? "#f59e0b" : i === 1 ? "#94a3b8" : "#cd7c2f" }}
                  >
                    {getInitials(agent.name)}
                  </div>
                  <p className="text-sm font-medium text-slate-900 w-32 truncate">{agent.name}</p>
                  <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${widthPct}%`, background: "#25D366" }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-slate-700 w-10 text-right">
                    {agent.count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
