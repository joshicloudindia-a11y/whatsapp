import { Icon } from "@/components/ui/icon";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAdminContext } from "@/lib/admin-auth";
import { hasPermission } from "@/lib/rbac";
import { formatAction } from "@/lib/audit-format";

const PLAN_STYLE: Record<string, { bar: string; text: string; bg: string }> = {
  TRIAL:    { bar: "#94a3b8", text: "#475569", bg: "#f1f5f9" },
  GROWTH:   { bar: "#22c55e", text: "#15803d", bg: "#f0fdf4" },
  PRO:      { bar: "#8b5cf6", text: "#6d28d9", bg: "#f5f3ff" },
  BUSINESS: { bar: "#f59e0b", text: "#b45309", bg: "#fffbeb" },
};

function timeAgo(d: Date) {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default async function AdminOverviewPage() {
  const result = await getAdminContext();
  if (!result.ok) redirect("/admin/login");
  const { ctx } = result;
  const showAudit = hasPermission(ctx.role, "audit:read");
  // Server Component: rendered once per request, so reading the clock here is intended.
  // eslint-disable-next-line react-hooks/purity
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [totalOrgs, totalUsers, totalConversations, adminStaff, planBreakdown, recentOrgs, lockedUsers, failedLogins, recentActivity] =
    await Promise.all([
      prisma.organization.count(),
      prisma.user.count(),
      prisma.conversation.count(),
      prisma.user.count({ where: { OR: [{ adminRole: { not: null } }, { isSuperAdmin: true }] } }),
      prisma.organization.groupBy({ by: ["plan"], _count: { _all: true } }),
      prisma.organization.findMany({
        orderBy: { createdAt: "desc" },
        take: 6,
        include: { _count: { select: { members: true } } },
      }),
      prisma.user.count({ where: { lockedUntil: { gt: new Date() } } }),
      prisma.auditLog.count({ where: { action: { in: ["admin.login.failed", "admin.otp.failed"] }, createdAt: { gte: dayAgo } } }),
      showAudit ? prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 6 }) : Promise.resolve([]),
    ]);

  const greetingHour = new Date().getHours();
  const greeting = greetingHour < 12 ? "Good morning" : greetingHour < 17 ? "Good afternoon" : "Good evening";

  const stats = [
    { label: "Organizations", value: totalOrgs, icon: "apartment", color: "#6366f1", href: "/admin/organizations" },
    { label: "Users", value: totalUsers, icon: "group", color: "#25D366", href: "/admin/users" },
    { label: "Conversations", value: totalConversations, icon: "forum", color: "#f59e0b", href: null },
    { label: "Admin staff", value: adminStaff, icon: "shield_person", color: "#ec4899", href: "/admin/users?filter=admins" },
  ];

  const securityOk = lockedUsers === 0 && failedLogins < 5;

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-8 space-y-5 sm:space-y-6 max-w-7xl mx-auto w-full">
      {/* Welcome */}
      <div className="relative overflow-hidden rounded-3xl bg-slate-950 px-5 py-6 sm:px-8 sm:py-8 text-white">
        <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-green-500/20 blur-3xl" />
        <div className="absolute right-20 -bottom-16 w-40 h-40 rounded-full bg-emerald-400/10 blur-3xl" />
        <p className="relative text-xs font-semibold uppercase tracking-widest text-green-400">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
        <h1 className="relative mt-2 text-xl sm:text-3xl font-bold">{greeting}, {ctx.name?.split(" ")[0] ?? "Admin"}</h1>
        <p className="relative mt-1.5 text-sm text-slate-400 max-w-xl">Here&apos;s what&apos;s happening across the ChatFlow platform today.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        {stats.map((s) => {
          const body = (
            <div className="h-full bg-white rounded-2xl border border-slate-200/70 shadow-sm p-4 sm:p-5 transition hover:shadow-md hover:-translate-y-0.5">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${s.color}15` }}>
                  <Icon name={s.icon} className="w-4 h-4" style={{ color: s.color }} />
                </div>
                {s.href && <Icon name={"arrow_forward"} className="w-3 h-3 text-slate-300" />}
              </div>
              <p className="mt-4 text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums">{s.value.toLocaleString()}</p>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">{s.label}</p>
            </div>
          );
          return s.href ? <Link key={s.label} href={s.href}>{body}</Link> : <div key={s.label}>{body}</div>;
        })}
      </div>

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-3">
        {/* Plan distribution */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5 sm:p-6">
          <h2 className="text-sm font-bold text-slate-900">Organizations by plan</h2>
          <p className="text-xs text-slate-400 mt-0.5">Distribution of {totalOrgs} organizations</p>
          <div className="mt-5 space-y-4">
            {["TRIAL", "GROWTH", "PRO", "BUSINESS"].map((plan) => {
              const count = planBreakdown.find((p) => p.plan === plan)?._count._all ?? 0;
              const pct = totalOrgs ? Math.round((count / totalOrgs) * 100) : 0;
              const st = PLAN_STYLE[plan];
              return (
                <div key={plan}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-semibold" style={{ color: st.text }}>{plan}</span>
                    <span className="text-slate-500 tabular-nums">{count} · {pct}%</span>
                  </div>
                  <div className="h-2.5 rounded-full overflow-hidden" style={{ background: st.bg }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(pct, count ? 3 : 0)}%`, background: st.bar }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Security */}
        <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5 sm:p-6 flex flex-col">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${securityOk ? "bg-green-50" : "bg-amber-50"}`}>
              <Icon name={securityOk ? "check_circle" : "warning"} className={`w-4 h-4 ${securityOk ? "text-green-600" : "text-amber-500"}`} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Security status</h2>
              <p className="text-xs text-slate-400">{securityOk ? "No issues detected" : "Needs attention"}</p>
            </div>
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-3 flex-1">
            <div className="rounded-xl bg-slate-50 p-3">
              <dt className="text-[11px] text-slate-500 flex items-center gap-1.5"><Icon name={"lock"} className="w-2.5 h-2.5" /> Locked accounts</dt>
              <dd className="mt-1 text-xl font-bold text-slate-900 tabular-nums">{lockedUsers}</dd>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <dt className="text-[11px] text-slate-500">Failed admin logins (24h)</dt>
              <dd className={`mt-1 text-xl font-bold tabular-nums ${failedLogins >= 5 ? "text-amber-600" : "text-slate-900"}`}>{failedLogins}</dd>
            </div>
          </dl>
          <p className="mt-4 text-[11px] text-slate-400">Admin logins use password + email OTP, lock after 5 failures and expire after 8 hours.</p>
        </div>
      </div>

      <div className={`grid gap-4 sm:gap-5 ${showAudit ? "lg:grid-cols-2" : ""}`}>
        {/* Recent orgs */}
        <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900">Recent organizations</h2>
            <Link href="/admin/organizations" className="text-xs font-semibold text-green-600 hover:text-green-700 flex items-center gap-1">
              View all <Icon name={"arrow_forward"} className="w-2.5 h-2.5" />
            </Link>
          </div>
          {recentOrgs.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-400">No organizations yet</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentOrgs.map((org) => {
                const st = PLAN_STYLE[org.plan] ?? PLAN_STYLE.TRIAL;
                return (
                  <li key={org.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0" style={{ background: st.bg, color: st.text }}>
                      {org.name[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 truncate">{org.name}</p>
                      <p className="text-xs text-slate-400 truncate">{org._count.members} member{org._count.members !== 1 ? "s" : ""} · {timeAgo(org.createdAt)}</p>
                    </div>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: st.bg, color: st.text }}>{org.plan}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Recent admin activity */}
        {showAudit && (
          <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-900">Recent admin activity</h2>
              <Link href="/admin/audit-logs" className="text-xs font-semibold text-green-600 hover:text-green-700 flex items-center gap-1">
                Audit log <Icon name={"arrow_forward"} className="w-2.5 h-2.5" />
              </Link>
            </div>
            {recentActivity.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-slate-400">No activity yet</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {recentActivity.map((log) => {
                  const f = formatAction(log.action);
                  return (
                    <li key={log.id} className="flex items-start gap-3 px-5 py-3">
                      <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${f.danger ? "bg-red-50 text-red-500" : "bg-slate-100 text-slate-500"}`}>
                        <Icon name={"history"} className="w-3 h-3" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-800"><span className="font-semibold">{f.label}</span></p>
                        <p className="text-xs text-slate-400 truncate">{log.actorEmail ?? "Unknown"} · {timeAgo(log.createdAt)}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
