"use client";

import { useEffect, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";
import { cn, timeAgo } from "@/lib/utils";
import {
  STAGES, STAGE_META, displayName, prettyPhone,
  type ContactDetail, type ContactRow, type ContactStats, type Sort, type Stage, type StatusFilter,
} from "@/components/contacts/shared";
import { Avatar, Modal, Spinner, StagePill, TagChip, TagInput, errMsg, fmt, inputCls } from "@/components/contacts/ui";
import { ContactFormModal } from "@/components/contacts/contact-form-modal";
import { ContactDrawer } from "@/components/contacts/contact-drawer";
import { ImportModal } from "@/components/contacts/import-modal";

interface ListData { contacts: ContactRow[]; total: number; page: number; limit: number; pages: number }
type BulkAction = "addTag" | "removeTag" | "setStage" | "optOut" | "optIn" | "block" | "unblock" | "delete";

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const selectCls = "rounded-xl border border-slate-200 bg-white pl-3 pr-8 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500";

export default function ContactsPage() {
  const qc = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounced(searchInput.trim());
  const [stage, setStage] = useState<"" | Stage>("");
  const [tag, setTag] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [limit, setLimit] = useState(25);

  // Page resets to 1 whenever any filter changes (derived, no effect needed).
  const filterKey = JSON.stringify([search, stage, tag, status, sort, limit]);
  const [pageState, setPageState] = useState({ key: filterKey, page: 1 });
  const page = pageState.key === filterKey ? pageState.page : 1;
  const setPage = (p: number) => setPageState({ key: filterKey, page: p });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<null | "new" | ContactRow | ContactDetail>(null);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [tagAction, setTagAction] = useState<null | "addTag" | "removeTag">(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  const filterParams = { search: search || undefined, stage: stage || undefined, tag: tag || undefined, status: status === "all" ? undefined : status };

  const { data: stats } = useQuery({
    queryKey: ["contacts", "stats"],
    queryFn: () => axios.get("/api/contacts/stats").then((r) => r.data as ContactStats),
  });
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["contacts", "list", filterKey, page],
    queryFn: () => axios.get("/api/contacts", { params: { ...filterParams, sort, page, limit } }).then((r) => r.data as ListData),
    placeholderData: keepPreviousData,
  });

  const contacts = data?.contacts ?? [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;
  const tagNames = stats?.tags.map((t) => t.tag) ?? [];
  const hasFilters = !!(search || stage || tag || status !== "all");
  const selectedIds = contacts.filter((c) => selected.has(c.id)).map((c) => c.id);
  const allOnPage = contacts.length > 0 && selectedIds.length === contacts.length;

  const refresh = () => qc.invalidateQueries({ queryKey: ["contacts"] });
  const clearFilters = () => { setSearchInput(""); setStage(""); setTag(""); setStatus("all"); };
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setSelected(allOnPage ? new Set() : new Set(contacts.map((c) => c.id)));

  const bulk = async (action: BulkAction, extra: { tag?: string; stage?: Stage } = {}) => {
    if (!selectedIds.length) return;
    if (action === "delete" && !confirm(`Delete ${selectedIds.length} contact${selectedIds.length > 1 ? "s" : ""}? Contacts with chat or broadcast history will be kept.`)) return;
    setBusy(true);
    try {
      const r = await axios.post("/api/contacts/bulk", { ids: selectedIds, action, ...extra });
      const d = r.data as { updated?: number; deleted?: number; skipped?: number };
      if (action === "delete") {
        if (d.deleted) toast.success(`${fmt(d.deleted)} contact${d.deleted === 1 ? "" : "s"} deleted`);
        if (d.skipped) toast.warning(`${fmt(d.skipped)} kept because they have chat or broadcast history. Block or opt them out instead.`);
      } else {
        const label: Record<string, string> = { addTag: `Tagged #${extra.tag}`, removeTag: `Removed #${extra.tag}`, setStage: `Moved to ${extra.stage ? STAGE_META[extra.stage].label : ""}`, optOut: "Opted out", optIn: "Opted back in", block: "Blocked", unblock: "Unblocked" };
        toast.success(`${label[action]} · ${fmt(d.updated)} contact${d.updated === 1 ? "" : "s"}`);
      }
      setSelected(new Set());
      setTagAction(null);
      refresh();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const r = await axios.get("/api/contacts/export", { params: filterParams, responseType: "blob" });
      const url = URL.createObjectURL(r.data as Blob);
      const a = Object.assign(document.createElement("a"), { href: url, download: `contacts-${new Date().toISOString().slice(0, 10)}.csv` });
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${fmt(total)} contacts`);
    } catch (e) {
      const blob = (e as { response?: { data?: Blob } }).response?.data;
      const msg = blob instanceof Blob ? await blob.text().then((t) => { try { return JSON.parse(t).error as string; } catch { return null; } }) : null;
      toast.error(msg ?? "Export failed");
    } finally { setExporting(false); }
  };

  const statCards = [
    { label: "Total contacts", value: fmt(stats?.total), icon: "contacts", color: "#25D366", sub: `${fmt(stats?.stages.CUSTOMER)} customers` },
    { label: "New this week", value: fmt(stats?.newThisWeek), icon: "trending_up", color: "#0ea5e9", sub: "Added in the last 7 days" },
    { label: "Reachable", value: fmt(Math.max(0, (stats?.total ?? 0) - (stats?.optedOut ?? 0) - (stats?.blocked ?? 0))), icon: "check_circle", color: "#8b5cf6", sub: "Eligible for broadcasts" },
    { label: "Opted out", value: fmt(stats?.optedOut), icon: "person_remove", color: "#f59e0b", sub: `${fmt(stats?.blocked)} blocked`, onClick: () => setStatus("optedOut") },
  ];
  const stageTotal = Math.max(1, STAGES.reduce((a, s) => a + (stats?.stages[s] ?? 0), 0));
  const from = total ? (page - 1) * limit + 1 : 0;
  const to = Math.min(page * limit, total);

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-8 space-y-5 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Contacts</h1>
          <p className="text-sm text-slate-500 mt-0.5">Everyone you chat with on WhatsApp, organised by stage and tags.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setImporting(true)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <Icon name="upload" className="w-4 h-4" /> <span>Import</span>
          </button>
          <button onClick={exportCsv} disabled={exporting || !total} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            {exporting ? <Spinner /> : <Icon name="download" className="w-4 h-4" />} <span>Export</span>
          </button>
          <button onClick={() => setForm("new")} className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-green-500/25 hover:bg-[#1fb857]">
            <Icon name="person_add" className="w-4 h-4" /> Add contact
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map((s) => {
          const inner = (
            <>
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${s.color}14`, color: s.color }}><Icon name={s.icon} className="w-4 h-4" /></span>
                <p className="text-xs font-medium text-slate-500 truncate">{s.label}</p>
              </div>
              {stats ? <p className="mt-3 text-2xl font-bold text-slate-900 tabular-nums">{s.value}</p> : <div className="mt-3 h-8 w-16 rounded-lg bg-slate-100 animate-pulse" />}
              <p className="text-[11px] text-slate-400 truncate">{s.sub}</p>
            </>
          );
          return s.onClick ? (
            <button key={s.label} onClick={s.onClick} className="text-left rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm hover:border-slate-300 transition">{inner}</button>
          ) : (
            <div key={s.label} className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">{inner}</div>
          );
        })}
      </div>

      {/* Stage breakdown */}
      <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-700">Contacts by stage</p>
          {stage && <button onClick={() => setStage("")} className="text-[11px] font-semibold text-green-700 hover:underline">Show all stages</button>}
        </div>
        <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden flex">
          {STAGES.map((s) => (
            <div key={s} className={cn("h-full transition-all", stage && stage !== s && "opacity-30")} title={STAGE_META[s].label}
              style={{ width: `${((stats?.stages[s] ?? 0) / stageTotal) * 100}%`, background: STAGE_META[s].color }} />
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {STAGES.map((s) => (
            <button key={s} onClick={() => setStage(stage === s ? "" : s)} aria-pressed={stage === s}
              className={cn("flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition",
                stage === s ? "border-green-500 bg-green-50/50" : "border-slate-100 hover:border-slate-200 hover:bg-slate-50")}>
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: STAGE_META[s].color }} />
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] text-slate-500">{STAGE_META[s].label}</span>
                <span className="block text-sm font-bold text-slate-900 tabular-nums">{fmt(stats?.stages[s])}</span>
              </span>
              <span className="text-[11px] text-slate-400 tabular-nums">{Math.round(((stats?.stages[s] ?? 0) / stageTotal) * 100)}%</span>
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-2 lg:items-center">
        <div className="relative lg:w-80">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search name, phone or email…" type="search"
            className={cn(inputCls, "pl-9 pr-9")} aria-label="Search contacts" />
          {isFetching && !isLoading && <Spinner className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />}
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 lg:mx-0 lg:px-0 lg:flex-1">
          <select value={stage} onChange={(e) => setStage(e.target.value as "" | Stage)} className={selectCls} aria-label="Stage">
            <option value="">All stages</option>
            {STAGES.map((s) => <option key={s} value={s}>{STAGE_META[s].label}</option>)}
          </select>
          <select value={tag} onChange={(e) => setTag(e.target.value)} className={cn(selectCls, "max-w-[180px]")} aria-label="Tag">
            <option value="">All tags</option>
            {stats?.tags.map((t) => <option key={t.tag} value={t.tag}>#{t.tag} ({fmt(t.count)})</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} className={selectCls} aria-label="Status">
            <option value="all">Any status</option>
            <option value="active">Reachable</option>
            <option value="optedOut">Opted out</option>
            <option value="blocked">Blocked</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={selectCls} aria-label="Sort">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">Name A–Z</option>
            <option value="lastSeen">Recently active</option>
          </select>
          {hasFilters && (
            <button onClick={clearFilters} className="shrink-0 inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100">
              <Icon name="close" className="w-4 h-4" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="rounded-2xl border border-slate-200/70 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
          <input type="checkbox" checked={allOnPage} onChange={toggleAll} disabled={!contacts.length} aria-label="Select all on this page"
            className="w-4 h-4 rounded border-slate-300 text-green-600 focus:ring-green-500" />
          <p className="text-xs text-slate-500 flex-1">
            {selectedIds.length ? <span className="font-semibold text-slate-800">{selectedIds.length} selected</span>
              : isLoading ? "Loading…" : <>{fmt(total)} contact{total === 1 ? "" : "s"}{hasFilters && " match"}</>}
          </p>
          <button onClick={() => refetch()} aria-label="Refresh" className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <Icon name="refresh" className={cn("w-4 h-4", isFetching && "animate-spin")} />
          </button>
        </div>

        {isLoading ? (
          <div className="divide-y divide-slate-100">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="w-10 h-10 rounded-full bg-slate-100 animate-pulse" />
                <div className="flex-1 space-y-1.5"><div className="h-3 w-40 rounded bg-slate-100 animate-pulse" /><div className="h-2.5 w-24 rounded bg-slate-100 animate-pulse" /></div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="py-14 px-6 text-center">
            <Icon name="error" className="w-8 h-8 text-red-400" />
            <p className="mt-2 text-sm font-semibold text-slate-800">Couldn&apos;t load contacts</p>
            <button onClick={() => refetch()} className="mt-3 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Try again</button>
          </div>
        ) : contacts.length === 0 ? (
          <div className="py-16 px-6 text-center">
            <span className="mx-auto w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center"><Icon name={hasFilters ? "search" : "contacts"} className="w-7 h-7 text-green-600" /></span>
            <p className="mt-3 text-sm font-semibold text-slate-800">{hasFilters ? "No contacts match your filters" : "No contacts yet"}</p>
            <p className="text-xs text-slate-500 mt-1">{hasFilters ? "Try a different search or clear the filters." : "Contacts appear automatically when customers message you. You can also add or import them."}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {hasFilters ? (
                <button onClick={clearFilters} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Clear filters</button>
              ) : (
                <>
                  <button onClick={() => setForm("new")} className="rounded-xl bg-[#25D366] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1fb857]">Add contact</button>
                  <button onClick={() => setImporting(true)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Import CSV</button>
                </>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400 bg-slate-50/70">
                    <th className="w-10 px-4 py-2.5" />
                    <th className="px-2 py-2.5">Contact</th>
                    <th className="px-3 py-2.5">Phone</th>
                    <th className="px-3 py-2.5">Stage</th>
                    <th className="px-3 py-2.5">Tags</th>
                    <th className="px-3 py-2.5 text-right">Chats</th>
                    <th className="px-3 py-2.5 hidden lg:table-cell">Last seen</th>
                    <th className="px-3 py-2.5 hidden xl:table-cell">Added</th>
                    <th className="w-12 px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody className={cn("divide-y divide-slate-100", isFetching && "opacity-70")}>
                  {contacts.map((c) => (
                    <tr key={c.id} onClick={() => setDrawerId(c.id)} className={cn("cursor-pointer transition-colors", selected.has(c.id) ? "bg-green-50/50" : "hover:bg-slate-50/70")}>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Select ${displayName(c)}`}
                          className="w-4 h-4 rounded border-slate-300 text-green-600 focus:ring-green-500" />
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar name={c.name} seed={c.id} size="sm" />
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 font-semibold text-slate-900 truncate max-w-[220px]">
                              {c.name || <span className="text-slate-400 font-normal">Unnamed</span>}
                              {c.isBlocked && <Icon name="block" className="w-3.5 h-3.5 text-red-500" title="Blocked" />}
                              {c.optedOut && <Icon name="person_remove" className="w-3.5 h-3.5 text-amber-500" title="Opted out" />}
                            </p>
                            <p className="text-[11px] text-slate-400 truncate max-w-[220px]">{c.email || "No email"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-slate-600 tabular-nums whitespace-nowrap">{prettyPhone(c.phone)}</td>
                      <td className="px-3 py-3"><StagePill stage={c.stage} /></td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1 max-w-[220px]">
                          {c.tags.slice(0, 3).map((t) => <TagChip key={t.tag} tag={t.tag} />)}
                          {c.tags.length > 3 && <span className="text-[11px] text-slate-400">+{c.tags.length - 3}</span>}
                          {!c.tags.length && <span className="text-slate-300">—</span>}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-600">{fmt(c._count.conversations)}</td>
                      <td className="px-3 py-3 hidden lg:table-cell text-xs text-slate-500 whitespace-nowrap">{c.lastSeenAt ? timeAgo(c.lastSeenAt) : "—"}</td>
                      <td className="px-3 py-3 hidden xl:table-cell text-xs text-slate-500 whitespace-nowrap">{timeAgo(c.createdAt)}</td>
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => setForm(c)} aria-label={`Edit ${displayName(c)}`} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                          <Icon name="edit" className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className={cn("md:hidden divide-y divide-slate-100", isFetching && "opacity-70")}>
              {contacts.map((c) => (
                <li key={c.id} className={cn("flex items-start gap-3 px-4 py-3", selected.has(c.id) && "bg-green-50/50")}>
                  <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Select ${displayName(c)}`}
                    className="mt-3 w-4 h-4 rounded border-slate-300 text-green-600 focus:ring-green-500 shrink-0" />
                  <button onClick={() => setDrawerId(c.id)} className="flex flex-1 items-start gap-3 min-w-0 text-left">
                    <Avatar name={c.name} seed={c.id} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="flex-1 text-sm font-semibold text-slate-900 truncate">{displayName(c)}</p>
                        <StagePill stage={c.stage} />
                      </div>
                      <p className="text-xs text-slate-500 tabular-nums truncate">
                        {c.name ? prettyPhone(c.phone) : c.email || "No name"}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        {c.isBlocked && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600">Blocked</span>}
                        {c.optedOut && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Opted out</span>}
                        {c.tags.slice(0, 2).map((t) => <TagChip key={t.tag} tag={t.tag} />)}
                        {c.tags.length > 2 && <span className="text-[10px] text-slate-400">+{c.tags.length - 2}</span>}
                        <span className="ml-auto inline-flex items-center gap-0.5 text-[11px] text-slate-400"><Icon name="forum" className="w-3 h-3" /> {c._count.conversations}</span>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>

            {/* Pagination */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
              <div className="flex items-center gap-3">
                <span className="tabular-nums">{fmt(from)}–{fmt(to)} of {fmt(total)}</span>
                <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="rounded-lg border border-slate-200 bg-white py-1 pl-2 pr-7 text-xs focus:outline-none focus:ring-2 focus:ring-green-500/30" aria-label="Rows per page">
                  {[25, 50, 100].map((n) => <option key={n} value={n}>{n} / page</option>)}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <button disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page" className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                  <Icon name="chevron_left" className="w-4 h-4" />
                </button>
                <span className="px-2 tabular-nums">Page {page} of {fmt(pages)}</span>
                <button disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Next page" className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                  <Icon name="chevron_right" className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Bulk action bar */}
      {selectedIds.length > 0 && (
        <div className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-6 md:left-1/2 md:right-auto md:-translate-x-1/2 z-50 admin-fade">
          <div className="flex items-center gap-1.5 rounded-2xl bg-slate-900 text-white shadow-2xl px-3 py-2 overflow-x-auto no-scrollbar">
            <span className="shrink-0 px-1.5 text-xs font-semibold tabular-nums">{selectedIds.length} selected</span>
            <span className="shrink-0 w-px h-5 bg-white/15" />
            <BarBtn icon="sell" onClick={() => setTagAction("addTag")} disabled={busy}>Add tag</BarBtn>
            <BarBtn icon="label" onClick={() => setTagAction("removeTag")} disabled={busy}>Remove tag</BarBtn>
            <label className="shrink-0 relative inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold hover:bg-white/10 cursor-pointer">
              <Icon name="flag" className="w-4 h-4" /> Stage
              <select value="" disabled={busy} onChange={(e) => e.target.value && bulk("setStage", { stage: e.target.value as Stage })}
                className="absolute inset-0 opacity-0 cursor-pointer" aria-label="Change stage">
                <option value="">Change stage</option>
                {STAGES.map((s) => <option key={s} value={s}>{STAGE_META[s].label}</option>)}
              </select>
            </label>
            <BarBtn icon="person_remove" onClick={() => bulk("optOut")} disabled={busy}>Opt out</BarBtn>
            <BarBtn icon="person_add" onClick={() => bulk("optIn")} disabled={busy}>Opt in</BarBtn>
            <BarBtn icon="block" onClick={() => bulk("block")} disabled={busy}>Block</BarBtn>
            {stats?.canDelete && <BarBtn icon="delete" danger onClick={() => bulk("delete")} disabled={busy}>Delete</BarBtn>}
            <span className="shrink-0 w-px h-5 bg-white/15" />
            <button onClick={() => setSelected(new Set())} aria-label="Clear selection" className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10">
              {busy ? <Spinner className="w-3.5 h-3.5" /> : <Icon name="close" className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      {tagAction && (
        <BulkTagModal action={tagAction} count={selectedIds.length} suggestions={tagNames} busy={busy}
          onClose={() => setTagAction(null)} onSubmit={(t) => bulk(tagAction, { tag: t })} />
      )}
      {drawerId && (
        <ContactDrawer
          id={drawerId}
          canDelete={!!stats?.canDelete}
          onClose={() => setDrawerId(null)}
          onEdit={(c) => setForm(c)}
          onChanged={(deleted) => { if (deleted) setDrawerId(null); refresh(); }}
        />
      )}
      {form && (
        <ContactFormModal
          contact={form === "new" ? null : form}
          tagSuggestions={tagNames}
          onClose={() => setForm(null)}
          onSaved={(c) => { setForm(null); refresh(); qc.invalidateQueries({ queryKey: ["contact", c.id] }); }}
        />
      )}
      {importing && <ImportModal onClose={() => setImporting(false)} onDone={refresh} />}
    </div>
  );
}

function BarBtn({ icon, children, onClick, disabled, danger }: { icon: string; children: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={cn("shrink-0 inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap disabled:opacity-50", danger ? "text-red-300 hover:bg-red-500/20" : "hover:bg-white/10")}>
      <Icon name={icon} className="w-4 h-4" /> {children}
    </button>
  );
}

function BulkTagModal({ action, count, suggestions, busy, onClose, onSubmit }: {
  action: "addTag" | "removeTag"; count: number; suggestions: string[]; busy: boolean; onClose: () => void; onSubmit: (tag: string) => void;
}) {
  const [tags, setTags] = useState<string[]>([]);
  const add = action === "addTag";
  return (
    <Modal
      title={add ? "Add tag" : "Remove tag"}
      subtitle={`${add ? "Tag" : "Untag"} ${count} selected contact${count === 1 ? "" : "s"}`}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
          <div className="flex-1" />
          <button disabled={busy || !tags.length} onClick={() => onSubmit(tags[0])}
            className={cn("inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50", add ? "bg-[#25D366] hover:bg-[#1fb857]" : "bg-slate-900")}>
            {busy && <Spinner />} {add ? "Add tag" : "Remove tag"}
          </button>
        </>
      }
    >
      <TagInput value={tags} onChange={(v) => setTags(v.slice(-1))} suggestions={suggestions} max={1} placeholder={add ? "Type a tag and press Enter" : "Pick the tag to remove"} />
    </Modal>
  );
}
