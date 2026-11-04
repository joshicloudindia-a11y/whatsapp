"use client";

import { useId, useRef, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import {
  ACTION_META, AUTOMATION_EVENTS, CONDITION_META, CONV_STATUSES, DAY_NAMES, EVENT_META, RECIPES, STAGES, SUPPORTED_EVENTS, TEXT_VARIABLES,
  defaultAction, defaultCondition, describeAction, describeCondition, sanitizeAutomation, stageLabel,
  type Action, type ActionType, type AutomationEvent, type Condition, type ConditionType, type Recipe,
} from "./schema";

export interface Member { id: string; name: string | null; email: string; role: string }
export interface BuilderMeta { timezone: string; members: Member[]; tags: string[] }
export interface BuilderInitial { id?: string; name: string; isActive: boolean; triggerEvent: AutomationEvent; conditions: Condition[]; actions: Action[] }

let seq = 0;
const uid = () => `k${++seq}`;
interface Item<T> { key: string; value: T }
const wrap = <T,>(list: T[]): Item<T>[] => list.map((value) => ({ key: uid(), value }));

export const memberName = (m?: Member) => (m ? m.name?.trim() || m.email : "Removed member");
const errMsg = (e: unknown, f = "Something went wrong") => (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? f;

export const inputCls = "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500";
const smallInput = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500";

export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={cn("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50", on ? "bg-[#25D366]" : "bg-slate-200")}>
      <span className={cn("inline-block h-5 w-5 rounded-full bg-white shadow transition-transform", on ? "translate-x-[22px]" : "translate-x-0.5")} />
    </button>
  );
}

/** Fills empty agent pools (from recipes) with every active member. */
export function withDefaultAgents(actions: Action[], members: Member[]): Action[] {
  return actions.map((a) => (a.type === "assign_agent" && !a.userIds.length ? { ...a, userIds: members.map((m) => m.id) } : a));
}

export function AutomationBuilder({ initial, meta, onClose, onSaved }: { initial: BuilderInitial | null; meta: BuilderMeta; onClose: () => void; onSaved: () => void }) {
  const editing = !!initial?.id;
  const [name, setName] = useState(initial?.name ?? "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [trigger, setTrigger] = useState<AutomationEvent>(initial?.triggerEvent ?? "MESSAGE_RECEIVED");
  const [conditions, setConditions] = useState<Item<Condition>[]>(() => wrap(initial?.conditions ?? []));
  const [actions, setActions] = useState<Item<Action>[]>(() => wrap(initial?.actions ?? [defaultAction("send_text")]));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [addingCond, setAddingCond] = useState(false);
  const [addingAction, setAddingAction] = useState(false);

  const nameOf = (id: string) => memberName(meta.members.find((m) => m.id === id));
  const condValues = conditions.map((c) => c.value);
  const actionValues = actions.map((a) => a.value);

  const applyRecipe = (r: Recipe) => {
    setName(r.name);
    setTrigger(r.triggerEvent);
    setConditions(wrap(r.conditions));
    setActions(wrap(withDefaultAgents(r.actions, meta.members)));
    setError(null);
  };

  const updateCond = (key: string, value: Condition) => setConditions((l) => l.map((c) => (c.key === key ? { key, value } : c)));
  const updateAction = (key: string, value: Action) => setActions((l) => l.map((a) => (a.key === key ? { key, value } : a)));
  const moveAction = (i: number, d: -1 | 1) => setActions((l) => {
    const j = i + d;
    if (j < 0 || j >= l.length) return l;
    const n = [...l];
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  });

  const repeatable: ActionType[] = ["add_tag", "remove_tag"];
  const condOptions = (Object.keys(CONDITION_META) as ConditionType[]).filter((t) => t === "contact_tag" || !condValues.some((c) => c.type === t));
  const actionOptions = (Object.keys(ACTION_META) as ActionType[]).filter((t) => repeatable.includes(t) || !actionValues.some((a) => a.type === t));

  // Warnings that don't block saving.
  const warnings: string[] = [];
  const reply = actionValues.find((a): a is Extract<Action, { type: "send_text" }> => a.type === "send_text");
  if (trigger === "MESSAGE_RECEIVED" && reply && reply.cooldownHours === 0 && !condValues.length) warnings.push("This replies to every single message a customer sends. Add a condition or a repeat limit.");
  if (condValues.some((c) => c.type === "business_hours") && reply) warnings.push(`Business hours use your workspace time zone (${meta.timezone}).`);
  if (actionValues.some((a) => a.type === "set_status" && a.status === "RESOLVED") && reply) warnings.push("Resolving the conversation means the customer's next message starts a new conversation.");

  const save = async () => {
    const payload = { name, isActive, triggerEvent: trigger, conditions: condValues, actions: actionValues };
    const parsed = sanitizeAutomation(payload);
    if (!parsed.ok) { setError(parsed.error); return; }
    const missing = actionValues.some((a) => a.type === "assign_agent" && a.userIds.some((id) => !meta.members.some((m) => m.id === id)));
    if (missing) { setError("Remove agents who are no longer on the team"); return; }
    setError(null);
    setSaving(true);
    try {
      if (editing) await axios.patch(`/api/automations/${initial!.id}`, parsed.value);
      else await axios.post("/api/automations", parsed.value);
      toast.success(editing ? "Automation updated" : "Automation created");
      onSaved();
    } catch (e) {
      const m = errMsg(e, "Couldn't save the automation");
      setError(m);
      toast.error(m);
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label={editing ? "Edit automation" : "New automation"}>
      <div className="absolute inset-0 bg-slate-950/50 admin-fade" onClick={onClose} />
      <div className="relative w-full sm:max-w-5xl max-h-[94dvh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white shadow-2xl admin-pop">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <span className="w-9 h-9 rounded-xl bg-green-50 text-green-600 flex items-center justify-center shrink-0"><Icon name="bolt" className="w-5 h-5" /></span>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-slate-900">{editing ? "Edit automation" : "New automation"}</h3>
            <p className="text-xs text-slate-500">When something happens, check conditions, then run actions.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"><Icon name="close" className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
            <div className="space-y-5 min-w-0">
              {!editing && (
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-slate-600">Start from a recipe</span>
                  <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                    {RECIPES.map((r) => (
                      <button key={r.key} type="button" onClick={() => applyRecipe(r)}
                        className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-green-400 hover:bg-green-50/50">
                        <Icon name={r.icon} className="w-3.5 h-3.5" style={{ color: r.color }} /> {r.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-slate-600">Automation name</span>
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Welcome new customers" />
              </label>

              {/* WHEN */}
              <Section step="When" icon="bolt" title="Trigger" hint="What starts this automation?">
                <div className="grid gap-2 sm:grid-cols-2">
                  {AUTOMATION_EVENTS.map((ev) => {
                    const m = EVENT_META[ev];
                    const supported = SUPPORTED_EVENTS.includes(ev);
                    return (
                      <button key={ev} type="button" disabled={!supported} onClick={() => setTrigger(ev)}
                        className={cn("flex items-start gap-2.5 rounded-xl border-2 p-3 text-left transition",
                          trigger === ev ? "border-green-500 bg-green-50/40" : "border-slate-200 hover:border-slate-300",
                          !supported && "opacity-50 cursor-not-allowed hover:border-slate-200")}>
                        <Icon name={m.icon} className={cn("w-5 h-5 mt-0.5 shrink-0", trigger === ev ? "text-green-600" : "text-slate-400")} />
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">{m.label}
                            {!supported && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">Soon</span>}
                          </span>
                          <span className="block text-[11px] text-slate-500">{m.description}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Section>

              {/* IF */}
              <Section step="If" icon="tune" title="Conditions" hint={conditions.length ? "All conditions must match." : "Optional. Without conditions it runs every time."}>
                <div className="space-y-2">
                  {conditions.map((c) => (
                    <Card key={c.key} icon={CONDITION_META[c.value.type].icon} title={CONDITION_META[c.value.type].label}
                      onRemove={() => setConditions((l) => l.filter((x) => x.key !== c.key))}>
                      <ConditionEditor value={c.value} onChange={(v) => updateCond(c.key, v)} meta={meta} />
                    </Card>
                  ))}
                  <AddMenu open={addingCond} setOpen={setAddingCond} label="Add condition"
                    options={condOptions.map((t) => ({ key: t, label: CONDITION_META[t].label, icon: CONDITION_META[t].icon }))}
                    onPick={(t) => { setConditions((l) => [...l, { key: uid(), value: defaultCondition(t as ConditionType) }]); setAddingCond(false); }} />
                </div>
              </Section>

              {/* THEN */}
              <Section step="Then" icon="rocket_launch" title="Actions" hint="Run in this order.">
                <div className="space-y-2">
                  {actions.map((a, i) => (
                    <Card key={a.key} icon={ACTION_META[a.value.type].icon} title={`${i + 1}. ${ACTION_META[a.value.type].label}`}
                      onRemove={actions.length > 1 ? () => setActions((l) => l.filter((x) => x.key !== a.key)) : undefined}
                      onUp={i > 0 ? () => moveAction(i, -1) : undefined} onDown={i < actions.length - 1 ? () => moveAction(i, 1) : undefined}>
                      <ActionEditor value={a.value} onChange={(v) => updateAction(a.key, v)} meta={meta} />
                    </Card>
                  ))}
                  {actions.length < 10 && (
                    <AddMenu open={addingAction} setOpen={setAddingAction} label="Add action"
                      options={actionOptions.map((t) => ({ key: t, label: ACTION_META[t].label, icon: ACTION_META[t].icon }))}
                      onPick={(t) => {
                        const v = defaultAction(t as ActionType);
                        setActions((l) => [...l, { key: uid(), value: v.type === "assign_agent" ? withDefaultAgents([v], meta.members)[0] : v }]);
                        setAddingAction(false);
                      }} />
                  )}
                </div>
              </Section>
            </div>

            {/* Summary */}
            <aside className="lg:sticky lg:top-0 self-start space-y-3">
              <div className="rounded-2xl border border-slate-200/70 bg-slate-50 p-4 space-y-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Summary</p>
                <SummaryRow tag="When" tone="green">{EVENT_META[trigger].when}</SummaryRow>
                {condValues.length > 0 && <SummaryRow tag="If" tone="amber">{condValues.map(describeCondition).join(" and ")}</SummaryRow>}
                <SummaryRow tag="Then" tone="sky">
                  {actionValues.length ? (
                    <ol className="space-y-1">{actionValues.map((a, i) => <li key={i}>{describeAction(a, nameOf)}</li>)}</ol>
                  ) : "Nothing yet"}
                </SummaryRow>
              </div>
              {warnings.map((w) => (
                <p key={w} className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"><Icon name="info" className="w-4 h-4 shrink-0" />{w}</p>
              ))}
              {reply && (
                <p className="flex gap-2 rounded-xl border border-sky-100 bg-sky-50 p-3 text-xs text-sky-800">
                  <Icon name="timer" className="w-4 h-4 shrink-0" />
                  Replies are only sent inside WhatsApp&apos;s 24-hour window, never to opted-out contacts, and at most one automated reply per incoming message.
                </p>
              )}
            </aside>
          </div>
        </div>

        <div className="border-t border-slate-100 px-5 py-3 space-y-2">
          {error && <p role="alert" className="flex items-center gap-1.5 text-xs font-medium text-red-600"><Icon name="error" className="w-4 h-4" />{error}</p>}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-600 mr-auto">
              <Toggle on={isActive} onChange={setIsActive} label="Active" /> {isActive ? "Active" : "Paused"}
            </label>
            <button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-green-500/25 hover:bg-[#1fb857] disabled:opacity-60">
              <Icon name={saving ? "hourglass_top" : "check"} className="w-4 h-4" /> {saving ? "Saving…" : editing ? "Save changes" : "Create automation"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Layout helpers ──────────────────────────────────────────────────────────
function Section({ step, icon, title, hint, children }: { step: string; icon: string; title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-white"><Icon name={icon} className="w-3.5 h-3.5" />{step}</span>
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="text-[11px] text-slate-500 truncate">{hint}</p>
      </div>
      {children}
    </section>
  );
}

function Card({ icon, title, children, onRemove, onUp, onDown }: { icon: string; title: string; children: React.ReactNode; onRemove?: () => void; onUp?: () => void; onDown?: () => void }) {
  const btn = "w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 disabled:hover:bg-transparent";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Icon name={icon} className="w-4 h-4 text-slate-500" />
        <p className="flex-1 text-sm font-semibold text-slate-800">{title}</p>
        {(onUp || onDown) && (
          <>
            <button type="button" className={btn} onClick={onUp} disabled={!onUp} aria-label="Move up"><Icon name="expand_less" className="w-4 h-4" /></button>
            <button type="button" className={btn} onClick={onDown} disabled={!onDown} aria-label="Move down"><Icon name="expand_more" className="w-4 h-4" /></button>
          </>
        )}
        {onRemove && <button type="button" className={cn(btn, "hover:text-red-500 hover:bg-red-50")} onClick={onRemove} aria-label="Remove"><Icon name="delete" className="w-4 h-4" /></button>}
      </div>
      {children}
    </div>
  );
}

function AddMenu({ open, setOpen, label, options, onPick }: { open: boolean; setOpen: (v: boolean) => void; label: string; options: { key: string; label: string; icon: string }[]; onPick: (k: string) => void }) {
  if (!options.length) return null;
  return open ? (
    <div className="rounded-xl border-2 border-dashed border-green-300 bg-green-50/30 p-2">
      <div className="grid gap-1.5 sm:grid-cols-2">
        {options.map((o) => (
          <button key={o.key} type="button" onClick={() => onPick(o.key)} className="flex items-center gap-2 rounded-lg bg-white border border-slate-200 px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:border-green-400">
            <Icon name={o.icon} className="w-4 h-4 text-slate-500" />{o.label}
          </button>
        ))}
      </div>
      <button type="button" onClick={() => setOpen(false)} className="mt-1.5 w-full rounded-lg py-1.5 text-xs font-semibold text-slate-500 hover:bg-white">Cancel</button>
    </div>
  ) : (
    <button type="button" onClick={() => setOpen(true)} className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-200 py-2.5 text-xs font-semibold text-slate-500 hover:border-green-400 hover:text-green-700">
      <Icon name="add" className="w-4 h-4" /> {label}
    </button>
  );
}

function SummaryRow({ tag, tone, children }: { tag: string; tone: "green" | "amber" | "sky"; children: React.ReactNode }) {
  const cls = { green: "bg-green-100 text-green-800", amber: "bg-amber-100 text-amber-800", sky: "bg-sky-100 text-sky-800" }[tone];
  return (
    <div className="flex gap-2 text-xs text-slate-700">
      <span className={cn("h-fit shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase", cls)}>{tag}</span>
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
      {options.map(([v, l]) => (
        <button key={v} type="button" onClick={() => onChange(v)} className={cn("rounded-lg px-2.5 py-1 text-xs font-semibold", value === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800")}>{l}</button>
      ))}
    </div>
  );
}

function TagInput({ value, onChange, tags, listId }: { value: string; onChange: (v: string) => void; tags: string[]; listId: string }) {
  return (
    <>
      <input className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} maxLength={40} placeholder="e.g. vip" list={listId} />
      <datalist id={listId}>{tags.map((t) => <option key={t} value={t} />)}</datalist>
    </>
  );
}

// ─── Condition editor ────────────────────────────────────────────────────────
function ConditionEditor({ value: c, onChange, meta }: { value: Condition; onChange: (c: Condition) => void; meta: BuilderMeta }) {
  const [draft, setDraft] = useState("");
  const listId = useId();

  switch (c.type) {
    case "keyword": {
      const add = () => {
        const words = draft.split(",").map((w) => w.trim().toLowerCase()).filter(Boolean);
        if (words.length) onChange({ ...c, keywords: [...new Set([...c.keywords, ...words])].slice(0, 20) });
        setDraft("");
      };
      return (
        <div className="space-y-2">
          <Segmented value={c.match} onChange={(match) => onChange({ ...c, match })} options={[["contains", "Contains"], ["equals", "Is exactly"], ["starts_with", "Starts with"]]} />
          <div className="flex flex-wrap gap-1.5">
            {c.keywords.map((k) => (
              <span key={k} className="inline-flex items-center gap-1 rounded-full bg-green-50 border border-green-200 pl-2.5 pr-1 py-0.5 text-xs font-semibold text-green-800">
                {k}
                <button type="button" aria-label={`Remove ${k}`} onClick={() => onChange({ ...c, keywords: c.keywords.filter((x) => x !== k) })} className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-green-100"><Icon name="close" className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input className={inputCls} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Type a keyword and press Enter"
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }} onBlur={add} />
            <button type="button" onClick={add} className="rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50">Add</button>
          </div>
          <p className="text-[11px] text-slate-500">Matches any keyword. Not case-sensitive.</p>
        </div>
      );
    }
    case "business_hours":
      return (
        <div className="space-y-3">
          <Segmented value={c.when} onChange={(when) => onChange({ ...c, when })} options={[["outside", "Outside business hours"], ["inside", "During business hours"]]} />
          <div className="flex flex-wrap gap-1.5">
            {DAY_NAMES.map((d, i) => {
              const on = c.days.includes(i);
              return (
                <button key={d} type="button" onClick={() => onChange({ ...c, days: on ? c.days.filter((x) => x !== i) : [...c.days, i].sort() })}
                  className={cn("w-11 rounded-lg border py-1.5 text-xs font-semibold", on ? "border-green-500 bg-green-50 text-green-700" : "border-slate-200 text-slate-500")}>{d}</button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <input type="time" className={smallInput} value={c.start} onChange={(e) => onChange({ ...c, start: e.target.value })} aria-label="Opens at" />
            <span>to</span>
            <input type="time" className={smallInput} value={c.end} onChange={(e) => onChange({ ...c, end: e.target.value })} aria-label="Closes at" />
            <span className="text-slate-400">{meta.timezone}</span>
          </div>
        </div>
      );
    case "contact_tag":
      return (
        <div className="space-y-2">
          <Segmented value={c.op} onChange={(op) => onChange({ ...c, op })} options={[["has", "Has tag"], ["not_has", "Doesn't have tag"]]} />
          <TagInput value={c.tag} onChange={(tag) => onChange({ ...c, tag })} tags={meta.tags} listId={listId} />
        </div>
      );
    case "contact_stage":
      return (
        <div className="flex flex-col sm:flex-row gap-2">
          <Segmented value={c.op} onChange={(op) => onChange({ ...c, op })} options={[["is", "Is"], ["is_not", "Is not"]]} />
          <select className={inputCls} value={c.stage} onChange={(e) => onChange({ ...c, stage: e.target.value as typeof c.stage })}>
            {STAGES.map((s) => <option key={s} value={s}>{stageLabel(s)}</option>)}
          </select>
        </div>
      );
    case "first_conversation":
      return <p className="text-xs text-slate-500">Only runs if this contact has never had a conversation with you before.</p>;
    case "unassigned":
      return <p className="text-xs text-slate-500">Only runs if no agent owns the conversation yet.</p>;
  }
}

// ─── Action editor ───────────────────────────────────────────────────────────
const COOLDOWNS: [number, string][] = [[0, "Every time"], [1, "Once per hour"], [4, "Once per 4 hours"], [12, "Once per 12 hours"], [24, "Once per day"], [72, "Once per 3 days"], [168, "Once per week"], [720, "Once per 30 days"]];

function ActionEditor({ value: a, onChange, meta }: { value: Action; onChange: (a: Action) => void; meta: BuilderMeta }) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  const listId = useId();

  switch (a.type) {
    case "send_text": {
      const insert = (v: string) => {
        const el = textRef.current;
        const pos = el ? el.selectionStart : a.text.length;
        onChange({ ...a, text: a.text.slice(0, pos) + v + a.text.slice(pos) });
        requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(pos + v.length, pos + v.length); });
      };
      const cooldowns = COOLDOWNS.some(([h]) => h === a.cooldownHours) ? COOLDOWNS : [...COOLDOWNS, [a.cooldownHours, `Once per ${a.cooldownHours} hours`] as [number, string]];
      return (
        <div className="space-y-2">
          <textarea ref={textRef} rows={4} maxLength={4096} className={cn(inputCls, "resize-y")} value={a.text} onChange={(e) => onChange({ ...a, text: e.target.value })} placeholder="Hi {{first_name}}, thanks for your message!" />
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-500">Insert:</span>
            {TEXT_VARIABLES.map((v) => (
              <button key={v.key} type="button" onClick={() => insert(v.key)} className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:border-green-400 hover:text-green-700">{v.label}</button>
            ))}
            <span className="ml-auto text-[11px] text-slate-400 tabular-nums">{a.text.length}/4096</span>
          </div>
          <label className="flex flex-col sm:flex-row sm:items-center gap-1.5 text-xs text-slate-600">
            <span className="font-semibold">Send to the same contact</span>
            <select className={smallInput} value={a.cooldownHours} onChange={(e) => onChange({ ...a, cooldownHours: Number(e.target.value) })}>
              {cooldowns.map(([h, l]) => <option key={h} value={h}>{l}</option>)}
            </select>
          </label>
        </div>
      );
    }
    case "assign_agent": {
      const toggle = (id: string) => {
        if (a.mode === "specific") onChange({ ...a, userIds: [id] });
        else onChange({ ...a, userIds: a.userIds.includes(id) ? a.userIds.filter((x) => x !== id) : [...a.userIds, id] });
      };
      const stale = a.userIds.filter((id) => !meta.members.some((m) => m.id === id));
      return (
        <div className="space-y-2.5">
          <Segmented value={a.mode} onChange={(mode) => onChange({ ...a, mode, userIds: mode === "specific" ? a.userIds.slice(0, 1) : a.userIds })}
            options={[["round_robin", "Round-robin"], ["least_busy", "Least busy"], ["specific", "Specific agent"]]} />
          <p className="text-[11px] text-slate-500">
            {a.mode === "round_robin" ? "Takes turns between the selected agents." : a.mode === "least_busy" ? "Picks the selected agent with the fewest open conversations." : "Always assigns to one agent."}
          </p>
          <div className="grid gap-1.5 sm:grid-cols-2 max-h-52 overflow-y-auto">
            {meta.members.map((m) => {
              const on = a.userIds.includes(m.id);
              return (
                <button key={m.id} type="button" onClick={() => toggle(m.id)}
                  className={cn("flex items-center gap-2 rounded-xl border px-3 py-2 text-left", on ? "border-green-500 bg-green-50/50" : "border-slate-200 hover:border-slate-300")}>
                  <Icon name={on ? "check_circle" : "radio_button_unchecked"} className={cn("w-4 h-4 shrink-0", on ? "text-green-600" : "text-slate-300")} filled={on} />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-slate-800">{memberName(m)}</span>
                    <span className="block truncate text-[10px] text-slate-400">{m.role.replace(/_/g, " ").toLowerCase()}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {stale.length > 0 && (
            <button type="button" onClick={() => onChange({ ...a, userIds: a.userIds.filter((id) => !stale.includes(id)) })} className="text-[11px] font-semibold text-red-600 hover:underline">
              Remove {stale.length} former team member{stale.length === 1 ? "" : "s"}
            </button>
          )}
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" className="rounded accent-green-600" checked={a.overwrite} onChange={(e) => onChange({ ...a, overwrite: e.target.checked })} />
            Reassign even if the conversation already has an agent
          </label>
        </div>
      );
    }
    case "add_tag":
    case "remove_tag":
      return <TagInput value={a.tag} onChange={(tag) => onChange({ ...a, tag })} tags={meta.tags} listId={listId} />;
    case "set_stage":
      return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {STAGES.map((s) => (
            <button key={s} type="button" onClick={() => onChange({ ...a, stage: s })} className={cn("rounded-xl border py-2 text-xs font-semibold", a.stage === s ? "border-green-500 bg-green-50 text-green-700" : "border-slate-200 text-slate-600")}>{stageLabel(s)}</button>
          ))}
        </div>
      );
    case "set_status":
      return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {CONV_STATUSES.map((s) => (
            <button key={s} type="button" onClick={() => onChange({ ...a, status: s })} className={cn("rounded-xl border py-2 text-xs font-semibold", a.status === s ? "border-green-500 bg-green-50 text-green-700" : "border-slate-200 text-slate-600")}>{stageLabel(s)}</button>
          ))}
        </div>
      );
  }
}
