"use client";

import { useEffect } from "react";
import { Icon } from "@/components/ui/icon";
import { exitImpersonation } from "@/components/admin/impersonation-client";

export default function ImpersonationEndedPage() {
  useEffect(() => {
    void exitImpersonation();
  }, []);
  return (
    <div className="min-h-dvh flex items-center justify-center bg-slate-950 px-4 text-center text-white">
      <div>
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400/15">
          <Icon name="timer" className="w-6 h-6 text-amber-400" />
        </span>
        <h1 className="mt-4 text-lg font-bold">Login-as session ended</h1>
        <p className="mt-1 text-sm text-slate-400">Returning you to the admin panel…</p>
      </div>
    </div>
  );
}
