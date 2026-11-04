"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import {
  LIMITS, STARTER_TEMPLATES, TRIGGER_META, TRIGGER_TYPES, parseKeywords, validateTrigger,
  type StarterTemplate, type TriggerType,
} from "./flow";

export interface BotSettings { name: string; description: string; triggerType: TriggerType; triggerValue: string }

export const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500 disabled:bg-slate-50";

export function Sheet({ title, subtitle, onClose, children, footer, wide }: {
  title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-slate-950/50 admin-fade" onClick={onClose} />
      <div className={cn("relative w-full max-h-[94dvh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white shadow-2xl admin-pop", wide ? "sm:max-w-2xl" : "sm:max-w-lg")}>
        <div className="flex items-start gap-3 px-5 py-4 border-b border-slate-100">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-slate-900">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
            <Icon name="close" className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-slate-100 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-3">{footer}</div>}
      </div>
    </div>
  );
}

export function TriggerFields({ value, onChange }: { value: BotSettings; onChange: (v: BotSettings) => void }) {
  const [draft, setDraft] = useState("");
  const keywords = parseKeywords(value.triggerValue);
  const setKeywords = (k: string[]) => onChange({ ...value, triggerValue: k.join(", ") });
  const addDraft = () => {
    const add = parseKeywords(draft);
    if (add.length) setKeywords([...new Set([...keywords, ...add])]);
    setDraft("");
  };
  const usesWords = value.triggerType === "KEYWORD" || value.triggerType === "TEMPLATE_RECEIVED";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {TRIGGER_TYPES.map((t) => (
          <button key={t} type="button" onClick={() => onChange({ ...value, triggerType: t })}
            className={cn("flex items-start gap-2.5 rounded-xl border p-3 text-left transition",
              value.triggerType === t ? "border-green-500 bg-green-50/60 ring-2 ring-green-500/20" : "border-slate-200 hover:border-slate-300")}>
            <span className={cn("w-8 h-8 shrink-0 rounded-lg flex items-center justify-center", value.triggerType === t ? "bg-[#25D366] text-white" : "bg-slate-100 text-slate-500")}>
              <Icon name={TRIGGER_META[t].icon} className="w-4 h-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-slate-900">{TRIGGER_META[t].label}</span>
              <span className="block text-[11px] text-slate-500 leading-snug">{TRIGGER_META[t].hint}</span>
            </span>
          </button>
        ))}
      </div>

      {usesWords && (
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-600">
            {value.triggerType === "KEYWORD" ? "Keywords" : "Button texts (optional — leave empty for any button)"}
          </label>
          <div className="flex gap-2">
            <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={60}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addDraft(); } }}
              placeholder={value.triggerType === "KEYWORD" ? "e.g. hi, menu, start" : "e.g. Yes, interested"} className={inputCls} />
            <button type="button" onClick={addDraft} className="shrink-0 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">Add</button>
          </div>
          {keywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {keywords.map((k) => (
                <span key={k} className="inline-flex items-center gap-1 rounded-full bg-slate-100 pl-2.5 pr-1 py-0.5 text-xs font-medium text-slate-700">
                  {k}
                  <button type="button" aria-label={`Remove ${k}`} onClick={() => setKeywords(keywords.filter((x) => x !== k))} className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-slate-200">
                    <Icon name="close" className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          {value.triggerType === "KEYWORD" && (
            <p className="text-[11px] text-slate-500">Case-insensitive. Matches when the message is a keyword or contains it as a whole word. A keyword restarts the bot even mid-conversation.</p>
          )}
        </div>
      )}
      {(value.triggerType === "ANY_MESSAGE" || value.triggerType === "NEW_CONVERSATION") && (
        <p className="flex gap-2 rounded-xl bg-slate-50 p-3 text-[11px] text-slate-600">
          <Icon name="info" className="w-4 h-4 shrink-0 text-slate-400" />
          Runs only while no agent is assigned to the chat.{value.triggerType === "ANY_MESSAGE" && " Restarts at most once every 15 minutes per contact."}
        </p>
      )}
    </div>
  );
}

/** Create (with starter templates) or edit a bot's name, description and trigger. */
export default function ChatbotSettingsModal({ mode, initial, initialTemplate, saving, onClose, onSubmit }: {
  mode: "create" | "edit";
  initial?: BotSettings;
  initialTemplate?: string;
  saving?: boolean;
  onClose: () => void;
  onSubmit: (v: BotSettings, template: StarterTemplate | null) => void;
}) {
  const [tplId, setTplId] = useState<string>(initialTemplate ?? "blank");
  const tpl0 = STARTER_TEMPLATES.find((t) => t.id === initialTemplate);
  const [v, setV] = useState<BotSettings>(initial ?? {
    name: tpl0?.name ?? "", description: tpl0?.description ?? "", triggerType: tpl0?.triggerType ?? "KEYWORD", triggerValue: tpl0?.triggerValue ?? "",
  });

  const pickTemplate = (id: string) => {
    setTplId(id);
    const t = STARTER_TEMPLATES.find((x) => x.id === id);
    if (t) setV({ name: v.name && !STARTER_TEMPLATES.some((x) => x.name === v.name) ? v.name : t.name, description: t.description, triggerType: t.triggerType, triggerValue: t.triggerValue });
  };

  const trigErr = validateTrigger(v.triggerType, v.triggerValue);
  const ok = v.name.trim().length >= 2;
  const submit = () => {
    if (!ok) return;
    onSubmit(v, STARTER_TEMPLATES.find((t) => t.id === tplId) ?? null);
  };

  return (
    <Sheet title={mode === "create" ? "New chatbot" : "Chatbot settings"} subtitle={mode === "create" ? "Start from scratch or from a ready-made flow." : "Name and when this bot starts."} onClose={onClose} wide
      footer={
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 sm:flex-none rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
          <div className="hidden sm:block flex-1" />
          <button type="button" disabled={!ok || saving} onClick={submit}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1fb857] disabled:opacity-50">
            {saving && <Icon name="refresh" className="w-4 h-4 animate-spin" />}
            {mode === "create" ? "Create & open builder" : "Save settings"}
          </button>
        </div>
      }>
      <div className="space-y-5">
        {mode === "create" && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-600">Start from</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[{ id: "blank", name: "Blank", icon: "add", color: "#64748b", description: "Empty flow" }, ...STARTER_TEMPLATES].map((t) => (
                <button key={t.id} type="button" onClick={() => (t.id === "blank" ? setTplId("blank") : pickTemplate(t.id))}
                  className={cn("rounded-xl border p-3 text-left transition", tplId === t.id ? "border-green-500 ring-2 ring-green-500/20 bg-green-50/50" : "border-slate-200 hover:border-slate-300")}>
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${t.color}18`, color: t.color }}><Icon name={t.icon} className="w-4 h-4" /></span>
                  <span className="mt-2 block text-sm font-semibold text-slate-900">{t.name}</span>
                  <span className="block text-[11px] text-slate-500 leading-snug line-clamp-2">{t.description}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">Name</label>
            <input autoFocus={mode === "create"} value={v.name} maxLength={LIMITS.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Customer support bot" className={inputCls} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">Description <span className="font-normal text-slate-400">(optional)</span></label>
            <input value={v.description} maxLength={LIMITS.description} onChange={(e) => setV({ ...v, description: e.target.value })} placeholder="What this bot does" className={inputCls} />
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-600">Starts when</p>
          <TriggerFields value={v} onChange={setV} />
          {trigErr && <p className="text-[11px] text-amber-600 flex items-center gap-1"><Icon name="warning" className="w-3.5 h-3.5" /> {trigErr} The bot can be saved, but not activated yet.</p>}
        </div>
      </div>
    </Sheet>
  );
}
