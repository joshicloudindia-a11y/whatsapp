"use client";

import { Icon } from "@/components/ui/icon";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import axios from "axios";
import { toast } from "sonner";
import { AdminProvider, type AdminUser } from "@/components/admin/admin-context";
import { Avatar, RoleBadge, cx, BRAND } from "@/components/admin/ui";
import { hasPermission, type Permission } from "@/lib/rbac";

interface NavItem { href: string; label: string; short: string; icon: string; permission: Permission }

const NAV: NavItem[] = [
  { href: "/admin",               label: "Overview",        short: "Home",    icon: "dashboard",        permission: "overview:read" },
  { href: "/admin/organizations", label: "Organizations",   short: "Orgs",    icon: "apartment",        permission: "orgs:read" },
  { href: "/admin/users",         label: "Users & Staff",   short: "Users",   icon: "group",           permission: "users:read" },
  { href: "/admin/roles",         label: "Roles & Permissions", short: "Roles", icon: "admin_panel_settings", permission: "roles:read" },
  { href: "/admin/plans",         label: "Plans & Pricing", short: "Plans",   icon: "credit_card",      permission: "plans:read" },
  { href: "/admin/audit-logs",    label: "Audit Logs",      short: "Audit",   icon: "history", permission: "audit:read" },
];

const isActive = (pathname: string, href: string) =>
  pathname === href || (href !== "/admin" && pathname.startsWith(href));

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className={cx("rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-green-500/30", compact ? "w-8 h-8" : "w-9 h-9")} style={{ background: BRAND }}>
        <Icon name={"admin_panel_settings"} className="w-4 h-4 text-white" />
      </div>
      <div className="leading-none">
        <p className="text-white text-sm font-bold">ChatFlow</p>
        <p className="text-[11px] font-semibold mt-1" style={{ color: BRAND }}>Super Admin</p>
      </div>
    </div>
  );
}

function useCountdown(expiresAt: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const ms = Math.max(0, expiresAt - now);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return { ms, label: h > 0 ? `${h}h ${m}m` : `${m}m` };
}

export default function AdminShell({ user, expiresAt, children }: { user: AdminUser; expiresAt: number; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const { ms, label: remaining } = useCountdown(expiresAt);

  const nav = NAV.filter((n) => hasPermission(user.role, n.permission));
  // Bottom bar: first 4 permitted items + "More"
  const bottomNav = nav.slice(0, 4);
  const overflowNav = nav.slice(4);
  const current = nav.find((n) => isActive(pathname, n.href));

  // Auto sign-out when the 8h admin session ends.
  useEffect(() => {
    if (ms <= 0) {
      toast.error("Admin session expired. Please sign in again.");
      signOut({ callbackUrl: "/admin/login?reason=expired" });
    }
  }, [ms]);

  const logout = () => signOut({ callbackUrl: "/admin/login" });
  const logoutEverywhere = async () => {
    try {
      await axios.delete("/api/admin/me");
      toast.success("Signed out of all admin sessions");
    } catch { /* still sign out locally */ }
    signOut({ callbackUrl: "/admin/login" });
  };

  return (
    <AdminProvider user={user} expiresAt={expiresAt}>
      <div className="flex h-dvh overflow-hidden bg-slate-100">

        {/* ── Desktop / tablet sidebar ─────────────────────────────────────── */}
        <aside className="hidden md:flex md:w-20 lg:w-64 flex-col shrink-0 bg-slate-950 text-slate-300 transition-[width]">
          <div className="h-16 flex items-center px-4 lg:px-5 border-b border-white/5">
            <div className="hidden lg:block"><Logo /></div>
            <div className="lg:hidden mx-auto"><Logo compact /></div>
          </div>

          <nav className="flex-1 py-5 px-3 space-y-1 overflow-y-auto">
            <p className="hidden lg:block px-3 pb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">Manage</p>
            {nav.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  className={cx(
                    "relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors md:justify-center lg:justify-start",
                    active ? "bg-white/10 text-white" : "text-slate-400 hover:text-white hover:bg-white/5"
                  )}
                >
                  {active && <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full" style={{ background: BRAND }} />}
                  <Icon name={item.icon} className="w-4 h-4 shrink-0" style={{ color: active ? BRAND : undefined }} />
                  <span className="hidden lg:inline">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="p-3 border-t border-white/5 space-y-2">
            <div className="hidden lg:flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 text-[11px] text-slate-400">
              <Icon name={"schedule"} className="w-3 h-3" />
              Session ends in <span className="font-semibold text-slate-200">{remaining}</span>
            </div>
            <div className="flex items-center gap-3 p-2 rounded-xl md:justify-center lg:justify-start">
              <Avatar name={user.name ?? user.email} />
              <div className="hidden lg:block min-w-0 flex-1">
                <p className="text-sm font-semibold text-white truncate">{user.name ?? "Admin"}</p>
                <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
              </div>
            </div>
            <div className="hidden lg:flex gap-2">
              <Link href="/dashboard" className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-white/5">
                <Icon name={"arrow_back"} className="w-3 h-3" /> App
              </Link>
              <button onClick={logout} className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10">
                <Icon name={"logout"} className="w-3 h-3" /> Sign out
              </button>
            </div>
            <button onClick={logoutEverywhere} className="hidden lg:flex w-full items-center justify-center gap-2 py-1.5 rounded-lg text-[11px] text-slate-500 hover:text-red-300 hover:bg-red-500/10">
              <Icon name={"power_settings_new"} className="w-2.5 h-2.5" /> Sign out of all devices
            </button>
            <button onClick={logout} title="Sign out" className="lg:hidden w-full flex justify-center py-2 rounded-lg text-red-400 hover:bg-red-500/10">
              <Icon name={"logout"} className="w-4 h-4" />
            </button>
          </div>
        </aside>

        {/* ── Main column ──────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top bar */}
          <header className="h-14 md:h-16 flex items-center gap-3 px-4 sm:px-6 bg-white/90 backdrop-blur border-b border-slate-200/70 shrink-0 sticky top-0 z-30">
            <div className="md:hidden flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: BRAND }}>
                <Icon name={"admin_panel_settings"} className="w-3.5 h-3.5 text-white" />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-slate-400 leading-none hidden sm:block">Super Admin</p>
              <p className="text-sm md:text-base font-bold text-slate-900 truncate sm:mt-1">{current?.label ?? "Admin"}</p>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-500 bg-slate-100 rounded-full px-3 py-1.5 lg:hidden">
              <Icon name={"schedule"} className="w-3 h-3" /> {remaining}
            </div>
            <RoleBadge role={user.role} />
            <div className="md:hidden"><Avatar name={user.name ?? user.email} size="sm" /></div>
          </header>

          <main className="flex-1 overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
            {children}
          </main>
        </div>

        {/* ── Mobile bottom navigation ─────────────────────────────────────── */}
        <nav
          className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-slate-200 pb-[env(safe-area-inset-bottom)]"
          aria-label="Admin navigation"
        >
          <div className="grid h-16" style={{ gridTemplateColumns: `repeat(${bottomNav.length + 1}, minmax(0, 1fr))` }}>
            {bottomNav.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className="relative flex flex-col items-center justify-center gap-1 text-[10px] font-semibold"
                  style={{ color: active ? BRAND : "#64748b" }}
                >
                  {active && <span className="absolute top-0 h-0.5 w-8 rounded-b-full" style={{ background: BRAND }} />}
                  <span className={cx("w-10 h-7 flex items-center justify-center rounded-full transition-colors", active && "bg-green-50")}>
                    <Icon name={item.icon} className="w-[18px] h-[18px]" />
                  </span>
                  {item.short}
                </Link>
              );
            })}
            <button
              onClick={() => setMoreOpen(true)}
              className="flex flex-col items-center justify-center gap-1 text-[10px] font-semibold"
              style={{ color: overflowNav.some((n) => isActive(pathname, n.href)) || moreOpen ? BRAND : "#64748b" }}
            >
              <span className="w-10 h-7 flex items-center justify-center rounded-full">
                <Icon name={"more_horiz"} className="w-[18px] h-[18px]" />
              </span>
              More
            </button>
          </div>
        </nav>

        {/* ── Mobile "More" sheet ──────────────────────────────────────────── */}
        {moreOpen && (
          <div className="md:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="More">
            <div className="absolute inset-0 bg-slate-950/50 admin-fade" onClick={() => setMoreOpen(false)} />
            <div className="absolute bottom-0 inset-x-0 bg-white rounded-t-3xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] admin-pop space-y-3">
              <div className="mx-auto h-1 w-10 rounded-full bg-slate-200" />
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50">
                <Avatar name={user.name ?? user.email} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900 truncate">{user.name ?? "Admin"}</p>
                  <p className="text-xs text-slate-500 truncate">{user.email}</p>
                  <div className="mt-1.5 flex items-center gap-2"><RoleBadge role={user.role} />
                    <span className="text-[11px] text-slate-400"><Icon name={"schedule"} className="w-2.5 h-2.5" /> {remaining}</span>
                  </div>
                </div>
                <button onClick={() => setMoreOpen(false)} aria-label="Close" className="self-start w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200">
                  <Icon name={"close"} className="w-4 h-4" />
                </button>
              </div>
              <div className="divide-y divide-slate-100 rounded-2xl border border-slate-100 overflow-hidden">
                {overflowNav.map((item) => (
                  <SheetLink key={item.href} icon={item.icon} label={item.label} onClick={() => { setMoreOpen(false); router.push(item.href); }} />
                ))}
                <SheetLink icon={"arrow_back"} label="Back to app dashboard" onClick={() => { setMoreOpen(false); router.push("/dashboard"); }} />
                <SheetLink icon={"logout"} label="Sign out" danger onClick={logout} />
                <SheetLink icon={"power_settings_new"} label="Sign out of all devices" danger onClick={logoutEverywhere} />
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminProvider>
  );
}

function SheetLink({ icon, label, onClick, danger }: { icon: string; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={cx("w-full flex items-center gap-3 px-4 py-3.5 text-sm font-medium text-left bg-white active:bg-slate-50", danger ? "text-red-500" : "text-slate-700")}>
      <Icon name={icon} className="w-4 h-4 shrink-0" />
      {label}
    </button>
  );
}
