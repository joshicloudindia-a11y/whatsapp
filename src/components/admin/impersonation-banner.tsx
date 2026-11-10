"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { exitImpersonation } from "@/components/admin/impersonation-client";

/** Shown across the app while a Super Admin is signed in as this user. */
export function ImpersonationBanner({ userLabel, adminLabel, expiresAt }: { userLabel: string; adminLabel: string; expiresAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  const [leaving, setLeaving] = useState(false);
  const exited = useRef(false);

  const leave = () => {
    if (exited.current) return;
    exited.current = true;
    setLeaving(true);
    void exitImpersonation();
  };

  useEffect(() => {
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= expiresAt && !exited.current) {
        exited.current = true;
        setLeaving(true);
        void exitImpersonation();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [expiresAt]);

  const left = Math.max(0, Math.floor((expiresAt - now) / 1000));
  const mm = Math.floor(left / 60), ss = String(left % 60).padStart(2, "0");

  return (
    <div role="status" className="shrink-0 z-50 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-amber-400 px-3 py-2 text-amber-950 sm:px-4">
      <p className="flex min-w-0 items-center gap-2 text-xs font-medium sm:text-sm">
        <Icon name="visibility" className="w-4 h-4 shrink-0" />
        <span className="min-w-0">
          Viewing as <b className="font-semibold">{userLabel}</b>
          <span className="hidden sm:inline"> · signed in by {adminLabel}</span>
          <span className="tabular-nums"> · {mm}:{ss} left</span>
        </span>
      </p>
      <button onClick={leave} disabled={leaving}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-950 px-3 py-1.5 text-xs font-semibold text-amber-50 hover:bg-amber-900 disabled:opacity-70">
        {leaving ? <span className="w-3.5 h-3.5 rounded-full border-2 border-amber-50 border-t-transparent animate-spin" /> : <Icon name="logout" className="w-3.5 h-3.5" />}
        {leaving ? "Returning…" : "Exit to admin"}
      </button>
    </div>
  );
}
