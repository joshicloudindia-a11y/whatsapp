"use client";

import { Icon } from "@/components/ui/icon";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#1ebe5a]"
    >
      <Icon name="print" className="w-[18px] h-[18px]" /> Print / Save as PDF
    </button>
  );
}
