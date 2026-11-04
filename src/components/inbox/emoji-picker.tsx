"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { EMOJI_CATEGORIES } from "./emoji-data";
import { pushRecentEmoji, useRecentEmoji } from "./chat-prefs";

/** [chat] Compact categorized emoji picker (no dependencies). Escape / outside click closes. */
export function EmojiPicker({ onPick, onClose, triggerRef, className }: {
  onPick: (emoji: string) => void; onClose: () => void; triggerRef?: RefObject<HTMLElement | null>; className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const recent = useRecentEmoji();
  const [tab, setTab] = useState<string>("smileys");
  const active = tab === "recent" ? { id: "recent", label: "Recently used", emojis: recent } : EMOJI_CATEGORIES.find((c) => c.id === tab) ?? EMOJI_CATEGORIES[0];

  useEffect(() => {
    const trigger = triggerRef?.current;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || trigger?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); trigger?.focus(); } };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLElement>("[data-emoji]")?.focus({ preventScroll: true });
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [onClose, triggerRef]);

  const pick = (e: string) => { pushRecentEmoji(e); onPick(e); };

  return (
    <div ref={ref} role="dialog" aria-label="Emoji picker"
      className={cn("z-[56] w-[min(20rem,calc(100vw-1rem))] rounded-2xl border border-slate-200 bg-white shadow-xl admin-pop overflow-hidden", className)}>
      <div role="tablist" aria-label="Emoji categories" className="flex items-center gap-0.5 border-b border-slate-100 px-1.5 py-1 overflow-x-auto no-scrollbar">
        {recent.length > 0 && (
          <button role="tab" aria-selected={tab === "recent"} aria-label="Recently used" title="Recently used" onClick={() => setTab("recent")}
            className={cn("w-8 h-8 shrink-0 flex items-center justify-center rounded-lg", tab === "recent" ? "bg-green-50 text-green-700" : "text-slate-400 hover:bg-slate-100")}>
            <Icon name="history" className="w-4 h-4" />
          </button>
        )}
        {EMOJI_CATEGORIES.map((c) => (
          <button key={c.id} role="tab" aria-selected={tab === c.id} aria-label={c.label} title={c.label} onClick={() => setTab(c.id)}
            className={cn("w-8 h-8 shrink-0 flex items-center justify-center rounded-lg", tab === c.id ? "bg-green-50 text-green-700" : "text-slate-400 hover:bg-slate-100")}>
            <Icon name={c.icon} className="w-4 h-4" />
          </button>
        ))}
      </div>
      <p className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{active.label}</p>
      <div role="tabpanel" className="grid grid-cols-8 gap-0.5 p-2 max-h-56 overflow-y-auto">
        {active.emojis.map((e, i) => (
          <button key={`${e}-${i}`} data-emoji type="button" onClick={() => pick(e)} aria-label={e}
            className="h-9 rounded-lg text-[22px] leading-none hover:bg-slate-100 focus:outline-none focus:bg-slate-100">
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
