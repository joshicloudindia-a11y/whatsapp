"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import { Icon } from "@/components/ui/icon";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { timeAgo, getInitials, cn } from "@/lib/utils";

type Range = "7d" | "30d" | "90d";

type Plan = {
  id: string; name: string; slug: string; description?: string;
  monthlyPrice: number; annualPrice: number; currency: string;
  isPopular: boolean; features: string[];
};

interface Conversation {
  id: string; status: string; lastMessageAt?: string; createdAt: string;
  contact?: { name?: string; phone?: string }; assignedAgent?: { name: string } | null;
}
interface Broadcast { id: string; name: string; status: string; totalCount: number; sentCount: number; readCount: number; createdAt: string }

const CURRENCY_SYMBOL: Record<string, string> = { USD: "$", INR: "₹", EUR: "€", GBP: "£" };
const RANGE_LABEL: Record<Range, string> = { "7d": "last 7 days", "30d": "last 30 days", "90d": "last 90 days" };

const PIE_COLORS: Record<string, string> = { OPEN: "#3b82f6", PENDING: "#f59e0b", RESOLVED: "#25D366", CLOSED: "#94a3b8" };

const STATUS_STYLE: Record<string, string> = {
  OPEN: "bg-blue-50 text-blue-700 ring-blue-600/10",
  RESOLVED: "bg-green-50 text-green-700 ring-green-600/10",
  PENDING: "bg-amber-50 text-amber-700 ring-amber-600/10",
  CLOSED: "bg-slate-100 text-slate-500 ring-slate-500/10",
  COMPLETED: "bg-green-50 text-green-700 ring-green-600/10",
  RUNNING: "bg-blue-50 text-blue-700 ring-blue-600/10",
  SENDING: "bg-blue-50 text-blue-700 ring-blue-600/10",
  DRAFT: "bg-slate-100 text-slate-500 ring-slate-500/10",
  FAILED: "bg-red-50 text-red-600 ring-red-600/10",
  SCHEDULED: "bg-violet-50 text-violet-700 ring-violet-600/10",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span className={cn("px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 whitespace-nowrap", STATUS_STYLE[status] ?? STATUS_STYLE.CLOSED)}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("bg-white rounded-2xl border border-slate-200/70 shadow-sm", className)}>{children}</div>;
}

function CardHeader({ title, subtitle, href, linkLabel = "View all" }: { title: string; subtitle?: string; href?: string; linkLabel?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-4 border-b border-slate-100">
      <div className="min-w-0">
        <h2 className="text-sm font-bold text-slate-900 truncate">{title}</h2>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {href && (
        <Link href={href} className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-green-600 hover:text-green-700">
          {linkLabel} <Icon name="arrow_forward" className="w-3 h-3" />
        </Link>
      )}
    </div>
  );
}

// ─── Trial / plan banner ─────────────────────────────────────────────────────
function PlanBanner() {
  const [dismissed, setDismissed] = useState(false);
  const { data: sub } = useQuery({
    queryKey: ["my-subscription"],
    queryFn: () => axios.get("/api/settings/subscription").then((r) => r.data),
  });
  const { data: plansData } = useQuery({
    queryKey: ["public-plans"],
    queryFn: () => axios.get("/api/plans").then((r) => r.data),
    enabled: !!sub,
    staleTime: 5 * 60_000,
  });

  if (dismissed || !sub) return null;
  if (!(sub.status === "TRIAL" || sub.plan === "TRIAL")) return null;

  const trialEndsAt = sub.trialEndsAt ? new Date(sub.trialEndsAt) : null;
  const daysLeft = trialEndsAt ? Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / 86400000)) : null;
  const plans: Plan[] = plansData?.plans ?? [];

  return (
    <Card className="overflow-hidden border-green-200">
      <div className="flex items-start sm:items-center gap-3 px-4 sm:px-5 py-3.5 bg-gradient-to-r from-[#25D366] to-emerald-500 text-white">
        <Icon name="rocket_launch" className="w-5 h-5 shrink-0 mt-0.5 sm:mt-0" />
        <p className="flex-1 text-sm font-semibold">
          {daysLeft !== null
            ? `Your free trial ends in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}. Upgrade to keep access.`
            : "You're on a free trial. Upgrade to unlock all features."}
        </p>
        <button onClick={() => setDismissed(true)} aria-label="Dismiss" className="w-8 h-8 -mr-1 flex items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/10">
          <Icon name="close" className="w-4 h-4" />
        </button>
      </div>
      {plans.length > 0 && (
        <div className="p-4 sm:p-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <div key={plan.id} className={cn("relative rounded-xl p-4 flex flex-col gap-3 border", plan.isPopular ? "border-2 border-green-500" : "border-slate-200")}>
              {plan.isPopular && (
                <span className="absolute -top-2.5 left-4 inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white rounded-full bg-[#25D366]">
                  <Icon name="workspace_premium" className="w-3 h-3" /> Most popular
                </span>
              )}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-slate-900">{plan.name}</h3>
                  {plan.description && <p className="text-xs text-slate-400 mt-0.5">{plan.description}</p>}
                </div>
                <p className="shrink-0 text-xl font-extrabold text-slate-900">
                  {CURRENCY_SYMBOL[plan.currency] ?? "$"}{plan.monthlyPrice}<span className="text-xs font-medium text-slate-400">/mo</span>
                </p>
              </div>
              <ul className="space-y-1.5">
                {plan.features.slice(0, 3).map((f, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-slate-600">
                    <Icon name="check" className="w-3 h-3 mt-0.5 text-green-500" /> {f}
                  </li>
                ))}
              </ul>
              <Link href="/settings?tab=billing"
                className={cn("mt-auto text-center py-2 rounded-lg text-xs font-bold", plan.isPopular ? "text-white bg-[#25D366] hover:bg-[#1fb857]" : "border border-slate-200 text-slate-700 hover:bg-slate-50")}>
                Select plan
              </Link>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── KPI card ────────────────────────────────────────────────────────────────
function Kpi({ label, value, icon, color, trend, sub }: { label: string; value: number; icon: string; color: string; trend?: number; sub?: string }) {
  return (
    <Card className="p-4 sm:p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${color}14`, color }}>
          <Icon name={icon} className="w-[18px] h-[18px]" />
        </div>
        {trend !== undefined && trend !== 0 && (
          <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
            trend > 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600")}>
            <Icon name={trend > 0 ? "trending_up" : "trending_down"} className="w-3 h-3" /> {Math.abs(trend)}%
          </span>
        )}
      </div>
      <div>
        <p className="text-2xl sm:text-[28px] font-bold text-slate-900 leading-none tabular-nums">{value.toLocaleString()}</p>
        <p className="text-xs font-medium text-slate-500 mt-1.5">{label}</p>
      </div>
      {sub && <p className="text-[11px] text-slate-400 -mt-1 truncate">{sub}</p>}
    </Card>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { data: session } = useSession();
  const [range, setRange] = useState<Range>("7d");

  const { data, isLoading, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["dashboard", range],
    queryFn: () => axios.get(`/api/analytics?range=${range}`).then((r) => r.data),
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
  });

  const ov = data?.overview ?? {};
  const convStatus: Record<string, number> = data?.convByStatus ?? {};
  const pieData = Object.entries(convStatus).map(([name, value]) => ({ name, value })).filter((d) => d.value > 0);
  const totalConvStatus = pieData.reduce((a, b) => a + b.value, 0);
  const conversations: Conversation[] = data?.recentConversations ?? [];
  const broadcasts: Broadcast[] = data?.recentBroadcasts ?? [];
  const leaderboard: { name: string; count: number }[] = data?.agentLeaderboard ?? [];

  const firstName = session?.user?.name?.split(" ")[0] ?? "there";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const rangeLabel = RANGE_LABEL[range];

  const quickActions = [
    { label: "New broadcast", desc: "Message many customers", href: "/broadcasts", icon: "campaign", color: "#25D366" },
    { label: "Open inbox", desc: `${ov.openConversations ?? 0} open chats`, href: "/inbox", icon: "forum", color: "#3b82f6" },
    { label: "Add contact", desc: "Grow your audience", href: "/contacts", icon: "person_add", color: "#8b5cf6" },
    { label: "New template", desc: "Get Meta approval", href: "/templates", icon: "description", color: "#f59e0b" },
  ];

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-8 space-y-5 sm:space-y-6 max-w-7xl mx-auto w-full">
      {/* ── Hero ── */}
      <section className="relative overflow-hidden rounded-3xl bg-slate-950 text-white px-5 py-6 sm:px-8 sm:py-7">
        <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-green-500/25 blur-3xl" />
        <div className="absolute right-24 -bottom-20 w-52 h-52 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-green-400">
              {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
            </p>
            <h1 className="mt-2 text-2xl sm:text-3xl font-bold">{greeting}, {firstName}</h1>
            <p className="mt-1.5 text-sm text-slate-400">
              {ov.openConversations
                ? `You have ${ov.openConversations} open conversation${ov.openConversations === 1 ? "" : "s"} waiting for a reply.`
                : "Here's how your WhatsApp business is doing."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-xl bg-white/10 p-1" role="tablist" aria-label="Date range">
              {(["7d", "30d", "90d"] as Range[]).map((r) => (
                <button key={r} role="tab" aria-selected={range === r} onClick={() => setRange(r)}
                  className={cn("px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-colors",
                    range === r ? "bg-white text-slate-900" : "text-slate-300 hover:text-white")}>
                  {r}
                </button>
              ))}
            </div>
            <button onClick={() => refetch()} aria-label="Refresh"
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/15">
              <Icon name="refresh" className={cn("w-4 h-4", isFetching && "animate-spin")} />
              <span className="hidden sm:inline">{dataUpdatedAt ? `Updated ${timeAgo(new Date(dataUpdatedAt))}` : "Refresh"}</span>
            </button>
          </div>
        </div>
      </section>

      <PlanBanner />

      <OnboardingChecklist />

      {/* ── Quick actions ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {quickActions.map((a) => (
          <Link key={a.href} href={a.href}
            className="group flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-white p-3 sm:p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <span className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center text-white shrink-0" style={{ background: a.color }}>
              <Icon name={a.icon} className="w-5 h-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-slate-900 truncate">{a.label}</span>
              <span className="block text-[11px] text-slate-400 truncate">{a.desc}</span>
            </span>
          </Link>
        ))}
      </div>

      {/* ── KPIs ── */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="p-5 h-[132px] animate-pulse"><div className="w-9 h-9 rounded-xl bg-slate-100" /><div className="mt-4 h-6 w-16 rounded bg-slate-100" /></Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
          <Kpi label="Open conversations" value={ov.openConversations ?? 0} icon="forum" color="#3b82f6" sub={`${ov.resolvedConversations ?? 0} resolved`} />
          <Kpi label="Messages sent" value={ov.messagesSent ?? 0} icon="outbox" color="#25D366" trend={ov.messagesSentTrend} sub={`vs previous ${range}`} />
          <Kpi label="Messages received" value={ov.messagesReceived ?? 0} icon="move_to_inbox" color="#8b5cf6" trend={ov.messagesReceivedTrend} sub={`vs previous ${range}`} />
          <Kpi label="New contacts" value={ov.newContacts ?? 0} icon="person_add" color="#f59e0b" trend={ov.newContactsTrend} sub={`${(ov.totalContacts ?? 0).toLocaleString()} total`} />
          <Kpi label="Broadcasts" value={ov.broadcasts ?? 0} icon="campaign" color="#ef4444" trend={ov.broadcastsTrend} sub={rangeLabel} />
          <Kpi label="Conversations" value={ov.totalConversations ?? 0} icon="chat" color="#64748b" sub={`started ${rangeLabel}`} />
        </div>
      )}

      {/* ── Charts ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Message volume" subtitle={rangeLabel} />
          <div className="px-2 sm:px-4 pt-4 pb-2">
            <div className="flex items-center gap-4 px-2 pb-2 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#25D366]" /> Sent</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Received</span>
            </div>
            <div className="h-[200px] sm:h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.dailyMessages ?? []} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gSent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#25D366" stopOpacity={0.22} /><stop offset="95%" stopColor="#25D366" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gReceived" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.18} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} minTickGap={16} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} labelStyle={{ fontWeight: 600 }} />
                  <Area type="monotone" dataKey="sent" stroke="#25D366" fill="url(#gSent)" strokeWidth={2} name="Sent" />
                  <Area type="monotone" dataKey="received" stroke="#3b82f6" fill="url(#gReceived)" strokeWidth={2} name="Received" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Conversation status" subtitle={`${totalConvStatus.toLocaleString()} total`} />
          {pieData.length === 0 ? (
            <div className="h-[240px] flex flex-col items-center justify-center gap-2 text-slate-400 text-sm">
              <Icon name="forum" className="w-8 h-8 text-slate-200" /> No conversations yet
            </div>
          ) : (
            <div className="p-4">
              <div className="relative h-[170px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} innerRadius={52} outerRadius={78} dataKey="value" paddingAngle={3} stroke="none">
                      {pieData.map((d) => <Cell key={d.name} fill={PIE_COLORS[d.name] ?? "#94a3b8"} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <p className="text-xl font-bold text-slate-900 tabular-nums">{totalConvStatus.toLocaleString()}</p>
                  <p className="text-[10px] uppercase tracking-wider text-slate-400">chats</p>
                </div>
              </div>
              <ul className="mt-3 grid grid-cols-2 gap-2">
                {pieData.map((d) => (
                  <li key={d.name} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs">
                    <span className="inline-flex items-center gap-1.5 text-slate-600">
                      <span className="w-2 h-2 rounded-full" style={{ background: PIE_COLORS[d.name] ?? "#94a3b8" }} />
                      {d.name.charAt(0) + d.name.slice(1).toLowerCase()}
                    </span>
                    <span className="font-semibold text-slate-800 tabular-nums">{d.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>

      {/* ── Recent activity ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader title="Recent conversations" href="/inbox" linkLabel="Open inbox" />
          {conversations.length === 0 ? (
            <div className="py-12 flex flex-col items-center gap-2 text-sm text-slate-400">
              <Icon name="inbox" className="w-8 h-8 text-slate-200" /> No conversations yet
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {conversations.map((c) => (
                <li key={c.id}>
                  <Link href={`/inbox?id=${c.id}`} className="flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-slate-50">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 bg-gradient-to-br from-green-400 to-emerald-600">
                      {getInitials(c.contact?.name || c.contact?.phone)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{c.contact?.name || c.contact?.phone || "Unknown"}</p>
                      <p className="text-xs text-slate-400 truncate">
                        {c.assignedAgent ? `Assigned to ${c.assignedAgent.name}` : "Unassigned"} · {timeAgo(c.lastMessageAt ?? c.createdAt)}
                      </p>
                    </div>
                    <StatusPill status={c.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader title="Recent broadcasts" href="/broadcasts" />
          {broadcasts.length === 0 ? (
            <div className="py-12 flex flex-col items-center gap-2 text-sm text-slate-400">
              <Icon name="campaign" className="w-8 h-8 text-slate-200" /> No broadcasts yet
              <Link href="/broadcasts" className="mt-1 text-xs font-semibold text-green-600 hover:underline">Send your first broadcast</Link>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {broadcasts.map((b) => {
                const readRate = b.sentCount > 0 ? Math.round((b.readCount / b.sentCount) * 100) : 0;
                return (
                  <li key={b.id} className="px-4 sm:px-5 py-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900 truncate">{b.name}</p>
                      <StatusPill status={b.status} />
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1"><Icon name="group" className="w-3.5 h-3.5" /> {b.totalCount.toLocaleString()}</span>
                      <span className="inline-flex items-center gap-1 text-green-600"><Icon name="check" className="w-3.5 h-3.5" /> {b.sentCount.toLocaleString()} sent</span>
                      <span className="inline-flex items-center gap-1 text-blue-600"><Icon name="visibility" className="w-3.5 h-3.5" /> {b.readCount.toLocaleString()} read</span>
                      <span className="ml-auto text-slate-400">{timeAgo(b.createdAt)}</span>
                    </div>
                    {b.sentCount > 0 && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-[#25D366]" style={{ width: `${readRate}%` }} />
                        </div>
                        <span className="text-[11px] font-semibold text-slate-600 tabular-nums">{readRate}%</span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* ── Agent leaderboard ── */}
      {leaderboard.length > 0 && (
        <Card>
          <CardHeader title="Agent leaderboard" subtitle={`Replies sent · ${rangeLabel}`} />
          <ul className="p-4 sm:p-5 space-y-3">
            {leaderboard.map((agent, i) => {
              const widthPct = Math.round((agent.count / (leaderboard[0]?.count || 1)) * 100);
              const medal = ["#f59e0b", "#94a3b8", "#cd7c2f"][i] ?? "#cbd5e1";
              return (
                <li key={agent.name} className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0" style={{ background: medal }}>
                    {i < 3 ? <Icon name="emoji_events" className="w-3 h-3" /> : i + 1}
                  </span>
                  <p className="text-sm font-medium text-slate-900 w-24 sm:w-40 truncate">{agent.name}</p>
                  <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div className="h-full rounded-full bg-[#25D366] transition-all" style={{ width: `${widthPct}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-slate-700 w-10 text-right tabular-nums">{agent.count}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
