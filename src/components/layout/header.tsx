"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Icon } from "@/components/ui/icon";
import { WAIcon } from "@/components/layout/sidebar";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/inbox": "Team Inbox",
  "/contacts": "Contacts",
  "/broadcasts": "Broadcasts",
  "/templates": "Message Templates",
  "/chatbots": "Chatbot Builder",
  "/automation": "Automation",
  "/analytics": "Analytics",
  "/settings": "Settings",
};

export function Header() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const title = Object.entries(PAGE_TITLES).find(([path]) => pathname.startsWith(path))?.[1] ?? "ChatFlow";

  return (
    <header className="h-14 md:h-16 flex items-center gap-3 px-4 sm:px-6 border-b border-slate-200 bg-white/90 backdrop-blur shrink-0 sticky top-0 z-30">
      <Link href="/dashboard" className="md:hidden w-8 h-8 rounded-xl flex items-center justify-center bg-[#25D366] shrink-0" aria-label="ChatFlow home">
        <WAIcon className="w-4 h-4" />
      </Link>
      <h1 className="flex-1 min-w-0 text-base md:text-lg font-semibold text-slate-900 truncate">{title}</h1>
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {session?.user?.organizationSlug && (
          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-slate-500 bg-slate-100 rounded-full px-2.5 py-1 max-w-[180px]">
            <Icon name="apartment" className="w-3 h-3" />
            <span className="truncate">{session.user.organizationSlug}</span>
          </span>
        )}
        <span className="text-[11px] px-2 py-1 rounded-full font-semibold bg-green-100 text-green-700 whitespace-nowrap">
          {session?.user?.role?.replace(/_/g, " ") ?? "Agent"}
        </span>
      </div>
    </header>
  );
}
