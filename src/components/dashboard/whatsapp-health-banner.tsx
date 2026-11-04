"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

interface Health { id: string; status: "ok" | "expiring" | "expired_or_invalid" | "unknown"; daysLeft: number | null }

/** Warns when a connected WhatsApp number's access token is expired/invalid or about to expire. */
export function WhatsappHealthBanner() {
  const { data } = useQuery({
    queryKey: ["whatsapp-health"],
    queryFn: () => axios.get("/api/settings/whatsapp/health").then((r) => r.data as { health: Health[] }),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const health = data?.health ?? [];
  const broken = health.filter((h) => h.status === "expired_or_invalid");
  const expiring = health.filter((h) => h.status === "expiring");
  if (broken.length === 0 && expiring.length === 0) return null;

  const red = broken.length > 0;
  const soonest = Math.min(...expiring.map((h) => h.daysLeft ?? 0));
  const text = red
    ? `${broken.length === 1 ? "A WhatsApp number's" : `${broken.length} WhatsApp numbers'`} access token has expired or is invalid. Messages can't be sent or received until you update it.`
    : `${expiring.length === 1 ? "A WhatsApp access token" : `${expiring.length} WhatsApp access tokens`} will expire ${soonest <= 0 ? "today" : `in ${soonest} day${soonest === 1 ? "" : "s"}`}. Replace it with a permanent System User token.`;

  return (
    <div role="alert" className={cn("flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border px-4 py-3.5 shadow-sm",
      red ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-800")}>
      <Icon name={red ? "error" : "warning"} className={cn("w-5 h-5 shrink-0", red ? "text-red-500" : "text-amber-500")} />
      <p className="flex-1 text-sm font-medium">{text}</p>
      <Link href="/settings?tab=whatsapp"
        className={cn("self-start sm:self-auto shrink-0 inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold text-white",
          red ? "bg-red-600 hover:bg-red-700" : "bg-amber-600 hover:bg-amber-700")}>
        <Icon name="key" className="w-4 h-4" /> Update token
      </Link>
    </div>
  );
}
