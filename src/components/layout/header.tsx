"use client";

import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

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
    <header
      className="h-16 flex items-center justify-between px-6 border-b bg-white shrink-0"
      style={{ borderColor: "#e2e8f0" }}
    >
      <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
      <div className="flex items-center gap-3">
        <span className="text-xs px-2 py-1 rounded-full font-medium bg-green-100 text-green-700">
          {session?.user?.role?.replace("_", " ") ?? "Agent"}
        </span>
        <div className="text-sm text-slate-500">{session?.user?.organizationSlug}</div>
      </div>
    </header>
  );
}
