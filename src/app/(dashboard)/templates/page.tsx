"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";
import { cn, timeAgo } from "@/lib/utils";
import { MessageBubble, PhonePreview } from "@/components/templates/template-preview";
import { TemplateBuilder, type BuilderAccount } from "@/components/templates/template-builder";
import {
  TEMPLATE_CATEGORIES, emptyDraft, hasUnsupportedParts, languageLabel, normalizeName, parseExtras, rowToDraft,
  type TemplateCategoryT, type TemplateDraft, type TemplateStatusT,
} from "@/components/templates/template-utils";

interface Template {
  id: string; name: string; category: TemplateCategoryT; language: string; status: TemplateStatusT; metaTemplateId: string | null;
  headerType: string | null; headerContent: string | null; body: string; footer: string | null; buttons: unknown;
  rejectionReason: string | null; submittedAt: string | null; approvedAt: string | null; createdAt: string; updatedAt: string;
  _count: { broadcasts: number };
}
interface ListData {
  templates: Template[];
  counts: { total: number; status: Record<TemplateStatusT, number>; category: Record<TemplateCategoryT, number> };
  accounts: BuilderAccount[];
  canManage: boolean;
}
interface SyncResult { total: number; imported: number; updated: number; removed: number; errors: string[]; syncedAt: string }

const err = (e: unknown, f = "Something went wrong") => (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? f;

const STATUS: Record<TemplateStatusT, { label: string; cls: string; icon: string }> = {
  APPROVED: { label: "Approved", cls: "bg-green-50 text-green-700", icon: "check_circle" },
  PENDING: { label: "In review", cls: "bg-amber-50 text-amber-700", icon: "hourglass_top" },
  REJECTED: { label: "Rejected", cls: "bg-red-50 text-red-600", icon: "cancel" },
  DRAFT: { label: "Draft", cls: "bg-slate-100 text-slate-600", icon: "edit" },
  PAUSED: { label: "Paused", cls: "bg-orange-50 text-orange-700", icon: "pause" },
  DELETED: { label: "Deleted", cls: "bg-slate-100 text-slate-400", icon: "delete" },
};
const CATEGORY: Record<TemplateCategoryT, { label: string; icon: string; color: string }> = {
  MARKETING: { label: "Marketing", icon: "campaign", color: "#8b5cf6" },
  UTILITY: { label: "Utility", icon: "task_alt", color: "#0ea5e9" },
  AUTHENTICATION: { label: "Authentication", icon: "key", color: "#f59e0b" },
};
const FILTERS = ["ALL", "APPROVED", "PENDING", "REJECTED", "DRAFT", "PAUSED", "DELETED"] as const;
type Filter = (typeof FILTERS)[number];

function StatusPill({ s }: { s: TemplateStatusT }) {
  const st = STATUS[s] ?? STATUS.DRAFT;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap", st.cls)}>
      <Icon name={st.icon} className="w-3 h-3" /> {st.label}
    </span>
  );
}

function ActionBtn({ icon, children, onClick, primary, danger, disabled }: { icon: string; children: React.ReactNode; onClick: () => void; primary?: boolean; danger?: boolean; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className={cn("inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-50",
      primary ? "bg-[#25D366] text-white hover:bg-[#1fb857]" : danger ? "border border-red-100 text-red-500 hover:bg-red-50" : "border border-slate-200 text-slate-600 hover:bg-slate-50")}>
      <Icon name={icon} className="w-3.5 h-3.5" /> {children}
    </button>
  );
}

const previewOf = (t: Template) => {
  const x = parseExtras(t.buttons);
  return {
    headerText: t.headerType === "TEXT" ? t.headerContent : null,
    mediaHeader: x.mediaHeader ?? (t.headerType && t.headerType !== "TEXT" ? t.headerType : null),
    body: t.body, footer: t.footer, buttons: x.buttons,
    examples: t.category === "AUTHENTICATION" && !x.examples.length ? ["123456"] : x.examples,
  };
};

type BuilderState = { draft: TemplateDraft; id?: string; lock?: boolean } | null;

export default function TemplatesPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Filter>("ALL");
  const [category, setCategory] = useState<"ALL" | TemplateCategoryT>("ALL");
  const [search, setSearch] = useState("");
  const [builder, setBuilder] = useState<BuilderState>(null);
  const [viewing, setViewing] = useState<Template | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["templates", status, category, search],
    queryFn: () => axios.get("/api/templates", { params: { status: status === "ALL" ? undefined : status, category: category === "ALL" ? undefined : category, search: search || undefined } }).then((r) => r.data as ListData),
    placeholderData: (p) => p,
    // Keep polling while Meta is reviewing something.
    refetchInterval: (q) => ((q.state.data as ListData | undefined)?.counts.status.PENDING ? 30000 : false),
  });
  const list = data?.templates ?? [];
  const canManage = !!data?.canManage;
  const accounts = data?.accounts ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ["templates"] });

  const sync = useMutation({
    mutationFn: (opts: { silent?: boolean }) => axios.post("/api/templates/sync").then((r) => ({ ...(r.data as SyncResult), silent: !!opts.silent })),
    onSuccess: (r) => {
      refresh();
      qc.invalidateQueries({ queryKey: ["templates-approved"] });
      if (r.errors.length) toast.warning(`Synced with some problems: ${r.errors[0]}`);
      else if (!r.silent || r.imported || r.updated || r.removed) {
        const parts = [r.imported && `${r.imported} imported`, r.updated && `${r.updated} updated`, r.removed && `${r.removed} removed`].filter(Boolean);
        toast.success(`Synced ${r.total} template${r.total === 1 ? "" : "s"} from Meta${parts.length ? ` · ${parts.join(", ")}` : ""}`);
      }
    },
    onError: (e, opts) => { if (!opts.silent) toast.error(err(e, "Sync failed")); },
  });

  // Pull fresh statuses from Meta once per visit when something is awaiting review.
  const autoSynced = useRef(false);
  const pending = data?.counts.status.PENDING ?? 0;
  useEffect(() => {
    if (autoSynced.current || !accounts.length || !pending) return;
    autoSynced.current = true;
    sync.mutate({ silent: true });
  }, [accounts.length, pending, sync]);

  const openNew = () => setBuilder({ draft: emptyDraft() });
  const openEdit = (t: Template) => { setViewing(null); setBuilder({ draft: rowToDraft(t), id: t.id, lock: !!t.metaTemplateId && t.status !== "DRAFT" }); };
  const duplicate = (t: Template) => {
    setViewing(null);
    const d = rowToDraft(t);
    if (hasUnsupportedParts(t)) toast.info("Media headers, dynamic links and special buttons aren't copied");
    setBuilder({ draft: { ...d, name: normalizeName(`${t.name}_copy`) } });
  };

  const submit = async (t: Template) => {
    setBusyId(t.id);
    try {
      const r = await axios.post(`/api/templates/${t.id}/submit`, { accountId: accounts[0]?.id });
      toast.success(r.data.template?.status === "APPROVED" ? "Template approved by Meta" : "Submitted to Meta for review");
      refresh();
      setViewing(null);
    } catch (e) { toast.error(err(e, "Submission failed"), { duration: 8000 }); }
    finally { setBusyId(null); }
  };

  const remove = async (t: Template) => {
    const onMeta = !!t.metaTemplateId && t.status !== "DRAFT" && t.status !== "DELETED";
    if (!confirm(`Delete "${t.name}" (${t.language})?${onMeta ? "\n\nIt will also be deleted from your WhatsApp Business account on Meta. Meta won't let you reuse this name for 30 days." : ""}`)) return;
    setBusyId(t.id);
    try {
      let r;
      try {
        r = await axios.delete(`/api/templates/${t.id}`);
      } catch (e) {
        const data = (e as { response?: { data?: { canDeleteLocally?: boolean; error?: string } } }).response?.data;
        if (!data?.canDeleteLocally || !confirm(`${data.error}\n\nRemove it from this app only?`)) throw e;
        r = await axios.delete(`/api/templates/${t.id}`, { params: { localOnly: 1 } });
      }
      toast.success(r.data.archived ? "Template deleted (kept in broadcast history)" : "Template deleted");
      setViewing(null);
      refresh();
    } catch (e) { toast.error(err(e, "Delete failed"), { duration: 8000 }); }
    finally { setBusyId(null); }
  };

  const c = data?.counts;
  const stats: { key: Filter; label: string; value: number; icon: string; color: string }[] = [
    { key: "ALL", label: "All templates", value: c?.total ?? 0, icon: "description", color: "#25D366" },
    { key: "APPROVED", label: "Approved", value: c?.status.APPROVED ?? 0, icon: "check_circle", color: "#16a34a" },
    { key: "PENDING", label: "In review", value: c?.status.PENDING ?? 0, icon: "hourglass_top", color: "#f59e0b" },
    { key: "REJECTED", label: "Rejected", value: (c?.status.REJECTED ?? 0) + (c?.status.PAUSED ?? 0), icon: "cancel", color: "#ef4444" },
  ];
  const filtered = status !== "ALL" || category !== "ALL" || !!search;

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-8 space-y-5 max-w-7xl mx-auto w-full">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Message templates</h1>
          <p className="text-sm text-slate-500 mt-0.5">Pre-approved messages for broadcasts and for starting conversations after 24 hours.</p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          {accounts.length > 0 && (
            <button onClick={() => sync.mutate({})} disabled={sync.isPending}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60">
              <Icon name="refresh" className={cn("w-4 h-4", sync.isPending && "animate-spin")} /> <span>{sync.isPending ? "Syncing…" : "Sync from Meta"}</span>
            </button>
          )}
          {canManage && (
            <button onClick={openNew} className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-green-500/25 hover:bg-[#1fb857]">
              <Icon name="add" className="w-4 h-4" /> New template
            </button>
          )}
        </div>
      </div>

      {data && !accounts.length && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <Icon name="warning" className="w-5 h-5 text-amber-600 shrink-0" />
          <p className="flex-1 text-sm text-amber-900">Connect a WhatsApp number to submit templates to Meta and sync templates from your WhatsApp Business account.</p>
          <Link href="/settings?tab=whatsapp" className="shrink-0 rounded-xl bg-white border border-amber-200 px-3.5 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100">Connect WhatsApp</Link>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <button key={s.label} onClick={() => setStatus(s.key)}
            className={cn("text-left rounded-2xl border bg-white p-4 shadow-sm transition hover:border-slate-300", status === s.key ? "border-green-500 ring-2 ring-green-500/15" : "border-slate-200/70")}>
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${s.color}14`, color: s.color }}><Icon name={s.icon} className="w-4 h-4" /></span>
              <p className="text-xs font-medium text-slate-500">{s.label}</p>
            </div>
            <p className="mt-3 text-2xl font-bold text-slate-900 tabular-nums">{isLoading ? "–" : s.value.toLocaleString("en-IN")}</p>
          </button>
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="flex gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto no-scrollbar">
            {FILTERS.map((s) => (
              <button key={s} onClick={() => setStatus(s)}
                className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap", status === s ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800")}>
                {s === "ALL" ? "All" : STATUS[s].label}
                {s !== "ALL" && !!c?.status[s] && <span className="text-[10px] tabular-nums text-slate-400">{c.status[s]}</span>}
              </button>
            ))}
          </div>
          <div className="relative lg:w-72">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or text…"
              className="w-full pl-9 pr-9 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500" />
            {search && <button onClick={() => setSearch("")} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100"><Icon name="close" className="w-3.5 h-3.5" /></button>}
          </div>
        </div>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {(["ALL", ...TEMPLATE_CATEGORIES] as const).map((k) => (
            <button key={k} onClick={() => setCategory(k)}
              className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap", category === k ? "border-green-500 bg-green-50 text-green-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300")}>
              {k !== "ALL" && <Icon name={CATEGORY[k].icon} className="w-3.5 h-3.5" />}
              {k === "ALL" ? "All categories" : CATEGORY[k].label}
              {k !== "ALL" && <span className="text-slate-400 font-normal tabular-nums">{c?.category[k] ?? 0}</span>}
            </button>
          ))}
        </div>
      </div>

      {isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">Couldn&apos;t load templates. <button onClick={refresh} className="font-semibold underline">Try again</button></div>
      ) : isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-64 rounded-2xl bg-white border border-slate-200 animate-pulse" />)}</div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 px-6 text-center">
          <span className="mx-auto w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center"><Icon name="description" className="w-7 h-7 text-green-600" /></span>
          <p className="mt-3 text-sm font-semibold text-slate-800">{filtered ? "No templates match these filters" : "No templates yet"}</p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {filtered ? "Try another status, category or search." : "Create a template and submit it to Meta, or import the ones you already have in WhatsApp Business Manager."}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {filtered ? (
              <button onClick={() => { setStatus("ALL"); setCategory("ALL"); setSearch(""); }} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Clear filters</button>
            ) : (
              <>
                {canManage && <button onClick={openNew} className="rounded-xl bg-[#25D366] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1fb857]">Create a template</button>}
                {accounts.length > 0 && <button onClick={() => sync.mutate({})} disabled={sync.isPending} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Import from Meta</button>}
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((t) => (
            <TemplateCard key={t.id} t={t} canManage={canManage} busy={busyId === t.id} hasAccount={accounts.length > 0}
              onView={() => setViewing(t)} onEdit={() => openEdit(t)} onDuplicate={() => duplicate(t)} onSubmit={() => submit(t)} onDelete={() => remove(t)} />
          ))}
        </div>
      )}

      {sync.data?.syncedAt && <p className="text-center text-[11px] text-slate-400">Last synced with Meta {timeAgo(sync.data.syncedAt)}</p>}

      {builder && (
        <TemplateBuilder initial={builder.draft} templateId={builder.id} lockIdentity={builder.lock} accounts={accounts}
          onClose={() => setBuilder(null)} onSaved={refresh} />
      )}
      {viewing && (
        <DetailsModal t={viewing} canManage={canManage} busy={busyId === viewing.id} hasAccount={accounts.length > 0} onClose={() => setViewing(null)}
          onEdit={() => openEdit(viewing)} onDuplicate={() => duplicate(viewing)} onSubmit={() => submit(viewing)} onDelete={() => remove(viewing)} />
      )}
    </div>
  );
}

interface CardActions { canManage: boolean; busy: boolean; hasAccount: boolean; onEdit: () => void; onDuplicate: () => void; onSubmit: () => void; onDelete: () => void }

function Actions({ t, canManage, busy, hasAccount, onEdit, onDuplicate, onSubmit, onDelete }: CardActions & { t: Template }) {
  if (!canManage) {
    return t.status === "APPROVED" ? <Link href="/broadcasts" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"><Icon name="campaign" className="w-3.5 h-3.5" /> Use in broadcast</Link> : null;
  }
  const editable = ["DRAFT", "REJECTED", "PAUSED"].includes(t.status) && !hasUnsupportedParts(t);
  return (
    <>
      {t.status === "DRAFT" && <ActionBtn icon="send" primary disabled={busy || !hasAccount} onClick={onSubmit}>{busy ? "Submitting…" : "Submit"}</ActionBtn>}
      {editable && <ActionBtn icon="edit" onClick={onEdit}>{t.status === "DRAFT" ? "Edit" : "Edit & resubmit"}</ActionBtn>}
      {t.status === "APPROVED" && <Link href="/broadcasts" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"><Icon name="campaign" className="w-3.5 h-3.5" /> Broadcast</Link>}
      <ActionBtn icon="content_copy" onClick={onDuplicate}>Duplicate</ActionBtn>
      {t.status !== "DELETED" && <ActionBtn icon="delete" danger disabled={busy} onClick={onDelete}>Delete</ActionBtn>}
    </>
  );
}

function TemplateCard({ t, onView, ...a }: CardActions & { t: Template; onView: () => void }) {
  const cat = CATEGORY[t.category];
  return (
    <article className="rounded-2xl border border-slate-200/70 bg-white shadow-sm flex flex-col overflow-hidden">
      <div className="p-4 pb-3 flex items-start gap-3">
        <button onClick={onView} className="min-w-0 flex-1 text-left">
          <p className="text-sm font-bold text-slate-900 truncate font-mono hover:text-green-700">{t.name}</p>
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500 flex-wrap">
            <span className="inline-flex items-center gap-1 font-semibold" style={{ color: cat?.color }}><Icon name={cat?.icon ?? "description"} className="w-3 h-3" />{cat?.label ?? t.category}</span>
            <span className="text-slate-300">·</span>
            <span className="inline-flex items-center gap-1"><Icon name="language" className="w-3 h-3" />{languageLabel(t.language)}</span>
          </p>
        </button>
        <StatusPill s={t.status} />
      </div>
      <button onClick={onView} className="mx-4 rounded-xl bg-[#efeae2] p-3 flex flex-col text-left max-h-56 overflow-hidden relative" aria-label={`Preview ${t.name}`}>
        <MessageBubble {...previewOf(t)} compact />
      </button>
      {t.rejectionReason && (t.status === "REJECTED" || t.status === "PAUSED") && (
        <div className="mx-4 mt-3 rounded-xl bg-red-50 border border-red-100 px-3 py-2 flex gap-2 text-[11px] text-red-700">
          <Icon name="error" className="w-3.5 h-3.5 mt-px shrink-0" /><span className="min-w-0 break-words"><b>{t.status === "PAUSED" ? "Paused" : "Rejected"}:</b> {t.rejectionReason}</span>
        </div>
      )}
      <div className="flex-1" />
      <div className="px-4 pt-3 flex items-center gap-3 flex-wrap text-[11px] text-slate-400">
        <span className="inline-flex items-center gap-1"><Icon name="schedule" className="w-3 h-3" />
          {t.approvedAt && t.status === "APPROVED" ? `Approved ${timeAgo(t.approvedAt)}` : t.submittedAt ? `Submitted ${timeAgo(t.submittedAt)}` : `Updated ${timeAgo(t.updatedAt)}`}</span>
        {t._count.broadcasts > 0 && <span className="inline-flex items-center gap-1"><Icon name="campaign" className="w-3 h-3" />{t._count.broadcasts} broadcast{t._count.broadcasts > 1 ? "s" : ""}</span>}
      </div>
      <div className="m-4 mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-2">
        <Actions t={t} {...a} />
        <span className="flex-1" />
        <button onClick={onView} aria-label="View details" className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100"><Icon name="visibility" className="w-4 h-4" /></button>
      </div>
    </article>
  );
}

function DetailsModal({ t, onClose, ...a }: CardActions & { t: Template; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ["template", t.id],
    queryFn: () => axios.get(`/api/templates/${t.id}`).then((r) => r.data as { template: Template; broadcasts: { id: string; name: string; status: string; createdAt: string }[] }),
  });
  const cur = data?.template ?? t;
  const x = parseExtras(cur.buttons);
  const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—");
  const rows: [string, React.ReactNode][] = [
    ["Status", <StatusPill key="s" s={cur.status} />],
    ["Category", CATEGORY[cur.category]?.label ?? cur.category],
    ["Language", `${languageLabel(cur.language)} (${cur.language})`],
    ["Variables", x.examples.length ? x.examples.map((e, i) => `{{${i + 1}}} = ${e}`).join(", ") : "None"],
    ["Meta ID", cur.metaTemplateId ?? "Not submitted"],
    ["Submitted", fmtDate(cur.submittedAt)],
    ["Approved", fmtDate(cur.approvedAt)],
    ["Created", fmtDate(cur.createdAt)],
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label="Template details">
      <div className="absolute inset-0 bg-slate-950/50 admin-fade" onClick={onClose} />
      <div className="relative w-full sm:max-w-3xl max-h-[94dvh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white shadow-2xl admin-pop">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-slate-900 truncate font-mono">{cur.name}</h3>
            <p className="text-[11px] text-slate-500">{CATEGORY[cur.category]?.label} · {languageLabel(cur.language)}</p>
          </div>
          <StatusPill s={cur.status} />
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"><Icon name="close" className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid gap-5 md:grid-cols-[1fr_300px]">
            <div className="space-y-4 min-w-0 order-2 md:order-1">
              {cur.rejectionReason && (cur.status === "REJECTED" || cur.status === "PAUSED") && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 flex gap-2.5">
                  <Icon name="error" className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                  <div className="text-xs text-red-700">
                    <p className="font-semibold">{cur.status === "PAUSED" ? "Paused by Meta" : "Rejected by Meta"}</p>
                    <p className="mt-0.5 break-words">{cur.rejectionReason}</p>
                    <p className="mt-1.5 text-red-600/80">Fix the content and resubmit, or appeal in WhatsApp Business Manager.</p>
                  </div>
                </div>
              )}
              {cur.status === "PENDING" && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex gap-2.5 text-xs text-amber-800">
                  <Icon name="hourglass_top" className="w-4 h-4 mt-0.5 shrink-0" /><p>Meta is reviewing this template. Most reviews finish within minutes, some take up to 24 hours. Use &ldquo;Sync from Meta&rdquo; to check.</p>
                </div>
              )}
              {hasUnsupportedParts(cur) && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex gap-2.5 text-xs text-slate-600">
                  <Icon name="info" className="w-4 h-4 mt-0.5 shrink-0" /><p>This template uses media headers, dynamic links or special buttons. Manage it in WhatsApp Business Manager and sync here.</p>
                </div>
              )}
              <dl className="rounded-2xl border border-slate-200 divide-y divide-slate-100 text-sm">
                {rows.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 px-4 py-2.5"><dt className="text-slate-500 shrink-0">{k}</dt><dd className="font-medium text-slate-900 text-right min-w-0 break-words">{v}</dd></div>
                ))}
              </dl>
              {!!data?.broadcasts.length && (
                <div>
                  <p className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Used in broadcasts</p>
                  <ul className="rounded-2xl border border-slate-200 divide-y divide-slate-100">
                    {data.broadcasts.map((b) => (
                      <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                        <span className="truncate text-slate-800">{b.name}</span>
                        <span className="shrink-0 text-[11px] font-semibold text-slate-500">{b.status.charAt(0) + b.status.slice(1).toLowerCase()}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="order-1 md:order-2"><PhonePreview {...previewOf(cur)} /></div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 px-5 py-4 border-t border-slate-100 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Actions t={cur} {...a} />
          <span className="flex-1" />
          <button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Close</button>
        </div>
      </div>
    </div>
  );
}
