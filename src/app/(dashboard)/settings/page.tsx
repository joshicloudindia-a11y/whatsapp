"use client";

import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { WhatsAppSettings } from "@/components/settings/whatsapp-settings";
import { ApiKeysSettings } from "@/components/settings/api-keys-settings";
import { ProfileSettings } from "@/components/settings/profile-settings";
import { OrganizationSettings } from "@/components/settings/organization-settings";
import { TeamSettings } from "@/components/settings/team-settings";
import { SubscriptionSettings } from "@/components/settings/subscription-settings";
import { TeamsSettings } from "@/components/settings/teams-settings";
import { DevelopersSettings } from "@/components/settings/developers-settings";

type Tab = "profile" | "organization" | "team" | "teams" | "whatsapp" | "api-keys" | "developers" | "billing";

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  // The URL is the single source of truth for the active tab (deep links like ?tab=billing just work).
  const tab = ((searchParams.get("tab") as Tab | null) ?? "profile");
  const setTab = (t: Tab) => router.replace(`/settings?tab=${t}`, { scroll: false });
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const tabs: { id: Tab; label: string; icon: string; adminOnly?: boolean }[] = [
    { id: "profile",      label: "My Profile",      icon: "person" },
    { id: "organization", label: "Organization",    icon: "apartment" },
    { id: "team",         label: "Team",            icon: "group" },
    { id: "teams",        label: "Teams",           icon: "groups" },
    { id: "whatsapp",     label: "WhatsApp",        icon: "smartphone" },
    { id: "api-keys",     label: "API Keys",        icon: "key", adminOnly: true },
    { id: "developers",   label: "Developers",      icon: "code", adminOnly: true },
    { id: "billing",      label: "My Subscription", icon: "credit_card" },
  ];

  return (
    <div className="flex flex-col md:flex-row h-full min-h-0">
      <div className="md:w-52 border-b md:border-b-0 md:border-r bg-white p-2 md:p-3 flex md:block gap-1 md:space-y-0.5 overflow-x-auto no-scrollbar shrink-0" style={{ borderColor: "#e2e8f0" }}>
        {tabs
          .filter((t) => !t.adminOnly || isAdmin)
          .map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "shrink-0 md:w-full whitespace-nowrap text-left px-3 py-2 rounded-xl text-sm font-medium transition-colors inline-flex md:flex items-center gap-2.5",
                tab === t.id ? "bg-green-50 text-green-700" : "text-slate-600 hover:bg-slate-50"
              )}
            >
              <Icon name={t.icon} filled={tab === t.id} className={cn("w-[18px] h-[18px]", tab === t.id ? "text-green-600" : "text-slate-400")} />
              {t.label}
            </button>
          ))}
      </div>

      <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-auto bg-slate-50">
        {tab === "profile"      && <ProfileSettings />}
        {tab === "organization" && <OrganizationSettings />}
        {tab === "team"         && <TeamSettings />}
        {tab === "teams"        && <TeamsSettings />}
        {tab === "whatsapp"     && <WhatsAppSettings isAdmin={isAdmin} />}
        {tab === "api-keys"     && isAdmin && <ApiKeysSettings />}
        {tab === "developers"   && isAdmin && <DevelopersSettings />}
        {tab === "billing"      && <SubscriptionSettings />}
      </div>
    </div>
  );
}
