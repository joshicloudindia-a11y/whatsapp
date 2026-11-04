"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Icon } from "@/components/ui/icon";
import { cn, getInitials } from "@/lib/utils";

export function WAIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="white" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

interface NavItem { href: string; icon: string; label: string; short: string; adminOnly: boolean }

const NAV: { label: string; items: NavItem[] }[] = [
  {
    label: "Main",
    items: [
      { href: "/dashboard", icon: "dashboard", label: "Dashboard", short: "Home",     adminOnly: false },
      { href: "/inbox",     icon: "forum",     label: "Inbox",     short: "Inbox",    adminOnly: false },
      { href: "/contacts",  icon: "contacts",  label: "Contacts",  short: "Contacts", adminOnly: false },
    ],
  },
  {
    label: "Engagement",
    items: [
      { href: "/broadcasts", icon: "campaign",    label: "Broadcasts", short: "Send",      adminOnly: false },
      { href: "/templates",  icon: "description", label: "Templates",  short: "Templates", adminOnly: false },
      { href: "/chatbots",   icon: "smart_toy",   label: "Chatbots",   short: "Bots",      adminOnly: false },
      { href: "/automation", icon: "bolt",        label: "Automation", short: "Automate",  adminOnly: false },
      { href: "/growth",     icon: "rocket_launch", label: "Growth tools", short: "Growth",  adminOnly: false },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/analytics", icon: "monitoring", label: "Analytics", short: "Analytics", adminOnly: true },
      { href: "/settings",  icon: "settings",   label: "Settings",  short: "Settings",  adminOnly: true },
    ],
  },
];

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + "/");

function useNav() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const sections = NAV.map((s) => ({ ...s, items: s.items.filter((i) => !i.adminOnly || isAdmin) })).filter((s) => s.items.length);
  const showAdmin = !!session?.user?.isSuperAdmin;
  return { session, sections, flat: sections.flatMap((s) => s.items), showAdmin };
}

// ─── Desktop / tablet sidebar ────────────────────────────────────────────────
// Hidden on phones (bottom nav there), icon rail on tablets, full sidebar on desktop.
export function Sidebar() {
  const pathname = usePathname();
  const { session, sections, showAdmin } = useNav();

  return (
    <aside className="hidden md:flex md:w-[72px] lg:w-64 flex-col border-r border-slate-200 bg-white shrink-0">
      <div className="h-16 flex items-center gap-3 px-4 lg:px-5 border-b border-slate-200 md:justify-center lg:justify-start">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-[#25D366] shadow-md shadow-green-500/25 shrink-0">
          <WAIcon />
        </div>
        <span className="hidden lg:inline font-bold text-slate-900 text-base">ChatFlow</span>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
        {sections.map((section) => (
          <div key={section.label}>
            <p className="hidden lg:block px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.label}
                    className={cn(
                      "relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors md:justify-center lg:justify-start",
                      active ? "bg-green-50 text-green-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    )}
                  >
                    {active && <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-[#25D366]" />}
                    <Icon name={item.icon} filled={active} className={cn("w-[18px] h-[18px]", active ? "text-green-600" : "text-slate-400")} />
                    <span className="hidden lg:inline">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {showAdmin && (
        <div className="px-3 pb-2">
          <Link
            href="/admin"
            title="Super Admin Panel"
            className="flex items-center justify-center lg:justify-start gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800"
          >
            <Icon name="admin_panel_settings" className="w-4 h-4" />
            <span className="hidden lg:inline">Super Admin Panel</span>
          </Link>
        </div>
      )}

      <div className="border-t border-slate-200 p-3">
        <div className="flex items-center gap-3 md:flex-col lg:flex-row">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 bg-gradient-to-br from-green-400 to-emerald-600">
            {getInitials(session?.user?.name)}
          </div>
          <div className="hidden lg:block flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">{session?.user?.name ?? "User"}</p>
            <p className="text-xs text-slate-400 truncate">{session?.user?.email}</p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500"
            title="Sign out"
            aria-label="Sign out"
          >
            <Icon name="logout" className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

// ─── Phone bottom navigation + "More" sheet ──────────────────────────────────
const BOTTOM = ["/dashboard", "/inbox", "/contacts", "/broadcasts"];

export function MobileNav() {
  const pathname = usePathname();
  const { session, flat, showAdmin } = useNav();
  const [open, setOpen] = useState(false);
  const primary = flat.filter((i) => BOTTOM.includes(i.href));
  const rest = flat.filter((i) => !BOTTOM.includes(i.href));
  const moreActive = rest.some((i) => isActive(pathname, i.href));

  return (
    <>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-slate-200 pb-[env(safe-area-inset-bottom)]" aria-label="Main navigation">
        <div className="grid grid-cols-5 h-16">
          {primary.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
                className={cn("relative flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold", active ? "text-green-600" : "text-slate-500")}>
                {active && <span className="absolute top-0 h-0.5 w-8 rounded-b-full bg-[#25D366]" />}
                <span className={cn("w-12 h-7 flex items-center justify-center rounded-full transition-colors", active && "bg-green-50")}>
                  <Icon name={item.icon} filled={active} className="w-5 h-5" />
                </span>
                {item.short}
              </Link>
            );
          })}
          <button onClick={() => setOpen(true)} className={cn("flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold", moreActive || open ? "text-green-600" : "text-slate-500")}>
            <span className="w-12 h-7 flex items-center justify-center rounded-full"><Icon name="menu" className="w-5 h-5" /></span>
            More
          </button>
        </div>
      </nav>

      {open && (
        <div className="md:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="More">
          <div className="absolute inset-0 bg-slate-950/50 admin-fade" onClick={() => setOpen(false)} />
          <div className="absolute bottom-0 inset-x-0 bg-white rounded-t-3xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] admin-pop space-y-4 max-h-[85dvh] overflow-y-auto">
            <div className="mx-auto h-1 w-10 rounded-full bg-slate-200" />
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50">
              <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold text-white bg-gradient-to-br from-green-400 to-emerald-600">
                {getInitials(session?.user?.name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-900 truncate">{session?.user?.name ?? "User"}</p>
                <p className="text-xs text-slate-500 truncate">{session?.user?.email}</p>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close" className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-200">
                <Icon name="close" className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {rest.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link key={item.href} href={item.href} onClick={() => setOpen(false)}
                    className={cn("flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-xs font-semibold",
                      active ? "border-green-200 bg-green-50 text-green-700" : "border-slate-100 text-slate-600 active:bg-slate-50")}>
                    <Icon name={item.icon} filled={active} className="w-5 h-5" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
            <div className="divide-y divide-slate-100 rounded-2xl border border-slate-100 overflow-hidden">
              {showAdmin && (
                <Link href="/admin" onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-3.5 text-sm font-medium text-slate-700">
                  <Icon name="admin_panel_settings" className="w-4 h-4" /> Super Admin Panel
                </Link>
              )}
              <button onClick={() => signOut({ callbackUrl: "/login" })} className="w-full flex items-center gap-3 px-4 py-3.5 text-sm font-medium text-red-500 text-left">
                <Icon name="logout" className="w-4 h-4" /> Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
