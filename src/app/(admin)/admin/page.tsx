import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBuilding, faUsers, faComments, faLayerGroup,
  faCalendarAlt, faArrowRight,
} from "@fortawesome/free-solid-svg-icons";

const PLAN_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  TRIAL:    { bg: "#f1f5f9", text: "#64748b", border: "#94a3b8" },
  GROWTH:   { bg: "#f0fdf4", text: "#16a34a", border: "#22c55e" },
  PRO:      { bg: "#f5f3ff", text: "#7c3aed", border: "#8b5cf6" },
  BUSINESS: { bg: "#fffbeb", text: "#d97706", border: "#f59e0b" },
};

export default async function AdminOverviewPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isSuperAdmin) redirect("/dashboard");

  const [totalOrgs, totalUsers, totalConversations, planBreakdown, recentOrgs] = await Promise.all([
    prisma.organization.count(),
    prisma.user.count(),
    prisma.conversation.count(),
    prisma.organization.groupBy({ by: ["plan"], _count: { _all: true } }),
    prisma.organization.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        _count: { select: { members: true } },
        subscription: { select: { plan: true, status: true } },
      },
    }),
  ]);

  const stats = [
    { label: "Total Organizations", value: totalOrgs,         icon: faBuilding,    accent: "#6366f1", light: "#eef2ff" },
    { label: "Total Users",         value: totalUsers,         icon: faUsers,       accent: "#25D366", light: "#f0fdf4" },
    { label: "Conversations",       value: totalConversations, icon: faComments,    accent: "#f59e0b", light: "#fffbeb" },
    { label: "Plan Types",          value: planBreakdown.length, icon: faLayerGroup, accent: "#ef4444", light: "#fef2f2" },
  ];

  return (
    <div className="p-6 lg:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Admin Overview</h1>
          <p className="text-slate-500 text-sm mt-1">Platform-wide statistics and management</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400 bg-white border border-slate-200 rounded-lg px-3 py-2">
          <FontAwesomeIcon icon={faCalendarAlt} className="w-3.5 h-3.5" />
          <span>{new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        {stats.map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: s.light }}>
              <FontAwesomeIcon icon={s.icon} className="w-5 h-5" style={{ color: s.accent }} />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{s.value}</p>
              <p className="text-sm text-slate-500 mt-0.5">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Plan Breakdown */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h2 className="text-base font-semibold text-slate-900 mb-5">Organizations by Plan</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {planBreakdown.length === 0 ? (
            <p className="col-span-4 text-sm text-slate-400 text-center py-4">No organizations yet</p>
          ) : planBreakdown.map((p) => {
            const c = PLAN_COLORS[p.plan] ?? PLAN_COLORS.TRIAL;
            return (
              <div
                key={p.plan}
                className="rounded-2xl p-5 text-center border"
                style={{ background: c.bg, borderColor: c.border + "40" }}
              >
                <p className="text-3xl font-bold" style={{ color: c.border }}>{p._count._all}</p>
                <p className="text-xs font-semibold mt-1.5 uppercase tracking-wider" style={{ color: c.text }}>{p.plan}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Organizations */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Recent Organizations</h2>
          <a
            href="/admin/organizations"
            className="flex items-center gap-1.5 text-sm font-medium transition-colors hover:opacity-80"
            style={{ color: "#25D366" }}
          >
            View all
            <FontAwesomeIcon icon={faArrowRight} className="w-3 h-3" />
          </a>
        </div>
        <div className="divide-y divide-slate-50">
          {recentOrgs.map((org) => {
            const c = PLAN_COLORS[org.plan] ?? PLAN_COLORS.TRIAL;
            return (
              <div key={org.id} className="flex items-center justify-between px-6 py-3.5 hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ background: c.bg, color: c.border }}
                  >
                    {org.name[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{org.name}</p>
                    <p className="text-xs text-slate-400">{org.slug} · {org._count.members} member{org._count.members !== 1 ? "s" : ""}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-4">
                  <span
                    className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
                    style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}40` }}
                  >
                    {org.plan}
                  </span>
                  <span className="text-xs text-slate-400 hidden sm:block">
                    {new Date(org.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
