"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export interface MenuItem {
  id: string;
  label: string;
  icon: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  hint?: string;
}

/**
 * [chat] Accessible popover menu: role="menu", arrow keys / Home / End move focus, Escape and
 * outside clicks close it and focus returns to the trigger. On phones it becomes a bottom sheet.
 */
export function PopoverMenu({
  open, onClose, items, label, header, triggerRef, align = "right", placement = "below", sheetOnMobile = true, className,
}: {
  open: boolean; onClose: () => void; items: MenuItem[]; label: string; header?: ReactNode;
  triggerRef?: RefObject<HTMLElement | null>; align?: "left" | "right"; placement?: "below" | "above"; sheetOnMobile?: boolean; className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])');
    first?.focus({ preventScroll: true });
    const trigger = triggerRef?.current;
    const close = () => { onClose(); trigger?.focus({ preventScroll: true }); };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (el?.contains(t) || trigger?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); close(); }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open, onClose, triggerRef]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    const list = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])];
    if (!list.length) return;
    const i = list.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (e.key === "ArrowDown") next = (i + 1) % list.length;
    else if (e.key === "ArrowUp") next = (i - 1 + list.length) % list.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = list.length - 1;
    else if (e.key === "Tab") { onClose(); return; }
    if (next >= 0) { e.preventDefault(); list[next].focus(); }
  };

  return (
    <>
      {sheetOnMobile && <div className="sm:hidden fixed inset-0 z-[55] bg-slate-950/30 admin-fade" aria-hidden onClick={onClose} />}
      <div ref={ref} role="menu" aria-label={label} onKeyDown={onKeyDown}
        className={cn(
          "z-[56] min-w-[200px] rounded-2xl border border-slate-200 bg-white py-1.5 shadow-xl admin-pop",
          sheetOnMobile
            ? "fixed inset-x-0 bottom-0 rounded-b-none pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:pb-1.5 sm:rounded-2xl sm:absolute sm:inset-x-auto sm:bottom-auto"
            : "absolute",
          sheetOnMobile ? (placement === "above" ? "sm:bottom-full sm:mb-1" : "sm:top-full sm:mt-1") : placement === "above" ? "bottom-full mb-1" : "top-full mt-1",
          align === "right" ? (sheetOnMobile ? "sm:right-0" : "right-0") : (sheetOnMobile ? "sm:left-0" : "left-0"),
          className,
        )}>
        {header}
        {items.map((it) => (
          <button key={it.id} type="button" role="menuitem" disabled={it.disabled} title={it.hint}
            onClick={() => { onClose(); it.onSelect(); }}
            className={cn("w-full flex items-center gap-3 px-4 py-2.5 sm:py-2 text-left text-sm focus:outline-none focus:bg-slate-100 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none",
              it.danger ? "text-red-600" : "text-slate-700")}>
            <Icon name={it.icon} className={cn("w-4 h-4 shrink-0", it.danger ? "text-red-500" : "text-slate-500")} />
            <span className="flex-1 min-w-0 truncate">{it.label}</span>
          </button>
        ))}
      </div>
    </>
  );
}
