import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

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
    { label: "Total Organizations", value: totalOrgs, icon: "🏢", color: "#6366f1" },
    { label: "Total Users", value: totalUsers, icon: "👥", color: "#25D366" },
    { label: "Conversations", value: totalConversations, icon: "💬", color: "#f59e0b" },
    { label: "Active Plans", value: planBreakdown.length, icon: "💳", color: "#ef4444" },
  ];

  const PLAN_COLORS: Record<string, string> = {
    TRIAL: "#94a3b8", GROWTH: "#22c55e", PRO: "#6366f1", BUSINESS: "#f59e0b",
  };

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Admin Overview</h1>
        <p className="text-slate-500 text-sm mt-1">Platform-wide statistics and management</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl">{s.icon}</span>
              <span className="text-2xl font-bold text-slate-900">{s.value}</span>
            </div>
            <p className="text-sm text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Plan Breakdown */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h2 className="text-base font-semibold text-slate-900 mb-4">Organizations by Plan</h2>
        <div className="flex gap-4">
          {planBreakdown.map((p) => (
            <div key={p.plan} className="flex-1 rounded-xl p-4 text-center" style={{ background: PLAN_COLORS[p.plan] + "15" }}>
              <p className="text-2xl font-bold" style={{ color: PLAN_COLORS[p.plan] }}>{p._count._all}</p>
              <p className="text-xs font-medium text-slate-600 mt-1">{p.plan}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Organizations */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Recent Organizations</h2>
          <a href="/admin/organizations" className="text-sm font-medium" style={{ color: "#25D366" }}>View all →</a>
        </div>
        <div className="divide-y divide-slate-50">
          {recentOrgs.map((org) => (
            <div key={org.id} className="flex items-center justify-between px-6 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{org.name}</p>
                <p className="text-xs text-slate-400">{org.slug} · {org._count.members} members</p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
                  style={{ background: PLAN_COLORS[org.plan] + "20", color: PLAN_COLORS[org.plan] }}
                >
                  {org.plan}
                </span>
                <span className="text-xs text-slate-400">
                  {new Date(org.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
