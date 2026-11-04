"use client";

import { Icon } from "@/components/ui/icon";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";
import { useAdmin } from "@/components/admin/admin-context";
import {
  Page, PageHeader, Card, Button, IconButton, Badge, Field, inputCls, EmptyState, SkeletonRows, Modal,
  ConfirmDialog, apiError, cx,
} from "@/components/admin/ui";

interface Plan {
  id: string; name: string; slug: string; description: string | null; monthlyPrice: number; annualPrice: number;
  currency: string; isActive: boolean; isPopular: boolean; sortOrder: number; maxUsers: number; maxBroadcasts: number;
  maxAutomations: number; maxApiCalls: number; maxAiCredits: number; maxWhatsappNumbers: number; features: string[];
}

const EMPTY = {
  name: "", slug: "", description: "", monthlyPrice: 0, annualPrice: 0, currency: "USD", isActive: true, isPopular: false,
  sortOrder: 0, maxUsers: 3, maxBroadcasts: 5000, maxAutomations: 100, maxApiCalls: 10000, maxAiCredits: 100,
  maxWhatsappNumbers: 1, featuresText: "",
};
type FormState = typeof EMPTY;

const LIMITS: [keyof FormState & keyof Plan, string][] = [
  ["maxUsers", "Users"], ["maxBroadcasts", "Broadcasts"], ["maxAutomations", "Automations"],
  ["maxApiCalls", "API calls"], ["maxAiCredits", "AI credits"], ["maxWhatsappNumbers", "WA numbers"],
];

const fmt = (n: number) => (n >= 999999 ? "∞" : n >= 10000 ? `${Math.round(n / 1000)}K` : n.toLocaleString());
const money = (n: number, c: string) => new Intl.NumberFormat("en-US", { style: "currency", currency: c || "USD", maximumFractionDigits: 0 }).format(n);

export default function AdminPlansPage() {
  const qc = useQueryClient();
  const { can } = useAdmin();
  const [editing, setEditing] = useState<Plan | "new" | null>(null);
  const [deleting, setDeleting] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-plans"],
    queryFn: () => axios.get("/api/admin/plans").then((r) => r.data.plans as Plan[]),
  });
  const plans = data ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-plans"] });

  const doDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await axios.delete(`/api/admin/plans/${deleting.id}`);
      toast.success("Plan deleted");
      setDeleting(null);
      refresh();
    } catch (e) { toast.error(apiError(e)); }
    finally { setBusy(false); }
  };

  return (
    <Page>
      <PageHeader
        title="Plans & Pricing"
        description="Subscription plans shown on the pricing page and their limits"
        actions={can("plans:write") && <Button icon={"add"} onClick={() => setEditing("new")}>New plan</Button>}
      />

      {isLoading ? <Card><SkeletonRows rows={3} /></Card> : plans.length === 0 ? (
        <Card>
          <EmptyState icon={"workspace_premium"} title="No plans yet" description="Create your first subscription plan."
            action={can("plans:write") && <Button icon={"add"} onClick={() => setEditing("new")}>Create plan</Button>} />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {plans.map((p) => (
            <Card key={p.id} className={cx("relative p-5 flex flex-col gap-4", p.isPopular && "ring-2 ring-green-500/60", !p.isActive && "opacity-70")}>
              {p.isPopular && (
                <span className="absolute -top-2.5 left-5 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-green-500 text-white shadow">
                  <Icon name={"workspace_premium"} className="w-2.5 h-2.5" /> Popular
                </span>
              )}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900 truncate">{p.name}</h3>
                    {!p.isActive && <Badge>Hidden</Badge>}
                  </div>
                  <p className="text-xs text-slate-400 font-mono">{p.slug}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-2xl font-bold text-slate-900 leading-none">{money(p.monthlyPrice, p.currency)}<span className="text-xs font-medium text-slate-400">/mo</span></p>
                  <p className="text-[11px] text-slate-400 mt-1">{money(p.annualPrice, p.currency)}/yr</p>
                </div>
              </div>
              {p.description && <p className="text-xs text-slate-500 leading-relaxed -mt-1">{p.description}</p>}

              <div className="grid grid-cols-3 gap-2 text-center">
                {LIMITS.map(([k, label]) => (
                  <div key={k} className="rounded-xl bg-slate-50 py-2">
                    <p className="text-sm font-bold text-slate-800 tabular-nums">{fmt(p[k] as number)}</p>
                    <p className="text-[10px] text-slate-400">{label}</p>
                  </div>
                ))}
              </div>

              {p.features?.length > 0 && (
                <ul className="space-y-1.5 flex-1">
                  {p.features.slice(0, 4).map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                      <Icon name={"check"} className="w-2.5 h-2.5 mt-0.5 text-green-500 shrink-0" />{f}
                    </li>
                  ))}
                  {p.features.length > 4 && <li className="text-[11px] text-slate-400 pl-4">+{p.features.length - 4} more</li>}
                </ul>
              )}

              {(can("plans:write") || can("plans:delete")) && (
                <div className="flex gap-2 pt-3 border-t border-slate-100 mt-auto">
                  {can("plans:write") && <Button variant="secondary" icon={"edit"} className="flex-1" onClick={() => setEditing(p)}>Edit</Button>}
                  {can("plans:delete") && <IconButton icon={"delete"} label="Delete plan" tone="danger" className="!w-10 !h-10" onClick={() => setDeleting(p)} />}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {editing && <PlanFormModal plan={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { refresh(); setEditing(null); }} />}

      <ConfirmDialog
        open={!!deleting} onClose={() => setDeleting(null)} onConfirm={doDelete} loading={busy}
        title="Delete plan?" confirmLabel="Delete plan" confirmText={deleting?.slug}
        message={<>The <b>{deleting?.name}</b> plan will be removed from the pricing page. Existing subscriptions are not changed.</>}
      />
    </Page>
  );
}

function PlanFormModal({ plan, onClose, onSaved }: { plan: Plan | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<FormState>(
    plan ? { ...EMPTY, ...plan, description: plan.description ?? "", featuresText: (plan.features ?? []).join("\n") } : EMPTY
  );
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const num = (k: keyof FormState) => ({
    type: "number", min: 0, className: inputCls, value: form[k] as number,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k, Number(e.target.value) as never),
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { featuresText, ...rest } = form;
      const payload = { ...rest, features: featuresText.split("\n").map((s) => s.trim()).filter(Boolean) };
      if (plan) await axios.patch(`/api/admin/plans/${plan.id}`, payload);
      else await axios.post("/api/admin/plans", payload);
      toast.success(plan ? "Plan updated" : "Plan created");
      onSaved();
    } catch (e) { toast.error(apiError(e)); }
    finally { setSaving(false); }
  };

  return (
    <Modal
      open onClose={onClose} icon={"credit_card"} size="lg"
      title={plan ? `Edit ${plan.name}` : "New plan"}
      footer={<>
        <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="plan-form" className="flex-1" loading={saving}>{plan ? "Save plan" : "Create plan"}</Button>
      </>}
    >
      <form id="plan-form" onSubmit={submit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Plan name"><input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} required placeholder="Growth" /></Field>
          <Field label="Slug"><input className={`${inputCls} font-mono`} value={form.slug} onChange={(e) => set("slug", e.target.value)} placeholder="growth" /></Field>
        </div>
        <Field label="Description"><input className={inputCls} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="For growing teams" /></Field>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Monthly price"><input {...num("monthlyPrice")} step="0.01" /></Field>
          <Field label="Annual price"><input {...num("annualPrice")} step="0.01" /></Field>
          <Field label="Currency">
            <select className={inputCls} value={form.currency} onChange={(e) => set("currency", e.target.value)}>
              {["USD", "INR", "EUR", "GBP"].map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Sort order"><input {...num("sortOrder")} /></Field>
        </div>

        <div>
          <p className="text-xs font-semibold text-slate-600 mb-2">Limits</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {LIMITS.map(([k, label]) => <Field key={k} label={label}><input {...num(k)} /></Field>)}
          </div>
        </div>

        <Field label="Features" hint="One feature per line.">
          <textarea className={`${inputCls} min-h-[110px]`} value={form.featuresText} onChange={(e) => set("featuresText", e.target.value)}
            placeholder={"Unlimited contacts\nShared team inbox\nPriority support"} />
        </Field>

        <div className="flex flex-col sm:flex-row gap-3">
          {([["isActive", "Visible on pricing page"], ["isPopular", "Highlight as popular"]] as const).map(([k, label]) => (
            <label key={k} className="flex-1 flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 cursor-pointer">
              <span className="text-sm font-medium text-slate-700">{label}</span>
              <input type="checkbox" className="w-4 h-4 accent-green-500" checked={form[k]} onChange={(e) => set(k, e.target.checked)} />
            </label>
          ))}
        </div>
      </form>
    </Modal>
  );
}
