"use client";

import { Fragment, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { TemplateButton } from "./template-utils";

/** Renders WhatsApp inline formatting (*bold*, _italic_, ~strike~, ```mono```) without HTML injection. */
function formatInline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(```[^`]+```|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${keyBase}-${i++}`;
    if (tok.startsWith("```")) out.push(<code key={k} className="font-mono text-[12px]">{tok.slice(3, -3)}</code>);
    else if (tok[0] === "*") out.push(<strong key={k}>{tok.slice(1, -1)}</strong>);
    else if (tok[0] === "_") out.push(<em key={k}>{tok.slice(1, -1)}</em>);
    else out.push(<s key={k}>{tok.slice(1, -1)}</s>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Substitutes {{n}} with sample values (highlighted) and applies formatting. */
export function RichText({ text, examples = [], highlight = true }: { text: string; examples?: string[]; highlight?: boolean }) {
  const parts = text.split(/(\{\{\s*\d+\s*\}\})/g);
  return (
    <>
      {parts.map((p, i) => {
        const v = p.match(/^\{\{\s*(\d+)\s*\}\}$/);
        if (!v) return <Fragment key={i}>{formatInline(p, String(i))}</Fragment>;
        const ex = examples[Number(v[1]) - 1]?.trim();
        if (!highlight) return <Fragment key={i}>{ex || p}</Fragment>;
        return (
          <span key={i} className={cn("rounded px-0.5", ex ? "bg-green-100/80 text-green-900" : "bg-amber-100 text-amber-800 font-mono text-[11px]")}>
            {ex || p}
          </span>
        );
      })}
    </>
  );
}

const BTN_ICON: Record<string, string> = { URL: "language", PHONE_NUMBER: "smartphone", QUICK_REPLY: "chat", OTP: "content_copy", COPY_CODE: "content_copy" };
const MEDIA_ICON: Record<string, string> = { IMAGE: "image", VIDEO: "videocam", DOCUMENT: "description", LOCATION: "location_on" };

export interface PreviewProps {
  headerText?: string | null;
  mediaHeader?: string | null;
  body: string;
  footer?: string | null;
  buttons?: TemplateButton[];
  examples?: string[];
  businessName?: string;
  compact?: boolean;
}

/** WhatsApp-style message bubble, optionally inside a phone frame. */
export function MessageBubble({ headerText, mediaHeader, body, footer, buttons = [], examples, compact }: PreviewProps) {
  const [time] = useState(() => new Date().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }));
  // WhatsApp shows at most 3 buttons; the rest collapse into "See all options".
  const shown = buttons.length > 3 ? buttons.slice(0, 2) : buttons;
  return (
    <div className={cn("w-full self-end", compact ? "max-w-full" : "max-w-[92%]")}>
      <div className={cn("relative bg-[#d9fdd3] shadow-sm", buttons.length ? "rounded-t-xl rounded-tr-sm" : "rounded-xl rounded-tr-sm")}>
        <div className="px-2.5 pt-2 pb-1.5">
          {mediaHeader && (
            <div className="mb-1.5 h-24 rounded-lg bg-slate-200/70 flex flex-col items-center justify-center text-slate-500">
              <Icon name={MEDIA_ICON[mediaHeader] ?? "image"} className="w-7 h-7" />
              <span className="text-[10px] font-semibold mt-0.5">{mediaHeader.toLowerCase()}</span>
            </div>
          )}
          {headerText && <p className="text-[13.5px] font-bold text-slate-900 leading-snug mb-0.5 break-words"><RichText text={headerText} examples={examples} /></p>}
          <p className={cn("text-[13px] text-slate-800 whitespace-pre-wrap break-words leading-snug", compact && "line-clamp-6")}>
            {body ? <RichText text={body} examples={examples} /> : <span className="text-slate-400">Your message body appears here</span>}
          </p>
          {footer && <p className="mt-1 text-[11.5px] text-slate-500 leading-snug break-words">{footer}</p>}
          <p className="mt-0.5 flex items-center justify-end gap-0.5 text-[10px] text-slate-500">{time} <Icon name="done_all" className="w-3 h-3 text-sky-500" /></p>
        </div>
      </div>
      {buttons.length > 0 && (
        <div className="space-y-px">
          {shown.map((b, i) => (
            <div key={i} className={cn("bg-[#d9fdd3] border-t border-black/5 py-2 px-2 flex items-center justify-center gap-1.5 text-[13px] font-medium text-[#00a5f4]", i === shown.length - 1 && buttons.length <= 3 && "rounded-b-xl shadow-sm")}>
              <Icon name={BTN_ICON[b.type] ?? "chat"} className="w-3.5 h-3.5" />
              <span className="truncate">{b.text || "Button"}</span>
            </div>
          ))}
          {buttons.length > 3 && (
            <div className="bg-[#d9fdd3] border-t border-black/5 py-2 px-2 flex items-center justify-center gap-1.5 text-[13px] font-medium text-[#00a5f4] rounded-b-xl shadow-sm">
              <Icon name="menu" className="w-3.5 h-3.5" /> See all options
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function PhonePreview(props: PreviewProps) {
  return (
    <div className="mx-auto w-full max-w-[300px] rounded-[2rem] border-[7px] border-slate-900 bg-slate-900 shadow-xl overflow-hidden">
      <div className="flex items-center gap-2 bg-[#008069] px-3 py-2.5 text-white">
        <Icon name="arrow_back" className="w-4 h-4" />
        <span className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-[11px] font-bold">
          <Icon name="person" className="w-4 h-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold truncate leading-tight">{props.businessName ?? "Customer"}</p>
          <p className="text-[10px] text-white/75 leading-tight">Template preview</p>
        </div>
        <Icon name="more_horiz" className="w-4 h-4" />
      </div>
      <div className="bg-[#efeae2] px-2.5 py-3 min-h-[340px] flex flex-col">
        <span className="self-center mb-3 rounded-md bg-white/80 px-2 py-0.5 text-[10px] font-medium text-slate-500 shadow-sm">Today</span>
        <MessageBubble {...props} />
      </div>
    </div>
  );
}
