"use client";

import { useRef } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { inputCls } from "./chatbot-settings-modal";
import { BUILTIN_VARS, LIMITS, NODE_META, OPERATORS, OPERATOR_LABEL, type FlowIssue, type FlowNode, type NodeData, type Operator } from "./flow";

export interface Agent { id: string; name: string | null; role: string }

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-slate-600">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

function TextWithVars({ value, onChange, vars, max, rows = 4, placeholder, disabled }: {
  value: string; onChange: (v: string) => void; vars: string[]; max: number; rows?: number; placeholder?: string; disabled?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const insert = (v: string) => {
    const el = ref.current;
    const token = `{{${v}}}`;
    if (!el) return onChange(value + token);
    const s = el.selectionStart ?? value.length, e = el.selectionEnd ?? value.length;
    onChange((value.slice(0, s) + token + value.slice(e)).slice(0, max));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + token.length, s + token.length); });
  };
  return (
    <div className="space-y-1.5">
      <textarea ref={ref} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value.slice(0, max))} rows={rows} placeholder={placeholder}
        className={cn(inputCls, "resize-y min-h-[88px]")} />
      <div className="flex items-center gap-1.5 flex-wrap">
        {!disabled && vars.map((v) => (
          <button key={v} type="button" onClick={() => insert(v)} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-mono text-slate-600 hover:bg-green-50 hover:text-green-700">{`{{${v}}}`}</button>
        ))}
        <span className="ml-auto text-[10px] tabular-nums text-slate-400">{value.length}/{max}</span>
      </div>
    </div>
  );
}

export default function NodeEditor({ node, onChange, variables, agents, issues, readOnly }: {
  node: FlowNode; onChange: (patch: Partial<NodeData>) => void; variables: string[]; agents: Agent[]; issues: FlowIssue[]; readOnly?: boolean;
}) {
  const d = node.data;
  const vars = [...new Set(["name", "phone", ...variables])];
  const allVars = [...new Set([...BUILTIN_VARS, ...variables])];

  return (
    <div className="space-y-4">
      {!NODE_META[node.type].live && (
        <p className="flex gap-2 rounded-xl bg-amber-50 p-3 text-[11px] text-amber-800"><Icon name="warning" className="w-4 h-4 shrink-0" /> The live bot skips this step for now; the flow continues to the next step.</p>
      )}
      <fieldset disabled={readOnly} className="space-y-4">
        {node.type === "sendMessage" && (
          <Field label="Message">
            <TextWithVars value={d.content ?? ""} onChange={(content) => onChange({ content })} vars={vars} max={LIMITS.text} placeholder="Hi {{name}}, thanks for your message!" disabled={readOnly} />
          </Field>
        )}

        {node.type === "askQuestion" && (
          <>
            <Field label="Question">
              <TextWithVars value={d.content ?? ""} onChange={(content) => onChange({ content })} vars={vars} max={LIMITS.question} rows={3} placeholder="What's your email address?" disabled={readOnly} />
            </Field>
            <Field label="Save answer as" hint="Use it later as {{variable}} or in a condition.">
              <input value={d.variable ?? ""} maxLength={40} onChange={(e) => onChange({ variable: e.target.value.replace(/[^A-Za-z0-9_]/g, "_") })} placeholder="e.g. email" className={cn(inputCls, "font-mono")} />
            </Field>
            <Field label={`Reply buttons (${(d.options ?? []).length}/${LIMITS.options})`} hint="Optional. Up to 3 short options show as buttons, more as a list. Leave empty for a free-text answer.">
              <div className="space-y-2">
                {(d.options ?? []).map((o, i) => (
                  <div key={i} className="flex gap-2">
                    <input value={o} maxLength={LIMITS.option} onChange={(e) => onChange({ options: (d.options ?? []).map((x, j) => (j === i ? e.target.value : x)) })} placeholder={`Option ${i + 1}`} className={inputCls} />
                    {!readOnly && (
                      <button type="button" aria-label="Remove option" onClick={() => onChange({ options: (d.options ?? []).filter((_, j) => j !== i) })}
                        className="shrink-0 w-10 rounded-xl border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 flex items-center justify-center">
                        <Icon name="close" className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
                {!readOnly && (d.options ?? []).length < LIMITS.options && (
                  <button type="button" onClick={() => onChange({ options: [...(d.options ?? []), ""] })} className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 hover:underline">
                    <Icon name="add" className="w-3.5 h-3.5" /> Add option
                  </button>
                )}
              </div>
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={!!d.saveToContact} onChange={(e) => onChange({ saveToContact: e.target.checked })} className="w-4 h-4 rounded accent-green-600" />
              Also save to the contact&apos;s attributes
            </label>
          </>
        )}

        {node.type === "condition" && (
          <>
            <Field label="Check" hint="message = the customer's latest message.">
              <select value={d.variable ?? ""} onChange={(e) => onChange({ variable: e.target.value })} className={inputCls}>
                <option value="">Choose a variable…</option>
                {allVars.map((v) => <option key={v} value={v}>{v}</option>)}
                {d.variable && !allVars.includes(d.variable) && <option value={d.variable}>{d.variable}</option>}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Operator">
                <select value={d.operator ?? "equals"} onChange={(e) => onChange({ operator: e.target.value as Operator })} className={inputCls}>
                  {OPERATORS.map((o) => <option key={o} value={o}>{OPERATOR_LABEL[o]}</option>)}
                </select>
              </Field>
              {d.operator !== "is_empty" && d.operator !== "not_empty" && (
                <Field label="Value">
                  <input value={d.value ?? ""} maxLength={200} onChange={(e) => onChange({ value: e.target.value })} placeholder="Pricing" className={inputCls} />
                </Field>
              )}
            </div>
            <p className="text-[11px] text-slate-500">Comparison ignores upper/lower case. Connect the <b className="text-green-700">Yes</b> and <b className="text-red-600">No</b> branches to the next steps.</p>
          </>
        )}

        {node.type === "setAttribute" && (
          <>
            <Field label="Attribute name">
              <input value={d.key ?? ""} maxLength={40} onChange={(e) => onChange({ key: e.target.value.replace(/[^A-Za-z0-9_]/g, "_") })} placeholder="e.g. lead_source" className={cn(inputCls, "font-mono")} />
            </Field>
            <Field label="Value">
              <TextWithVars value={d.value ?? ""} onChange={(value) => onChange({ value })} vars={vars} max={500} rows={2} placeholder="WhatsApp chatbot" disabled={readOnly} />
            </Field>
          </>
        )}

        {node.type === "assignAgent" && (
          <>
            <Field label="Assign to" hint="The bot stops here and the chat moves to the inbox.">
              <select value={d.agentId ?? ""} onChange={(e) => onChange({ agentId: e.target.value })} className={inputCls}>
                <option value="">Leave unassigned (team picks it up)</option>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.name ?? "Unnamed"} · {a.role.replace(/_/g, " ").toLowerCase()}</option>)}
              </select>
            </Field>
            <Field label="Handoff message (optional)">
              <TextWithVars value={d.content ?? ""} onChange={(content) => onChange({ content })} vars={vars} max={LIMITS.text} rows={2} placeholder="Connecting you with our team…" disabled={readOnly} />
            </Field>
          </>
        )}

        {node.type === "httpRequest" && (
          <div className="grid grid-cols-[96px_1fr] gap-2">
            <Field label="Method">
              <select value={d.method ?? "POST"} onChange={(e) => onChange({ method: e.target.value as "GET" | "POST" })} className={inputCls}>
                <option>POST</option><option>GET</option>
              </select>
            </Field>
            <Field label="URL">
              <input value={d.url ?? ""} maxLength={500} onChange={(e) => onChange({ url: e.target.value })} placeholder="https://example.com/hook" className={inputCls} />
            </Field>
          </div>
        )}

        {node.type === "delay" && (
          <Field label="Wait (seconds)" hint={`Between 1 and ${LIMITS.delay} seconds — useful between two messages.`}>
            <input type="number" min={1} max={LIMITS.delay} value={d.seconds ?? 3}
              onChange={(e) => onChange({ seconds: Math.min(LIMITS.delay, Math.max(1, Number(e.target.value) || 1)) })} className={inputCls} />
          </Field>
        )}

        {node.type === "endFlow" && (
          <Field label="Closing message (optional)">
            <TextWithVars value={d.content ?? ""} onChange={(content) => onChange({ content })} vars={vars} max={LIMITS.text} rows={2} placeholder="Thanks for chatting with us!" disabled={readOnly} />
          </Field>
        )}
      </fieldset>

      {issues.length > 0 && (
        <ul className="space-y-1.5">
          {issues.map((i, k) => (
            <li key={k} className={cn("flex gap-1.5 text-[11px]", i.level === "error" ? "text-red-600" : "text-amber-700")}>
              <Icon name={i.level === "error" ? "error" : "warning"} className="w-3.5 h-3.5 shrink-0 mt-px" /> {i.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
