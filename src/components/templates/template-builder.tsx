"use client";

import { useMemo, useRef, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { PhonePreview } from "./template-preview";
import {
  LIMITS, TEMPLATE_LANGUAGES, authBodyText, authFooterText, normalizeName, validateDraft, variablesOf,
  type TemplateButton, type TemplateCategoryT, type TemplateDraft,
} from "./template-utils";

export interface BuilderAccount { id: string; displayName: string; phoneNumber: string }

const input = "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500 disabled:bg-slate-50 disabled:text-slate-500";
const errMsg = (e: unknown, f = "Something went wrong") => (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? f;

const CATEGORY_INFO: { value: TemplateCategoryT; label: string; icon: string; desc: string }[] = [
  { value: "MARKETING", label: "Marketing", icon: "campaign", desc: "Offers, announcements, re-engagement" },
  { value: "UTILITY", label: "Utility", icon: "task_alt", desc: "Order updates, alerts, reminders" },
  { value: "AUTHENTICATION", label: "Authentication", icon: "key", desc: "One-time passcodes" },
];

const BUTTON_KINDS: { type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER"; label: string; icon: string }[] = [
  { type: "QUICK_REPLY", label: "Quick reply", icon: "chat" },
  { type: "URL", label: "Visit website", icon: "language" },
  { type: "PHONE_NUMBER", label: "Call phone", icon: "smartphone" },
];

function Counter({ n, max }: { n: number; max: number }) {
  return <span className={cn("text-[11px] tabular-nums", n > max ? "text-red-500 font-semibold" : "text-slate-400")}>{n}/{max}</span>;
}

function Section({ title, hint, children, right }: { title: string; hint?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">{title}</h4>
          {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

export function TemplateBuilder({
  initial, templateId, lockIdentity, accounts, onClose, onSaved,
}: {
  initial: TemplateDraft;
  /** Set when editing an existing template. */
  templateId?: string;
  /** Name and language can't change once Meta knows the template. */
  lockIdentity?: boolean;
  accounts: BuilderAccount[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [d, setD] = useState<TemplateDraft>(initial);
  const [id, setId] = useState<string | undefined>(templateId);
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [busy, setBusy] = useState<"draft" | "submit" | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [touched, setTouched] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const set = <K extends keyof TemplateDraft>(k: K, v: TemplateDraft[K]) => setD((p) => ({ ...p, [k]: v }));
  const isAuth = d.category === "AUTHENTICATION";
  const vars = useMemo(() => variablesOf(d.body), [d.body]);
  const problem = validateDraft(d);
  const counts = {
    url: d.buttons.filter((b) => b.type === "URL").length,
    phone: d.buttons.filter((b) => b.type === "PHONE_NUMBER").length,
  };

  const preview = isAuth
    ? { body: authBodyText(d.auth), footer: authFooterText(d.auth), buttons: [{ type: "OTP", text: d.auth.copyButtonText || "Copy code" }] as TemplateButton[], examples: ["123456"] }
    : { headerText: d.headerText, body: d.body, footer: d.footer, buttons: d.buttons, examples: d.examples };

  const wrapSelection = (left: string, right = left) => {
    const el = bodyRef.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e, value } = el;
    const next = value.slice(0, s) + left + value.slice(s, e) + right + value.slice(e);
    set("body", next.slice(0, LIMITS.body + 50));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + left.length, e + left.length); });
  };

  const insertVariable = () => {
    const el = bodyRef.current;
    const n = (vars.length ? Math.max(...vars) : 0) + 1;
    const token = `{{${n}}}`;
    const pos = el ? el.selectionStart : d.body.length;
    const next = d.body.slice(0, pos) + token + d.body.slice(el ? el.selectionEnd : pos);
    set("body", next);
    requestAnimationFrame(() => { if (el) { el.focus(); el.setSelectionRange(pos + token.length, pos + token.length); } });
  };

  const setExample = (n: number, v: string) => setD((p) => { const ex = [...p.examples]; ex[n - 1] = v; return { ...p, examples: ex }; });
  const addButton = (type: (typeof BUTTON_KINDS)[number]["type"]) =>
    set("buttons", [...d.buttons, type === "URL" ? { type, text: "", url: "https://" } : type === "PHONE_NUMBER" ? { type, text: "", phone_number: "+91" } : { type, text: "" }]);
  const updateButton = (i: number, patch: Record<string, string>) =>
    set("buttons", d.buttons.map((b, j) => (j === i ? ({ ...b, ...patch } as TemplateButton) : b)));
  const removeButton = (i: number) => set("buttons", d.buttons.filter((_, j) => j !== i));

  const save = async (submit: boolean) => {
    setTouched(true);
    if (problem) { toast.error(problem); return; }
    setBusy(submit ? "submit" : "draft");
    setSubmitError(null);
    try {
      const payload = { ...d, submit, accountId: accountId || undefined };
      const r = id ? await axios.patch(`/api/templates/${id}`, payload) : await axios.post("/api/templates", payload);
      const saved = r.data.template as { id: string; status: string };
      setId(saved.id);
      if (submit && r.data.submitError) {
        // Saved locally; keep the builder open so the user can fix and retry.
        setSubmitError(r.data.submitError);
        toast.error("Meta didn't accept the template — see the details in the builder");
        onSaved();
        return;
      }
      toast.success(submit ? (saved.status === "APPROVED" ? "Template approved by Meta" : "Submitted to Meta for review") : "Draft saved");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const languages = TEMPLATE_LANGUAGES.some((l) => l.code === d.language) ? TEMPLATE_LANGUAGES : [{ code: d.language, label: d.language }, ...TEMPLATE_LANGUAGES];

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label="Template builder">
      <div className="absolute inset-0 bg-slate-950/50 admin-fade" onClick={onClose} />
      <div className="relative w-full sm:max-w-5xl max-h-[94dvh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white shadow-2xl admin-pop">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <span className="w-9 h-9 rounded-xl bg-green-50 text-green-600 flex items-center justify-center shrink-0"><Icon name="description" className="w-5 h-5" /></span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-slate-900 truncate">{id ? "Edit template" : "New template"}</h3>
            <p className="text-[11px] text-slate-500 truncate">Templates are reviewed by Meta, usually within minutes.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"><Icon name="close" className="w-4 h-4" /></button>
        </div>

        {/* Mobile edit/preview switch */}
        <div className="lg:hidden px-5 pt-3">
          <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
            {(["edit", "preview"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={cn("flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg", tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}>
                <Icon name={t === "edit" ? "edit" : "visibility"} className="w-3.5 h-3.5" /> {t === "edit" ? "Edit" : "Preview"}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className={cn("space-y-6 min-w-0", tab === "preview" && "hidden lg:block")}>
              {submitError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 flex gap-2.5">
                  <Icon name="error" className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                  <div className="text-xs text-red-700"><p className="font-semibold">Saved as draft, but Meta didn&apos;t accept it</p><p className="mt-0.5 break-words">{submitError}</p></div>
                </div>
              )}

              {/* Basics */}
              <Section title="Basics">
                <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
                  <label className="block space-y-1.5">
                    <span className="flex items-center justify-between text-xs font-semibold text-slate-600">Template name <Counter n={d.name.length} max={LIMITS.name} /></span>
                    <input className={cn(input, "font-mono")} value={d.name} disabled={lockIdentity} maxLength={LIMITS.name}
                      onChange={(e) => set("name", normalizeName(e.target.value))} placeholder="order_confirmation" autoFocus={!lockIdentity} />
                    <span className="block text-[11px] text-slate-400">{lockIdentity ? "Name can't change after submission." : "Lowercase letters, numbers and underscores only."}</span>
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold text-slate-600">Language</span>
                    <select className={input} value={d.language} disabled={lockIdentity} onChange={(e) => set("language", e.target.value)}>
                      {languages.map((l) => <option key={l.code} value={l.code}>{l.label} ({l.code})</option>)}
                    </select>
                  </label>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {CATEGORY_INFO.map((c) => (
                    <button key={c.value} type="button" onClick={() => set("category", c.value)}
                      className={cn("text-left rounded-xl border-2 p-3 transition", d.category === c.value ? "border-green-500 bg-green-50/40" : "border-slate-200 hover:border-slate-300")}>
                      <div className="flex items-center gap-2">
                        <Icon name={c.icon} className={cn("w-4 h-4", d.category === c.value ? "text-green-600" : "text-slate-500")} />
                        <p className="text-sm font-semibold text-slate-900">{c.label}</p>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500 leading-snug">{c.desc}</p>
                    </button>
                  ))}
                </div>
              </Section>

              {isAuth ? (
                <Section title="Authentication message" hint="Meta fixes the wording of OTP templates. The code is filled in when you send.">
                  <div className="rounded-xl border border-slate-200 p-3.5 space-y-3">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input type="checkbox" className="mt-0.5 w-4 h-4 accent-green-600" checked={d.auth.securityRecommendation}
                        onChange={(e) => set("auth", { ...d.auth, securityRecommendation: e.target.checked })} />
                      <span><span className="block text-sm font-semibold text-slate-800">Add security recommendation</span><span className="block text-[11px] text-slate-500">Appends &ldquo;For your security, do not share this code.&rdquo;</span></span>
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block space-y-1.5">
                        <span className="text-xs font-semibold text-slate-600">Code expires after (minutes)</span>
                        <input type="number" min={1} max={90} className={input} value={d.auth.codeExpiryMinutes ?? ""} placeholder="No expiry note"
                          onChange={(e) => set("auth", { ...d.auth, codeExpiryMinutes: e.target.value === "" ? null : Math.round(Number(e.target.value)) })} />
                      </label>
                      <label className="block space-y-1.5">
                        <span className="flex items-center justify-between text-xs font-semibold text-slate-600">Copy-code button <Counter n={d.auth.copyButtonText.length} max={LIMITS.buttonText} /></span>
                        <input className={input} value={d.auth.copyButtonText} maxLength={LIMITS.buttonText + 5}
                          onChange={(e) => set("auth", { ...d.auth, copyButtonText: e.target.value })} />
                      </label>
                    </div>
                  </div>
                </Section>
              ) : (
                <>
                  {/* Header */}
                  <Section title="Header" hint="Optional bold title shown above the message."
                    right={<div className="flex gap-1 p-0.5 bg-slate-100 rounded-lg">
                      {(["None", "Text"] as const).map((h) => {
                        const on = (h === "Text") === (d.headerText !== "");
                        return <button key={h} type="button" onClick={() => set("headerText", h === "Text" ? d.headerText || " " : "")}
                          className={cn("px-2.5 py-1 text-[11px] font-semibold rounded-md", on ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}>{h}</button>;
                      })}
                    </div>}>
                    {d.headerText !== "" && (
                      <div className="space-y-1">
                        <input className={input} value={d.headerText.trimStart()} maxLength={LIMITS.header + 10} placeholder="Your order is confirmed"
                          onChange={(e) => set("headerText", e.target.value || " ")} />
                        <div className="flex justify-end"><Counter n={d.headerText.trim().length} max={LIMITS.header} /></div>
                      </div>
                    )}
                  </Section>

                  {/* Body */}
                  <Section title="Body" hint="Use variables for details that change per customer, like names or order numbers.">
                    <div className="rounded-xl border border-slate-200 focus-within:ring-2 focus-within:ring-green-500/30 focus-within:border-green-500 overflow-hidden">
                      <div className="flex items-center gap-1 border-b border-slate-100 bg-slate-50/60 px-2 py-1.5">
                        <button type="button" onClick={() => wrapSelection("*")} className="w-7 h-7 rounded-md text-sm font-bold text-slate-600 hover:bg-white" title="Bold">B</button>
                        <button type="button" onClick={() => wrapSelection("_")} className="w-7 h-7 rounded-md text-sm italic font-serif text-slate-600 hover:bg-white" title="Italic">I</button>
                        <button type="button" onClick={() => wrapSelection("~")} className="w-7 h-7 rounded-md text-sm line-through text-slate-600 hover:bg-white" title="Strikethrough">S</button>
                        <button type="button" onClick={() => wrapSelection("```")} className="w-7 h-7 rounded-md text-slate-600 hover:bg-white flex items-center justify-center" title="Monospace"><Icon name="code" className="w-4 h-4" /></button>
                        <span className="flex-1" />
                        <button type="button" onClick={insertVariable} className="inline-flex items-center gap-1 rounded-lg bg-white border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:border-green-500 hover:text-green-700">
                          <Icon name="add" className="w-3.5 h-3.5" /> Add variable
                        </button>
                      </div>
                      <textarea ref={bodyRef} value={d.body} onChange={(e) => set("body", e.target.value)} rows={6}
                        placeholder={"Hi {{1}}, your order {{2}} has been shipped and will arrive by {{3}}. Thank you for shopping with us!"}
                        className="block w-full resize-y min-h-[140px] px-3.5 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none" />
                    </div>
                    <div className="flex justify-end"><Counter n={d.body.length} max={LIMITS.body} /></div>
                    {vars.length > 0 && (
                      <div className="rounded-xl bg-amber-50/60 border border-amber-100 p-3 space-y-2">
                        <p className="text-[11px] font-semibold text-amber-800 flex items-center gap-1"><Icon name="info" className="w-3.5 h-3.5" /> Sample values (required by Meta for review)</p>
                        {vars.map((n) => (
                          <div key={n} className="grid grid-cols-[52px_1fr] items-center gap-2">
                            <span className="text-xs font-mono font-bold text-slate-700">{`{{${n}}}`}</span>
                            <input className={cn(input, "py-2", touched && !(d.examples[n - 1] ?? "").trim() && "border-red-300")} value={d.examples[n - 1] ?? ""} maxLength={LIMITS.example}
                              onChange={(e) => setExample(n, e.target.value)} placeholder={n === 1 ? "Rahul" : n === 2 ? "#ORD-1042" : "Sample value"} />
                          </div>
                        ))}
                      </div>
                    )}
                  </Section>

                  {/* Footer */}
                  <Section title="Footer" hint="Optional small grey text, e.g. an opt-out line.">
                    <input className={input} value={d.footer} maxLength={LIMITS.footer + 10} placeholder="Reply STOP to unsubscribe" onChange={(e) => set("footer", e.target.value)} />
                    <div className="flex justify-end"><Counter n={d.footer.length} max={LIMITS.footer} /></div>
                  </Section>

                  {/* Buttons */}
                  <Section title="Buttons" hint={`Optional. Up to ${LIMITS.buttons} buttons — max ${LIMITS.urlButtons} website and ${LIMITS.phoneButtons} phone.`}>
                    {d.buttons.length > 0 && (
                      <ul className="space-y-2">
                        {d.buttons.map((b, i) => {
                          const kind = BUTTON_KINDS.find((k) => k.type === b.type);
                          return (
                            <li key={i} className="rounded-xl border border-slate-200 p-3">
                              <div className="flex items-center gap-2 mb-2">
                                <Icon name={kind?.icon ?? "chat"} className="w-4 h-4 text-slate-500" />
                                <span className="text-xs font-semibold text-slate-700 flex-1">{kind?.label ?? b.type}</span>
                                <button type="button" onClick={() => removeButton(i)} aria-label="Remove button" className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500"><Icon name="delete" className="w-4 h-4" /></button>
                              </div>
                              <div className={cn("grid gap-2", b.type !== "QUICK_REPLY" && "sm:grid-cols-[180px_1fr]")}>
                                <input className={cn(input, "py-2")} value={b.text ?? ""} maxLength={LIMITS.buttonText} placeholder="Button label" onChange={(e) => updateButton(i, { text: e.target.value })} />
                                {b.type === "URL" && <input className={cn(input, "py-2")} value={String(b.url ?? "")} maxLength={LIMITS.url} placeholder="https://example.com/track" inputMode="url" onChange={(e) => updateButton(i, { url: e.target.value })} />}
                                {b.type === "PHONE_NUMBER" && <input className={cn(input, "py-2")} value={String(b.phone_number ?? "")} maxLength={LIMITS.phone} placeholder="+919876543210" inputMode="tel" onChange={(e) => updateButton(i, { phone_number: e.target.value })} />}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {BUTTON_KINDS.map((k) => {
                        const full = d.buttons.length >= LIMITS.buttons || (k.type === "URL" && counts.url >= LIMITS.urlButtons) || (k.type === "PHONE_NUMBER" && counts.phone >= LIMITS.phoneButtons);
                        return (
                          <button key={k.type} type="button" disabled={full} onClick={() => addButton(k.type)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-green-500 hover:text-green-700 disabled:opacity-40 disabled:hover:border-slate-300 disabled:hover:text-slate-600">
                            <Icon name="add" className="w-3.5 h-3.5" /> {k.label}
                          </button>
                        );
                      })}
                    </div>
                  </Section>
                </>
              )}
            </div>

            {/* Preview */}
            <div className={cn("lg:block", tab === "edit" && "hidden")}>
              <div className="lg:sticky lg:top-0 space-y-3">
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wide hidden lg:block">Live preview</p>
                <PhonePreview {...preview} />
                <p className="text-[11px] text-slate-500 text-center">Sample values are shown in green. Customers see their own details.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-2.5">
          {problem && (touched || d.body || d.name) && (
            <p className="flex items-start gap-1.5 text-[11px] text-amber-700"><Icon name="warning" className="w-3.5 h-3.5 mt-px shrink-0" /> {problem}</p>
          )}
          {accounts.length > 1 && (
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <span className="shrink-0 font-semibold">Submit via</span>
              <select className={cn(input, "py-1.5 text-xs")} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.displayName} (+{a.phoneNumber})</option>)}
              </select>
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
            <div className="flex-1" />
            <button onClick={() => save(false)} disabled={!!busy}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50">
              {busy === "draft" && <span className="w-4 h-4 rounded-full border-2 border-slate-400 border-t-transparent animate-spin" />} Save draft
            </button>
            <button onClick={() => save(true)} disabled={!!busy || !accounts.length} title={!accounts.length ? "Connect a WhatsApp number first" : undefined}
              className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-4 sm:px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-green-500/25 hover:bg-[#1fb857] disabled:opacity-50">
              {busy === "submit" ? <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" /> : <Icon name="send" className="w-4 h-4" />}
              Submit to Meta
            </button>
          </div>
          {!accounts.length && <p className="text-[11px] text-slate-500">Connect a WhatsApp number in <a href="/settings?tab=whatsapp" className="font-semibold text-green-700 hover:underline">Settings → WhatsApp</a> to submit. You can still save drafts.</p>}
        </div>
      </div>
    </div>
  );
}
