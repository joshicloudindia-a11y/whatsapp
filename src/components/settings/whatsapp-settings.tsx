"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

interface Account {
  id: string; phoneNumber: string; phoneNumberId: string; displayName: string; wabaId: string;
  isActive: boolean; qualityRating: string | null; messagingLimit: string | null; createdAt: string;
}

const inputCls = "w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500";
const QUALITY: Record<string, string> = { GREEN: "bg-green-50 text-green-700", YELLOW: "bg-amber-50 text-amber-700", RED: "bg-red-50 text-red-600" };
const err = (e: unknown) => (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Something went wrong";

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-slate-600">{label}</p>
      <div className="flex gap-2">
        <code className="flex-1 min-w-0 truncate rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-xs text-slate-700">{value}</code>
        <button
          type="button"
          onClick={() => { navigator.clipboard.writeText(value); toast.success(`${label} copied`); }}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          <Icon name="content_copy" className="w-3.5 h-3.5" /> Copy
        </button>
      </div>
    </div>
  );
}

export function WhatsAppSettings({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ phoneNumberId: "", wabaId: "", accessToken: "", displayName: "" });
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["whatsapp-accounts"],
    queryFn: () => axios.get("/api/settings/whatsapp").then((r) => r.data as { accounts: Account[]; webhook: { callbackUrl: string; verifyToken: string | null } }),
  });
  const accounts = data?.accounts ?? [];
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["whatsapp-accounts"] });
    qc.invalidateQueries({ queryKey: ["onboarding"] });
  };

  const connect = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await axios.post("/api/settings/whatsapp", form);
      toast.success(r.data.webhookSubscribed ? "Number connected and webhooks subscribed" : "Number connected. Webhook subscription needs checking in Meta.");
      setForm({ phoneNumberId: "", wabaId: "", accessToken: "", displayName: "" });
      setShowForm(false);
      refresh();
    } catch (e) { toast.error(err(e)); }
    finally { setSaving(false); }
  };

  const act = async (acc: Account, body: Record<string, unknown> | null, msg: string) => {
    setBusyId(acc.id);
    try {
      if (body) await axios.patch(`/api/settings/whatsapp/${acc.id}`, body);
      else await axios.delete(`/api/settings/whatsapp/${acc.id}`);
      toast.success(msg);
      refresh();
    } catch (e) { toast.error(err(e)); }
    finally { setBusyId(null); }
  };

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">WhatsApp numbers</h2>
          <p className="text-sm text-slate-500">Connect your Meta WhatsApp Business numbers to send and receive messages.</p>
        </div>
        {isAdmin && !showForm && (
          <button onClick={() => setShowForm(true)} className="self-start inline-flex items-center gap-1.5 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1fb857]">
            <Icon name="add" className="w-4 h-4" /> Connect number
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={connect} className="rounded-2xl border border-green-200 bg-green-50/40 p-4 sm:p-5 space-y-4">
          <div className="flex items-start gap-3">
            <Icon name="info" className="w-5 h-5 text-green-600 mt-0.5" />
            <p className="text-xs text-slate-600">
              Find these in <b>Meta for Developers → your app → WhatsApp → API Setup</b>. Use a permanent System User token with
              <code className="mx-1">whatsapp_business_messaging</code> and <code>whatsapp_business_management</code>. We verify the details with Meta before saving.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 block"><span className="text-xs font-semibold text-slate-600">Phone Number ID</span>
              <input className={`${inputCls} font-mono`} inputMode="numeric" value={form.phoneNumberId} onChange={(e) => setForm({ ...form, phoneNumberId: e.target.value })} required /></label>
            <label className="space-y-1.5 block"><span className="text-xs font-semibold text-slate-600">WhatsApp Business Account ID</span>
              <input className={`${inputCls} font-mono`} inputMode="numeric" value={form.wabaId} onChange={(e) => setForm({ ...form, wabaId: e.target.value })} required /></label>
          </div>
          <label className="space-y-1.5 block"><span className="text-xs font-semibold text-slate-600">Permanent access token</span>
            <input type="password" autoComplete="off" className={`${inputCls} font-mono`} value={form.accessToken} onChange={(e) => setForm({ ...form, accessToken: e.target.value })} required /></label>
          <label className="space-y-1.5 block"><span className="text-xs font-semibold text-slate-600">Display name (optional)</span>
            <input className={inputCls} placeholder="Taken from Meta if empty" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></label>
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1fb857] disabled:opacity-60">
              {saving && <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />}
              {saving ? "Verifying with Meta…" : "Verify & connect"}
            </button>
          </div>
        </form>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        {isLoading ? (
          <div className="p-5 space-y-3">{[0, 1].map((i) => <div key={i} className="h-14 rounded-xl bg-slate-100 animate-pulse" />)}</div>
        ) : accounts.length === 0 ? (
          <div className="py-12 px-6 text-center">
            <span className="mx-auto w-12 h-12 rounded-2xl bg-green-50 flex items-center justify-center"><Icon name="smartphone" className="w-6 h-6 text-green-600" /></span>
            <p className="mt-3 text-sm font-semibold text-slate-800">No WhatsApp number connected</p>
            <p className="text-xs text-slate-500 mt-1">{isAdmin ? "Connect your first number to start messaging customers." : "Ask an organization admin to connect a number."}</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {accounts.map((acc) => (
              <li key={acc.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", acc.isActive ? "bg-green-50 text-green-600" : "bg-slate-100 text-slate-400")}>
                    <Icon name="smartphone" className="w-5 h-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{acc.displayName}</p>
                    <p className="text-xs text-slate-500">{acc.phoneNumber ? `+${acc.phoneNumber}` : acc.phoneNumberId}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", acc.isActive ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500")}>{acc.isActive ? "Active" : "Disabled"}</span>
                      {acc.qualityRating && <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", QUALITY[acc.qualityRating] ?? "bg-slate-100 text-slate-600")}>Quality: {acc.qualityRating}</span>}
                      {acc.messagingLimit && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">{acc.messagingLimit.replace("TIER_", "Tier ")}</span>}
                    </div>
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex gap-2 sm:shrink-0">
                    <button disabled={busyId === acc.id} onClick={() => act(acc, { refresh: true }, "Status refreshed from Meta")} title="Refresh from Meta"
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                      <Icon name="refresh" className="w-3.5 h-3.5" /> Refresh
                    </button>
                    <button disabled={busyId === acc.id} onClick={() => act(acc, { isActive: !acc.isActive }, acc.isActive ? "Number disabled" : "Number enabled")}
                      className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                      {acc.isActive ? "Disable" : "Enable"}
                    </button>
                    <button disabled={busyId === acc.id} onClick={() => { if (confirm(`Remove ${acc.displayName}? Incoming messages to this number will stop.`)) act(acc, null, "Number removed"); }}
                      className="rounded-lg border border-red-100 px-2.5 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 disabled:opacity-50">
                      Remove
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {data?.webhook && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Webhook configuration</h3>
            <p className="text-xs text-slate-500 mt-0.5">In Meta → WhatsApp → Configuration, paste these values, click <b>Verify and save</b>, then subscribe to <b>messages</b>.</p>
          </div>
          <CopyField label="Callback URL" value={data.webhook.callbackUrl} />
          {data.webhook.verifyToken && <CopyField label="Verify token" value={data.webhook.verifyToken} />}
        </div>
      )}
    </div>
  );
}
