"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";
import { cn, timeAgo } from "@/lib/utils";

interface ApiKey { id: string; name: string; keyPrefix: string; lastUsedAt: string | null; expiresAt: string | null; isActive: boolean; createdAt: string }

const inputCls = "w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500";
const err = (e: unknown) => (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Something went wrong";
const EXPIRY = [
  { value: "90", label: "90 days (recommended)" },
  { value: "30", label: "30 days" },
  { value: "180", label: "180 days" },
  { value: "365", label: "1 year" },
  { value: "never", label: "Never expires" },
];

function keyStatus(k: ApiKey) {
  if (!k.expiresAt) return { label: "Never expires", cls: "bg-slate-100 text-slate-600", expired: false };
  const days = Math.ceil((new Date(k.expiresAt).getTime() - Date.now()) / 86400000);
  if (days <= 0) return { label: "Expired", cls: "bg-red-50 text-red-600", expired: true };
  if (days <= 14) return { label: `Expires in ${days}d`, cls: "bg-amber-50 text-amber-700", expired: false };
  return { label: `Expires ${new Date(k.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`, cls: "bg-green-50 text-green-700", expired: false };
}

export function ApiKeysSettings() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState("90");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ name: string; plainKey: string } | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<ApiKey | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["api-keys"],
    queryFn: () => axios.get("/api/settings/api-keys").then((r) => r.data as { keys: ApiKey[]; limit: number }),
  });
  const keys = data?.keys ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ["api-keys"] });

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const r = await axios.post("/api/settings/api-keys", { name, expiresInDays: expiry === "never" ? null : Number(expiry) });
      setCreated({ name: r.data.key.name, plainKey: r.data.plainKey });
      setRevealed(true);
      setName("");
      setShowForm(false);
      refresh();
    } catch (e) { toast.error(err(e)); }
    finally { setCreating(false); }
  };

  const rename = async () => {
    if (!renaming) return;
    setBusy(true);
    try {
      await axios.patch(`/api/settings/api-keys/${renaming.id}`, { name: renaming.name });
      toast.success("Key renamed");
      setRenaming(null);
      refresh();
    } catch (e) { toast.error(err(e)); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await axios.delete(`/api/settings/api-keys/${deleting.id}`);
      toast.success(`"${deleting.name}" deleted. It can no longer be used.`);
      setDeleting(null);
      refresh();
    } catch (e) { toast.error(err(e)); }
    finally { setBusy(false); }
  };

  const copy = (text: string) => { navigator.clipboard.writeText(text); toast.success("Copied to clipboard"); };

  return (
    <div className="max-w-3xl space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">API keys</h2>
          <p className="text-sm text-slate-500">
            Secret keys for connecting your own systems to ChatFlow.{data && <> {keys.length}/{data.limit} in use.</>}
          </p>
        </div>
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="self-start inline-flex items-center gap-1.5 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-green-500/25 hover:bg-[#1fb857]">
            <Icon name="add" className="w-4 h-4" /> Create key
          </button>
        )}
      </div>

      {/* One-time reveal */}
      {created && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5 space-y-3" role="alert">
          <div className="flex items-start gap-3">
            <Icon name="warning" className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-amber-900">Copy &ldquo;{created.name}&rdquo; now</p>
              <p className="text-xs text-amber-800 mt-0.5">For your security this key is shown only once. Store it in a password manager or secret store.</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <code className="flex-1 min-w-0 rounded-xl border border-amber-200 bg-white px-3.5 py-2.5 font-mono text-xs text-slate-800 break-all">
              {revealed ? created.plainKey : created.plainKey.slice(0, 14) + "•".repeat(24)}
            </code>
            <div className="flex gap-2">
              <button onClick={() => setRevealed((r) => !r)} aria-label={revealed ? "Hide key" : "Show key"}
                className="w-11 shrink-0 inline-flex items-center justify-center rounded-xl border border-amber-200 bg-white text-amber-700 hover:bg-amber-100">
                <Icon name={revealed ? "visibility_off" : "visibility"} className="w-4 h-4" />
              </button>
              <button onClick={() => copy(created.plainKey)}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700">
                <Icon name="content_copy" className="w-4 h-4" /> Copy
              </button>
            </div>
          </div>
          <button onClick={() => setCreated(null)} className="text-xs font-semibold text-amber-800 hover:underline">I&apos;ve saved it, hide this</button>
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <form onSubmit={create} className="rounded-2xl border border-green-200 bg-green-50/40 p-4 sm:p-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-600">Key name</span>
              <input autoFocus required minLength={2} maxLength={60} className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Shopify integration" />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-600">Expires</span>
              <select className={inputCls} value={expiry} onChange={(e) => setExpiry(e.target.value)}>
                {EXPIRY.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={creating} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1fb857] disabled:opacity-60">
              {creating && <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />}
              Generate key
            </button>
          </div>
        </form>
      )}

      {/* Keys */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        {isLoading ? (
          <div className="p-5 space-y-3">{[0, 1].map((i) => <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />)}</div>
        ) : keys.length === 0 ? (
          <div className="py-12 px-6 text-center">
            <span className="mx-auto w-12 h-12 rounded-2xl bg-green-50 flex items-center justify-center"><Icon name="key" className="w-6 h-6 text-green-600" /></span>
            <p className="mt-3 text-sm font-semibold text-slate-800">No API keys yet</p>
            <p className="text-xs text-slate-500 mt-1">Create a key to connect ChatFlow with your CRM, store or backend.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {keys.map((k) => {
              const st = keyStatus(k);
              const isRenaming = renaming?.id === k.id;
              return (
                <li key={k.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <span className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", st.expired ? "bg-red-50 text-red-500" : "bg-slate-100 text-slate-500")}>
                      <Icon name="key" className="w-5 h-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      {isRenaming ? (
                        <div className="flex gap-2">
                          <input autoFocus className={cn(inputCls, "py-1.5")} value={renaming.name} maxLength={60}
                            onChange={(e) => setRenaming({ id: k.id, name: e.target.value })}
                            onKeyDown={(e) => { if (e.key === "Enter") rename(); if (e.key === "Escape") setRenaming(null); }} />
                          <button onClick={rename} disabled={busy} className="shrink-0 rounded-lg bg-[#25D366] px-3 text-xs font-semibold text-white disabled:opacity-60">Save</button>
                        </div>
                      ) : (
                        <p className="text-sm font-semibold text-slate-900 truncate">{k.name}</p>
                      )}
                      <p className="mt-0.5 font-mono text-xs text-slate-500">{k.keyPrefix}<span className="tracking-tighter">••••••••••••</span></p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                        <span className={cn("rounded-full px-2 py-0.5 font-semibold", st.cls)}>{st.label}</span>
                        <span>Created {timeAgo(k.createdAt)}</span>
                        <span>{k.lastUsedAt ? `Last used ${timeAgo(k.lastUsedAt)}` : "Never used"}</span>
                      </div>
                    </div>
                  </div>
                  {!isRenaming && (
                    <div className="flex gap-2 sm:shrink-0 pl-[52px] sm:pl-0">
                      <button onClick={() => setRenaming({ id: k.id, name: k.name })}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                        <Icon name="edit" className="w-3.5 h-3.5" /> Rename
                      </button>
                      <button onClick={() => setDeleting(k)}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-100 px-2.5 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50">
                        <Icon name="delete" className="w-3.5 h-3.5" /> Delete
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="flex items-start gap-2 text-xs text-slate-500">
        <Icon name="shield" className="w-4 h-4 shrink-0 text-slate-400" />
        Keys give full access to your organization&apos;s data. Never share them in emails or commit them to code. Delete any key you no longer use.
      </p>

      {/* Delete confirmation */}
      {deleting && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label="Delete API key">
          <div className="absolute inset-0 bg-slate-950/50 admin-fade" onClick={() => setDeleting(null)} />
          <div className="relative w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl admin-pop space-y-4">
            <div className="flex items-start gap-3">
              <span className="w-10 h-10 rounded-xl bg-red-50 text-red-500 flex items-center justify-center shrink-0"><Icon name="delete" className="w-5 h-5" /></span>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete &ldquo;{deleting.name}&rdquo;?</h3>
                <p className="mt-1 text-sm text-slate-600">Any app or integration using <span className="font-mono text-xs">{deleting.keyPrefix}…</span> will stop working immediately. This can&apos;t be undone.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDeleting(null)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={remove} disabled={busy} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-red-500 py-2.5 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-60">
                {busy && <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />}
                Delete key
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
