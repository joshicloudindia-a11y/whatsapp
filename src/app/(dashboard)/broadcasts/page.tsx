"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";
import { cn, timeAgo } from "@/lib/utils";

type BStatus = "DRAFT" | "SCHEDULED" | "RUNNING" | "COMPLETED" | "PAUSED" | "FAILED";
interface Broadcast {
  id: string; name: string; status: BStatus; scheduledAt: string | null; startedAt: string | null; completedAt: string | null; createdAt: string;
  totalCount: number; sentCount: number; deliveredCount: number; readCount: number; failedCount: number;
  template: { name: string; category: string } | null; whatsappAccount: { displayName: string; phoneNumber: string };
}
interface ListData {
  broadcasts: Broadcast[];
  totals: { broadcasts: number; sentCount: number | null; deliveredCount: number | null; readCount: number | null; failedCount: number | null };
  quota: { used: number; limit: number; remaining: number | null };
  canSend: boolean;
}
interface Template { id: string; name: string; language: string; category: string; body: string; status: string; headerType?: string | null; headerContent?: string | null; footer?: string | null; buttons?: unknown }
interface Account { id: string; displayName: string; phoneNumber: string; isActive: boolean }
type VarSource = { source: "name" | "phone" | "email" | "text"; value: string };

const err = (e: unknown, f = "Something went wrong") => (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? f;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString("en-IN");
const placeholdersOf = (body: string) => [...new Set(body.match(/\{\{\d+\}\}/g) ?? [])].sort((a, b) => Number(a.slice(2, -2)) - Number(b.slice(2, -2)));

const STATUS: Record<BStatus, { label: string; cls: string; icon: string }> = {
  DRAFT: { label: "Draft", cls: "bg-slate-100 text-slate-600", icon: "edit" },
  SCHEDULED: { label: "Scheduled", cls: "bg-violet-50 text-violet-700", icon: "schedule" },
  RUNNING: { label: "Sending", cls: "bg-blue-50 text-blue-700", icon: "send" },
  PAUSED: { label: "Paused", cls: "bg-amber-50 text-amber-700", icon: "pause" },
  COMPLETED: { label: "Completed", cls: "bg-green-50 text-green-700", icon: "check_circle" },
  FAILED: { label: "Failed", cls: "bg-red-50 text-red-600", icon: "error" },
};

function StatusPill({ s }: { s: BStatus }) {
  const st = STATUS[s];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap", st.cls)}>
      <Icon name={st.icon} className={cn("w-3 h-3", s === "RUNNING" && "animate-pulse")} /> {st.label}
    </span>
  );
}

/** Stacked funnel bar: read ⊂ delivered ⊂ sent, plus failed. */
function Funnel({ b }: { b: Pick<Broadcast, "totalCount" | "sentCount" | "deliveredCount" | "readCount" | "failedCount"> }) {
  const t = Math.max(b.totalCount, 1);
  return (
    <div className="h-2 rounded-full bg-slate-100 overflow-hidden flex">
      <div className="bg-[#25D366]" style={{ width: `${(b.readCount / t) * 100}%` }} title="Read" />
      <div className="bg-green-300" style={{ width: `${(Math.max(0, b.deliveredCount - b.readCount) / t) * 100}%` }} title="Delivered" />
      <div className="bg-sky-300" style={{ width: `${(Math.max(0, b.sentCount - b.deliveredCount) / t) * 100}%` }} title="Sent" />
      <div className="bg-red-400" style={{ width: `${(b.failedCount / t) * 100}%` }} title="Failed" />
    </div>
  );
}

export default function BroadcastsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<"ALL" | BStatus>("ALL");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["broadcasts", status, search],
    queryFn: () => axios.get("/api/broadcasts", { params: { status, search } }).then((r) => r.data as ListData),
    refetchInterval: (q) => ((q.state.data as ListData | undefined)?.broadcasts.some((b) => b.status === "RUNNING" || b.status === "SCHEDULED") ? 4000 : 30000),
    placeholderData: (p) => p,
  });
  const list = data?.broadcasts ?? [];
  const t = data?.totals;
  const refresh = () => qc.invalidateQueries({ queryKey: ["broadcasts"] });

  const act = async (b: Broadcast, kind: "send" | "retry" | "pause" | "cancel" | "delete") => {
    try {
      if (kind === "send" || kind === "retry") await axios.post(`/api/broadcasts/${b.id}/send`, { retryFailed: kind === "retry" });
      else if (kind === "delete") { if (!confirm(`Delete "${b.name}"? This can't be undone.`)) return; await axios.delete(`/api/broadcasts/${b.id}`); }
      else await axios.patch(`/api/broadcasts/${b.id}`, { action: kind });
      toast.success({ send: "Sending started", retry: "Retrying failed messages", pause: "Broadcast paused", cancel: "Schedule cancelled", delete: "Broadcast deleted" }[kind]);
      refresh();
    } catch (e) { toast.error(err(e)); }
  };

  const stats = [
    { label: "Messages sent", value: fmt(t?.sentCount), icon: "outbox", color: "#25D366", sub: `${fmt(t?.broadcasts)} broadcasts` },
    { label: "Delivery rate", value: `${pct(t?.deliveredCount ?? 0, t?.sentCount ?? 0)}%`, icon: "done_all", color: "#0ea5e9", sub: `${fmt(t?.deliveredCount)} delivered` },
    { label: "Read rate", value: `${pct(t?.readCount ?? 0, t?.deliveredCount ?? 0)}%`, icon: "visibility", color: "#8b5cf6", sub: `${fmt(t?.readCount)} read` },
    { label: "Failed", value: fmt(t?.failedCount), icon: "error", color: "#ef4444", sub: `${pct(t?.failedCount ?? 0, (t?.sentCount ?? 0) + (t?.failedCount ?? 0))}% of attempts` },
  ];

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-8 space-y-5 max-w-7xl mx-auto w-full">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Broadcasts</h1>
          <p className="text-sm text-slate-500 mt-0.5">Send approved WhatsApp templates to many customers at once.</p>
        </div>
        {data?.canSend && (
          <button onClick={() => setCreating(true)} className="self-start inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-green-500/25 hover:bg-[#1fb857]">
            <Icon name="add" className="w-4 h-4" /> New broadcast
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${s.color}14`, color: s.color }}><Icon name={s.icon} className="w-4 h-4" /></span>
              <p className="text-xs font-medium text-slate-500">{s.label}</p>
            </div>
            <p className="mt-3 text-2xl font-bold text-slate-900 tabular-nums">{s.value}</p>
            <p className="text-[11px] text-slate-400">{s.sub}</p>
          </div>
        ))}
      </div>

      {data?.quota && data.quota.limit < 999999 && (
        <div className="rounded-2xl border border-slate-200/70 bg-white p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <div className="flex items-center justify-between text-xs"><span className="font-semibold text-slate-700">Plan usage this period</span><span className="text-slate-500 tabular-nums">{fmt(data.quota.used)} / {fmt(data.quota.limit)} messages</span></div>
            <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden"><div className={cn("h-full rounded-full", pct(data.quota.used, data.quota.limit) >= 90 ? "bg-red-500" : "bg-[#25D366]")} style={{ width: `${Math.min(100, pct(data.quota.used, data.quota.limit))}%` }} /></div>
          </div>
          <a href="/settings?tab=billing" className="text-xs font-semibold text-green-600 hover:underline shrink-0">Need more? Upgrade</a>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto no-scrollbar">
          {(["ALL", "DRAFT", "SCHEDULED", "RUNNING", "COMPLETED", "PAUSED"] as const).map((s) => (
            <button key={s} onClick={() => setStatus(s)}
              className={cn("px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap", status === s ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800")}>
              {s === "ALL" ? "All" : STATUS[s].label}
            </button>
          ))}
        </div>
        <div className="relative sm:w-64">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search broadcasts…"
            className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500" />
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-44 rounded-2xl bg-white border border-slate-200 animate-pulse" />)}</div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 px-6 text-center">
          <span className="mx-auto w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center"><Icon name="campaign" className="w-7 h-7 text-green-600" /></span>
          <p className="mt-3 text-sm font-semibold text-slate-800">{search || status !== "ALL" ? "No broadcasts match" : "No broadcasts yet"}</p>
          <p className="text-xs text-slate-500 mt-1">Reach your customers with offers, updates and reminders.</p>
          {data?.canSend && !search && status === "ALL" && (
            <button onClick={() => setCreating(true)} className="mt-4 rounded-xl bg-[#25D366] px-4 py-2 text-sm font-semibold text-white">Create your first broadcast</button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((b) => (
            <article key={b.id} className="rounded-2xl border border-slate-200/70 bg-white p-4 sm:p-5 shadow-sm flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <button onClick={() => setViewing(b.id)} className="min-w-0 flex-1 text-left">
                  <p className="text-sm font-bold text-slate-900 truncate hover:text-green-700">{b.name}</p>
                  <p className="text-[11px] text-slate-500 truncate">{b.template?.name ?? "No template"} · {b.whatsappAccount.displayName}</p>
                </button>
                <StatusPill s={b.status} />
              </div>
              <Funnel b={b} />
              <dl className="grid grid-cols-4 gap-2 text-center">
                {[["Recipients", b.totalCount], ["Sent", b.sentCount], ["Read", b.readCount], ["Failed", b.failedCount]].map(([k, v]) => (
                  <div key={k as string} className="rounded-lg bg-slate-50 py-1.5"><dd className="text-sm font-bold text-slate-900 tabular-nums">{fmt(v as number)}</dd><dt className="text-[10px] text-slate-500">{k}</dt></div>
                ))}
              </dl>
              <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-500">
                <Icon name="schedule" className="w-3.5 h-3.5" />
                {b.status === "SCHEDULED" && b.scheduledAt ? `Sends ${new Date(b.scheduledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`
                  : b.completedAt ? `Finished ${timeAgo(b.completedAt)}` : b.startedAt ? `Started ${timeAgo(b.startedAt)}` : `Created ${timeAgo(b.createdAt)}`}
                {b.status === "RUNNING" && <span className="font-semibold text-blue-600">{pct(b.sentCount + b.failedCount, b.totalCount)}% done</span>}
              </div>
              {data?.canSend && (
                <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-100">
                  {(b.status === "DRAFT" || b.status === "PAUSED") && <ActionBtn icon="send" primary onClick={() => act(b, "send")}>{b.status === "PAUSED" ? "Resume" : "Send now"}</ActionBtn>}
                  {b.status === "RUNNING" && <ActionBtn icon="pause" onClick={() => act(b, "pause")}>Pause</ActionBtn>}
                  {b.status === "SCHEDULED" && <ActionBtn icon="cancel" onClick={() => act(b, "cancel")}>Cancel schedule</ActionBtn>}
                  {(b.status === "COMPLETED" || b.status === "FAILED") && b.failedCount > 0 && <ActionBtn icon="refresh" onClick={() => act(b, "retry")}>Retry failed</ActionBtn>}
                  <ActionBtn icon="monitoring" onClick={() => setViewing(b.id)}>Report</ActionBtn>
                  {b.status !== "RUNNING" && <ActionBtn icon="delete" danger onClick={() => act(b, "delete")}>Delete</ActionBtn>}
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {creating && <CreateWizard onClose={() => setCreating(false)} onCreated={() => { setCreating(false); refresh(); }} />}
      {viewing && <ReportDrawer id={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function ActionBtn({ icon, children, onClick, primary, danger }: { icon: string; children: React.ReactNode; onClick: () => void; primary?: boolean; danger?: boolean }) {
  return (
    <button onClick={onClick} className={cn("inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition",
      primary ? "bg-[#25D366] text-white hover:bg-[#1fb857]" : danger ? "border border-red-100 text-red-500 hover:bg-red-50" : "border border-slate-200 text-slate-600 hover:bg-slate-50")}>
      <Icon name={icon} className="w-3.5 h-3.5" /> {children}
    </button>
  );
}

// ─── Create wizard ───────────────────────────────────────────────────────────
function CreateWizard({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [vars, setVars] = useState<VarSource[]>([]);
  const [mode, setMode] = useState<"all" | "tags" | "stage">("all");
  const [tags, setTags] = useState<string[]>([]);
  const [stage, setStage] = useState("CUSTOMER");
  const [when, setWhen] = useState<"now" | "later" | "draft">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [saving, setSaving] = useState(false);
  // Captured once when the wizard opens; used for schedule validation.
  const [openedAt] = useState(() => Date.now());

  const { data: tpl, refetch: refetchTemplates } = useQuery({ queryKey: ["templates-approved"], queryFn: () => axios.get("/api/templates", { params: { status: "APPROVED" } }).then((r) => r.data.templates as Template[]) });
  const [syncing, setSyncing] = useState(false);
  const syncTemplates = async () => {
    setSyncing(true);
    try {
      await axios.post("/api/templates/sync");
      const r = await refetchTemplates();
      toast.success(r.data?.length ? `${r.data.length} approved template${r.data.length === 1 ? "" : "s"} ready` : "Synced. No approved templates found on Meta yet.");
    } catch (e) { toast.error(err(e, "Sync failed")); }
    finally { setSyncing(false); }
  };
  const { data: acc } = useQuery({ queryKey: ["whatsapp-accounts"], queryFn: () => axios.get("/api/settings/whatsapp").then((r) => r.data.accounts as Account[]) });
  const { data: aud, isFetching: audLoading } = useQuery({
    queryKey: ["audience", mode, tags.join(","), stage],
    queryFn: () => axios.get("/api/broadcasts/audience", { params: { mode, tags: tags.join(","), stage } }).then((r) => r.data as { eligible: number; excluded: number; tags: { tag: string; count: number }[]; stages: { stage: string; count: number }[]; sample: { id: string; name: string | null; phone: string }[] }),
    placeholderData: (p) => p,
  });

  const accounts = (acc ?? []).filter((a) => a.isActive);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!accountId && accounts.length === 1) setAccountId(accounts[0].id);
  }, [accounts, accountId]);

  const template = tpl?.find((t) => t.id === templateId) ?? null;
  const placeholders = useMemo(() => (template ? placeholdersOf(template.body) : []), [template]);
  const [previewIdx, setPreviewIdx] = useState(0);
  const [showMobilePreview, setShowMobilePreview] = useState(false);
  const samples = aud?.sample ?? [];
  const sample = samples.length ? samples[previewIdx % samples.length] : undefined;
  const valueFor = (i: number): { text: string; missing: boolean } => {
    const v = vars[i];
    if (!v) return { text: placeholders[i], missing: true };
    if (v.source === "name") return sample?.name ? { text: sample.name, missing: false } : { text: v.value || "there", missing: !v.value };
    if (v.source === "phone") return { text: sample ? `+${sample.phone}` : "+91 98765 43210", missing: !sample };
    if (v.source === "email") return { text: v.value || "customer@email.com", missing: true };
    return v.value ? { text: v.value, missing: false } : { text: placeholders[i], missing: true };
  };

  const pickTemplate = (id: string) => {
    setTemplateId(id);
    const t = tpl?.find((x) => x.id === id);
    setVars(t ? placeholdersOf(t.body).map((_, i) => ({ source: i === 0 ? "name" : "text", value: "" })) : []);
  };

  const step0Ok = name.trim().length >= 2 && accountId && templateId && vars.every((v) => v.source !== "text" || v.value.trim());
  const step1Ok = (aud?.eligible ?? 0) > 0 && (mode !== "tags" || tags.length > 0);
  const step2Ok = when !== "later" || (scheduledAt && new Date(scheduledAt).getTime() > openedAt);

  const create = async () => {
    setSaving(true);
    try {
      const r = await axios.post("/api/broadcasts", {
        name, templateId, whatsappAccountId: accountId, variables: vars,
        audience: mode === "tags" ? { mode, tags } : mode === "stage" ? { mode, stage } : { mode: "all" },
        scheduledAt: when === "later" ? new Date(scheduledAt).toISOString() : null,
        sendNow: when === "now",
      });
      toast.success(r.data.started ? "Broadcast is sending" : when === "later" ? "Broadcast scheduled" : "Saved as draft");
      onCreated();
    } catch (e) { toast.error(err(e)); }
    finally { setSaving(false); }
  };

  const steps = ["Message", "Audience", "Send"];
  const input = "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500";

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label="New broadcast">
      <div className="absolute inset-0 bg-slate-950/50 admin-fade" onClick={onClose} />
      <div className="relative w-full sm:max-w-3xl max-h-[94dvh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white shadow-2xl admin-pop">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <div className="flex-1">
            <h3 className="text-base font-bold text-slate-900">New broadcast</h3>
            <div className="mt-2 flex items-center gap-2">
              {steps.map((s, i) => (
                <div key={s} className="flex items-center gap-2 flex-1">
                  <span className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0", i < step ? "bg-[#25D366] text-white" : i === step ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-400")}>
                    {i < step ? <Icon name="check" className="w-3.5 h-3.5" /> : i + 1}
                  </span>
                  <span className={cn("text-xs font-semibold hidden sm:inline", i === step ? "text-slate-900" : "text-slate-400")}>{s}</span>
                  {i < steps.length - 1 && <span className="flex-1 h-px bg-slate-200" />}
                </div>
              ))}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 self-start flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"><Icon name="close" className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
            <div className="space-y-4 min-w-0">
              {step === 0 && (
                <>
                  <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-600">Broadcast name</span>
                    <input className={input} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder={`Diwali offer ${new Date().getFullYear()}`} /></label>
                  <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-600">Send from</span>
                    <select className={input} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                      <option value="">Choose a WhatsApp number</option>
                      {accounts.map((a) => <option key={a.id} value={a.id}>{a.displayName} (+{a.phoneNumber})</option>)}
                    </select>
                    {acc && !accounts.length && <span className="block text-[11px] text-red-500">No active WhatsApp number. Connect one in Settings → WhatsApp.</span>}
                  </label>
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold text-slate-600">Template</span>
                    {tpl && !tpl.length ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-2">
                        <p>No approved templates in ChatFlow yet. If you already have templates in Meta (e.g. <code>hello_world</code>), import them now, or <a href="/templates" className="font-semibold underline">create one</a> and wait for approval.</p>
                        <button type="button" onClick={syncTemplates} disabled={syncing}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 font-semibold text-white hover:bg-amber-700 disabled:opacity-60">
                          <Icon name="refresh" className={cn("w-3.5 h-3.5", syncing && "animate-spin")} /> {syncing ? "Syncing…" : "Sync templates from Meta"}
                        </button>
                      </div>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {tpl?.map((t) => (
                          <button key={t.id} type="button" onClick={() => pickTemplate(t.id)}
                            className={cn("text-left rounded-xl border-2 p-3 transition", templateId === t.id ? "border-green-500 bg-green-50/40" : "border-slate-200 hover:border-slate-300")}>
                            <p className="text-sm font-semibold text-slate-900 truncate">{t.name}</p>
                            <p className="text-[10px] text-slate-400 uppercase">{t.category} · {t.language}</p>
                            <p className="mt-1 text-xs text-slate-500 line-clamp-2">{t.body}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {placeholders.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs font-semibold text-slate-600">Personalise variables</span>
                      {placeholders.map((p, i) => (
                        <div key={p} className="grid grid-cols-[56px_1fr] sm:grid-cols-[56px_160px_1fr] gap-2 items-center">
                          <span className="text-xs font-mono font-bold text-slate-700">{p}</span>
                          <select className={input} value={vars[i]?.source ?? "text"} onChange={(e) => { const v = [...vars]; v[i] = { ...(v[i] ?? { value: "" }), source: e.target.value as VarSource["source"] }; setVars(v); }}>
                            <option value="name">Contact name</option><option value="phone">Phone</option><option value="email">Email</option><option value="text">Custom text</option>
                          </select>
                          <input className={cn(input, "col-span-2 sm:col-span-1")} value={vars[i]?.value ?? ""} onChange={(e) => { const v = [...vars]; v[i] = { ...(v[i] ?? { source: "text" }), value: e.target.value }; setVars(v); }}
                            placeholder={vars[i]?.source === "text" ? "Value for everyone" : "Fallback if missing (optional)"} />
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {step === 1 && (
                <>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {([["all", "All contacts", "group"], ["tags", "By tags", "sell"], ["stage", "By stage", "monitoring"]] as const).map(([m, label, icon]) => (
                      <button key={m} type="button" onClick={() => setMode(m)}
                        className={cn("rounded-xl border-2 p-3 text-left transition", mode === m ? "border-green-500 bg-green-50/40" : "border-slate-200 hover:border-slate-300")}>
                        <Icon name={icon} className="w-5 h-5 text-slate-500" />
                        <p className="mt-1 text-sm font-semibold text-slate-900">{label}</p>
                      </button>
                    ))}
                  </div>
                  {mode === "tags" && (
                    <div className="space-y-2">
                      <span className="text-xs font-semibold text-slate-600">Send to contacts with any of these tags</span>
                      {aud?.tags.length ? (
                        <div className="flex flex-wrap gap-1.5">
                          {aud.tags.map((t) => {
                            const on = tags.includes(t.tag);
                            return (
                              <button key={t.tag} type="button" onClick={() => setTags(on ? tags.filter((x) => x !== t.tag) : [...tags, t.tag])}
                                className={cn("rounded-full border px-3 py-1 text-xs font-semibold", on ? "border-green-500 bg-green-50 text-green-700" : "border-slate-200 text-slate-600")}>
                                #{t.tag} <span className="text-slate-400 font-normal">{t.count}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : <p className="text-xs text-slate-500">No tags yet. Add tags to contacts on the Contacts page.</p>}
                    </div>
                  )}
                  {mode === "stage" && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {aud?.stages.map((s) => (
                        <button key={s.stage} type="button" onClick={() => setStage(s.stage)}
                          className={cn("rounded-xl border-2 p-3 text-left", stage === s.stage ? "border-green-500 bg-green-50/40" : "border-slate-200")}>
                          <p className="text-xs font-semibold text-slate-800">{s.stage.charAt(0) + s.stage.slice(1).toLowerCase()}</p>
                          <p className="text-lg font-bold text-slate-900 tabular-nums">{fmt(s.count)}</p>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <div className="flex items-baseline gap-2">
                      <p className="text-3xl font-bold text-slate-900 tabular-nums">{audLoading && !aud ? "…" : fmt(aud?.eligible)}</p>
                      <p className="text-sm text-slate-500">recipients</p>
                    </div>
                    {!!aud?.excluded && <p className="mt-1 text-xs text-slate-500"><Icon name="block" className="w-3 h-3 inline" /> {fmt(aud.excluded)} opted-out or blocked contacts are always excluded.</p>}
                    {!!aud?.sample.length && (
                      <ul className="mt-3 flex flex-wrap gap-1.5">
                        {aud.sample.map((c) => <li key={c.id} className="rounded-full bg-white border border-slate-200 px-2.5 py-1 text-[11px] text-slate-600">{c.name ?? `+${c.phone}`}</li>)}
                        {aud.eligible > aud.sample.length && <li className="px-1 py-1 text-[11px] text-slate-400">+{fmt(aud.eligible - aud.sample.length)} more</li>}
                      </ul>
                    )}
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {([["now", "Send now", "send"], ["later", "Schedule", "schedule"], ["draft", "Save draft", "edit"]] as const).map(([w, label, icon]) => (
                      <button key={w} type="button" onClick={() => setWhen(w)}
                        className={cn("rounded-xl border-2 p-3 text-left", when === w ? "border-green-500 bg-green-50/40" : "border-slate-200 hover:border-slate-300")}>
                        <Icon name={icon} className="w-5 h-5 text-slate-500" /><p className="mt-1 text-sm font-semibold text-slate-900">{label}</p>
                      </button>
                    ))}
                  </div>
                  {when === "later" && (
                    <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-600">Send at (your local time)</span>
                      <input type="datetime-local" className={input} value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} min={new Date(openedAt + 5 * 60000).toISOString().slice(0, 16)} /></label>
                  )}
                  <dl className="rounded-2xl border border-slate-200 divide-y divide-slate-100 text-sm">
                    {[["Name", name], ["From", accounts.find((a) => a.id === accountId)?.displayName ?? "—"], ["Template", template?.name ?? "—"],
                      ["Audience", mode === "all" ? "All contacts" : mode === "tags" ? tags.map((x) => `#${x}`).join(", ") : stage.toLowerCase()],
                      ["Recipients", fmt(aud?.eligible)]].map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-4 px-4 py-2.5"><dt className="text-slate-500">{k}</dt><dd className="font-semibold text-slate-900 text-right truncate">{v}</dd></div>
                    ))}
                  </dl>
                  <p className="text-[11px] text-slate-500">Meta charges per template message based on category and country. Contacts who opt out are skipped automatically.</p>
                </>
              )}
            </div>

            {/* Live preview (side column on desktop, toggle on mobile) */}
            <div className={cn("lg:block", showMobilePreview ? "block" : "hidden")}>
              <PhonePreview
                template={template}
                businessName={accounts.find((a) => a.id === accountId)?.displayName ?? "Your business"}
                valueFor={valueFor}
                placeholders={placeholders}
                recipients={aud?.eligible ?? null}
                sampleName={sample ? sample.name ?? `+${sample.phone}` : null}
                canCycle={samples.length > 1}
                onCycle={() => setPreviewIdx((i) => i + 1)}
              />
            </div>
          </div>
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-slate-100 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button onClick={() => (step ? setStep(step - 1) : onClose())} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">{step ? "Back" : "Cancel"}</button>
          <button onClick={() => setShowMobilePreview((v) => !v)} aria-pressed={showMobilePreview}
            className={cn("lg:hidden inline-flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-semibold", showMobilePreview ? "border-green-500 bg-green-50 text-green-700" : "border-slate-200 text-slate-600")}>
            <Icon name="smartphone" className="w-4 h-4" /> Preview
          </button>
          <div className="flex-1" />
          {step < 2 ? (
            <button onClick={() => setStep(step + 1)} disabled={step === 0 ? !step0Ok : !step1Ok}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Next <Icon name="arrow_forward" className="w-4 h-4" /></button>
          ) : (
            <button onClick={create} disabled={saving || !step2Ok}
              className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1fb857] disabled:opacity-50">
              {saving && <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />}
              {when === "now" ? `Send to ${fmt(aud?.eligible)}` : when === "later" ? "Schedule" : "Save draft"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── WhatsApp-style phone preview ────────────────────────────────────────────
interface PreviewButton { type?: string; text?: string }

function PhonePreview({ template, businessName, valueFor, placeholders, recipients, sampleName, canCycle, onCycle }: {
  template: Template | null; businessName: string; valueFor: (i: number) => { text: string; missing: boolean };
  placeholders: string[]; recipients: number | null; sampleName: string | null; canCycle: boolean; onCycle: () => void;
}) {
  // Split the body into text + variable segments so values can be highlighted.
  const segments = useMemo(() => {
    if (!template) return [];
    return template.body.split(/(\{\{\d+\}\})/g).filter(Boolean).map((part) => {
      const idx = placeholders.indexOf(part);
      return idx >= 0 ? { var: true as const, ...valueFor(idx) } : { var: false as const, text: part, missing: false };
    });
  }, [template, placeholders, valueFor]);

  const buttons: PreviewButton[] = Array.isArray(template?.buttons) ? (template!.buttons as PreviewButton[]).filter((b) => b?.text).slice(0, 10) : [];
  const btnIcon = (t?: string) => (t === "URL" ? "language" : t === "PHONE_NUMBER" ? "call" : t === "OTP" ? "content_copy" : "reply");
  const length = template ? segments.reduce((n, s) => n + s.text.length, 0) : 0;
  const missing = segments.filter((s) => s.var && s.missing).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-600">Live preview</p>
        {sampleName && (
          <button type="button" onClick={onCycle} disabled={!canCycle}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600 enabled:hover:bg-slate-50 disabled:opacity-70">
            <Icon name="person" className="w-3 h-3" /> {sampleName} {canCycle && <Icon name="refresh" className="w-3 h-3" />}
          </button>
        )}
      </div>

      <div className="mx-auto w-full max-w-[280px] rounded-[2rem] border-[7px] border-slate-900 bg-slate-900 shadow-xl overflow-hidden">
        {/* chat header */}
        <div className="flex items-center gap-2 bg-[#075e54] px-3 py-2 text-white">
          <Icon name="arrow_back" className="w-4 h-4 opacity-80" />
          <span className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-[11px] font-bold">{businessName[0]?.toUpperCase()}</span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="text-[12px] font-semibold flex items-center gap-1 leading-4">
              <span className="truncate">{businessName}</span>
              <Icon name="verified" filled className="w-3.5 h-3.5 shrink-0 text-[#25D366]" />
            </p>
            <p className="text-[9px] opacity-75">Business account</p>
          </div>
          <Icon name="more_horiz" className="w-4 h-4 opacity-80" />
        </div>

        {/* chat body */}
        <div className="min-h-[300px] max-h-[420px] overflow-y-auto bg-[#efeae2] [background-image:radial-gradient(#d9d3c7_1px,transparent_1px)] [background-size:16px_16px] px-2.5 py-3">
          <div className="flex justify-center mb-2"><span className="rounded-md bg-white/90 px-2 py-0.5 text-[9px] font-semibold text-slate-500 shadow-sm">TODAY</span></div>
          {template ? (
            <div className="max-w-[92%]">
              <div className="rounded-xl rounded-tl-sm bg-white shadow-sm overflow-hidden">
                {template.headerType && template.headerType !== "TEXT" && template.headerType !== "NONE" ? (
                  <div className="h-24 bg-slate-200 flex flex-col items-center justify-center gap-1 text-slate-500">
                    <Icon name={template.headerType === "VIDEO" ? "videocam" : template.headerType === "DOCUMENT" ? "description" : "image"} className="w-6 h-6" />
                    <span className="text-[9px] font-semibold uppercase">{template.headerType.toLowerCase()}</span>
                  </div>
                ) : null}
                <div className="px-2.5 pt-2 pb-1.5">
                  {template.headerContent && (template.headerType === "TEXT" || !template.headerType) && (
                    <p className="text-[12.5px] font-bold text-slate-900 mb-1">{template.headerContent}</p>
                  )}
                  <p className="text-[12.5px] leading-snug text-slate-900 whitespace-pre-wrap break-words">
                    {segments.map((sg, i) => sg.var ? (
                      <span key={i} className={cn("rounded px-0.5 font-semibold", sg.missing ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800")}>{sg.text}</span>
                    ) : <span key={i}>{sg.text}</span>)}
                  </p>
                  {template.footer && <p className="mt-1 text-[10.5px] text-slate-400">{template.footer}</p>}
                  <p className="mt-0.5 text-right text-[9px] text-slate-400">10:42 am</p>
                </div>
                {buttons.length > 0 && (
                  <div className="border-t border-slate-100 divide-y divide-slate-100">
                    {buttons.map((b, i) => (
                      <div key={i} className="flex items-center justify-center gap-1.5 py-1.5 text-[12px] font-medium text-[#0b93f6]">
                        <Icon name={btnIcon(b.type)} className="w-3.5 h-3.5" /> {b.text}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="max-w-[85%] space-y-2">
              <div className="rounded-xl rounded-tl-sm bg-white/80 p-2.5 space-y-1.5">
                <div className="h-2 w-3/4 rounded bg-slate-200" /><div className="h-2 w-full rounded bg-slate-200" /><div className="h-2 w-1/2 rounded bg-slate-200" />
              </div>
              <p className="text-[11px] text-slate-500 text-center pt-6">Pick a template to see exactly what customers will receive</p>
            </div>
          )}
        </div>

        {/* fake composer */}
        <div className="flex items-center gap-1.5 bg-[#f0f0f0] px-2 py-1.5">
          <div className="flex-1 rounded-full bg-white px-3 py-1 text-[10px] text-slate-400">Message</div>
          <span className="w-6 h-6 rounded-full bg-[#25D366] flex items-center justify-center"><Icon name="mic" className="w-3 h-3 text-white" /></span>
        </div>
      </div>

      {template && (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
          <span><b className="text-slate-700">{length}</b>/1024 chars</span>
          <span className="uppercase">{template.category.toLowerCase()} · {template.language}</span>
          {recipients !== null && <span><b className="text-slate-700">{recipients.toLocaleString("en-IN")}</b> recipients</span>}
          {missing > 0 && <span className="text-amber-600 font-semibold">{missing} variable{missing > 1 ? "s" : ""} need a value</span>}
        </div>
      )}
    </div>
  );
}

// ─── Report drawer ───────────────────────────────────────────────────────────
function ReportDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const [filter, setFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const { data } = useQuery({
    queryKey: ["broadcast", id, filter, page],
    queryFn: () => axios.get(`/api/broadcasts/${id}`, { params: { recipientStatus: filter || undefined, page } }).then((r) => r.data as {
      broadcast: Broadcast & { template: { name: string; body: string } | null };
      counts: Record<string, number>; recipientTotal: number;
      recipients: { id: string; status: string; sentAt: string | null; readAt: string | null; failReason: string | null; contact: { name: string | null; phone: string } }[];
    }),
    refetchInterval: (q) => ((q.state.data as { broadcast?: Broadcast } | undefined)?.broadcast?.status === "RUNNING" ? 3000 : false),
    placeholderData: (p) => p,
  });
  const b = data?.broadcast;
  const rs: Record<string, string> = { PENDING: "bg-slate-100 text-slate-600", SENT: "bg-sky-50 text-sky-700", DELIVERED: "bg-green-50 text-green-700", READ: "bg-green-100 text-green-800", FAILED: "bg-red-50 text-red-600" };

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Broadcast report">
      <div className="absolute inset-0 bg-slate-950/40 admin-fade" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 w-full sm:w-[520px] bg-white shadow-2xl flex flex-col admin-pop">
        <div className="flex items-center gap-3 px-5 h-16 border-b border-slate-100 shrink-0">
          <div className="min-w-0 flex-1"><p className="text-sm font-bold text-slate-900 truncate">{b?.name ?? "Loading…"}</p>{b && <p className="text-[11px] text-slate-500">{b.template?.name}</p>}</div>
          {b && <StatusPill s={b.status} />}
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"><Icon name="close" className="w-4 h-4" /></button>
        </div>
        {!b ? <div className="p-5 space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />)}</div> : (
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[["Sent", b.sentCount, b.totalCount], ["Delivered", b.deliveredCount, b.sentCount], ["Read", b.readCount, b.deliveredCount], ["Failed", b.failedCount, b.totalCount]].map(([k, v, of]) => (
                <div key={k as string} className="rounded-xl bg-slate-50 p-3">
                  <p className="text-[11px] text-slate-500">{k}</p>
                  <p className="text-lg font-bold text-slate-900 tabular-nums">{fmt(v as number)}</p>
                  <p className="text-[10px] text-slate-400">{pct(v as number, of as number)}%</p>
                </div>
              ))}
            </div>
            <Funnel b={b} />
            {b.template?.body && <div className="rounded-2xl bg-[#efeae2] p-3"><p className="max-w-[90%] rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-[13px] whitespace-pre-wrap">{b.template.body}</p></div>}
            <div className="space-y-2">
              <div className="flex gap-1 overflow-x-auto no-scrollbar">
                {["", "PENDING", "SENT", "DELIVERED", "READ", "FAILED"].map((s) => (
                  <button key={s || "all"} onClick={() => { setFilter(s); setPage(1); }}
                    className={cn("shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold", filter === s ? "border-green-500 bg-green-50 text-green-700" : "border-slate-200 text-slate-600")}>
                    {s ? s.charAt(0) + s.slice(1).toLowerCase() : "All"} {s && <span className="text-slate-400">{data?.counts[s] ?? 0}</span>}
                  </button>
                ))}
              </div>
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
                {data.recipients.map((r) => (
                  <li key={r.id} className="flex items-start gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 truncate">{r.contact.name ?? `+${r.contact.phone}`}</p>
                      <p className="text-[11px] text-slate-400">+{r.contact.phone}{r.sentAt && ` · ${timeAgo(r.sentAt)}`}</p>
                      {r.failReason && <p className="text-[11px] text-red-600 mt-0.5">{r.failReason}</p>}
                    </div>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", rs[r.status])}>{r.status.charAt(0) + r.status.slice(1).toLowerCase()}</span>
                  </li>
                ))}
                {!data.recipients.length && <li className="px-3 py-6 text-center text-xs text-slate-400">No recipients in this view</li>}
              </ul>
              {data.recipientTotal > 50 && (
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{(page - 1) * 50 + 1}–{Math.min(page * 50, data.recipientTotal)} of {fmt(data.recipientTotal)}</span>
                  <div className="flex gap-1">
                    <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-lg border border-slate-200 px-2 py-1 disabled:opacity-40">Prev</button>
                    <button disabled={page * 50 >= data.recipientTotal} onClick={() => setPage(page + 1)} className="rounded-lg border border-slate-200 px-2 py-1 disabled:opacity-40">Next</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
