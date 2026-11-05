"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { EmbeddedSignupButton, type EmbeddedSignupConfig, type EmbeddedSignupResult } from "@/components/settings/embedded-signup";
import { BusinessProfilePanel } from "@/components/settings/business-profile";

interface Account {
  id: string; phoneNumber: string; phoneNumberId: string; displayName: string; wabaId: string;
  isActive: boolean; qualityRating: string | null; messagingLimit: string | null; createdAt: string;
}

const inputCls = "w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500";
const QUALITY: Record<string, string> = { GREEN: "bg-green-50 text-green-700", YELLOW: "bg-amber-50 text-amber-700", RED: "bg-red-50 text-red-600" };
interface Health {
  id: string; status: "ok" | "expiring" | "expired_or_invalid" | "unknown";
  expiresAt: string | null; neverExpires: boolean; daysLeft: number | null; qualityRating: string | null; error: string | null;
}

function HealthBadge({ h }: { h?: Health }) {
  if (!h) return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-400">Checking token…</span>;
  if (h.status === "expired_or_invalid") {
    return <span title={h.error ?? undefined} className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600"><Icon name="error" className="w-3 h-3" /> Token expired — update it</span>;
  }
  if (h.status === "unknown") {
    return <span title={h.error ?? undefined} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500"><Icon name="help" className="w-3 h-3" /> Token status unknown</span>;
  }
  const when = h.neverExpires ? "Never expires" : h.daysLeft !== null ? (h.daysLeft === 0 ? "expires today" : `expires in ${h.daysLeft} day${h.daysLeft === 1 ? "" : "s"}`) : null;
  const amber = h.status === "expiring";
  return (
    <span title={h.expiresAt ? new Date(h.expiresAt).toLocaleString() : undefined}
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold", amber ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700")}>
      <Icon name={amber ? "schedule" : "verified_user"} className="w-3 h-3" /> Token OK{when ? ` · ${when}` : ""}
    </span>
  );
}

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
  const [tokenFor, setTokenFor] = useState<string | null>(null);
  const [newToken, setNewToken] = useState("");
  const [profileFor, setProfileFor] = useState<string | null>(null);
  const [signup, setSignup] = useState<EmbeddedSignupResult | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["whatsapp-accounts"],
    queryFn: () => axios.get("/api/settings/whatsapp").then((r) => r.data as { accounts: Account[]; webhook: { callbackUrl: string; verifyToken: string | null }; embeddedSignup: EmbeddedSignupConfig | null }),
  });
  const accounts = data?.accounts ?? [];
  const { data: healthData } = useQuery({
    queryKey: ["whatsapp-health"],
    queryFn: () => axios.get("/api/settings/whatsapp/health").then((r) => r.data as { health: Health[] }),
    enabled: accounts.length > 0,
    staleTime: 5 * 60_000,
  });
  const healthById = new Map((healthData?.health ?? []).map((h) => [h.id, h]));
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["whatsapp-accounts"] });
    qc.invalidateQueries({ queryKey: ["whatsapp-health"] });
    qc.invalidateQueries({ queryKey: ["onboarding"] });
  };

  const onSignup = (res: EmbeddedSignupResult) => {
    setSignup(res);
    toast.success(`${res.account.displayName} connected`);
    refresh();
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

  const updateToken = async (e: React.FormEvent, acc: Account) => {
    e.preventDefault();
    const accessToken = newToken.trim();
    if (!accessToken) return;
    setBusyId(acc.id);
    try {
      await axios.patch(`/api/settings/whatsapp/${acc.id}`, { accessToken });
      toast.success("Token verified with Meta and saved");
      setTokenFor(null);
      setNewToken("");
      refresh();
    } catch (e) { toast.error(err(e)); }
    finally { setBusyId(null); }
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
          data?.embeddedSignup ? (
            <div className="flex flex-wrap gap-2 self-start">
              <EmbeddedSignupButton config={data.embeddedSignup} onConnected={onSignup} />
              <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                <Icon name="key" className="w-4 h-4" /> Manual setup
              </button>
            </div>
          ) : (
            <button onClick={() => setShowForm(true)} className="self-start inline-flex items-center gap-1.5 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1fb857]">
              <Icon name="add" className="w-4 h-4" /> Connect number
            </button>
          )
        )}
      </div>

      {signup && (
        <div className="rounded-2xl border border-green-200 bg-green-50/60 p-4 sm:p-5 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-bold text-slate-900"><Icon name="check_circle" filled className="w-5 h-5 text-green-600" /> {signup.account.displayName} is connected</p>
            <button onClick={() => setSignup(null)} aria-label="Dismiss" className="text-slate-400 hover:text-slate-600"><Icon name="close" className="w-4 h-4" /></button>
          </div>
          <ul className="text-xs text-slate-600 space-y-1 pl-7 list-disc">
            <li>{signup.webhookSubscribed ? "Incoming messages are linked automatically." : "Webhook subscription could not be confirmed. Use Refresh, or contact support if messages don't arrive."}</li>
            {signup.registered && signup.pin && (
              <li>Two-step verification PIN for this number: <b className="font-mono text-sm text-slate-900">{signup.pin}</b>. Save it now; it is shown only once.</li>
            )}
            {!signup.registered && <li>The number was already registered on WhatsApp Cloud API, so its existing PIN was kept. ({signup.registerError})</li>}
            <li>Add a payment method in Meta Business Suite → WhatsApp Manager to send template messages.</li>
          </ul>
        </div>
      )}

      {showForm && (
        <form onSubmit={connect} className="rounded-2xl border border-green-200 bg-green-50/40 p-4 sm:p-5 space-y-4">
          <div className="flex items-start gap-3">
            <Icon name="info" className="w-5 h-5 text-green-600 mt-0.5" />
            <p className="text-xs text-slate-600">
              Find these in <b>Meta for Developers → your app → WhatsApp → API Setup</b>. Use a permanent System User token with
              <code className="mx-1">whatsapp_business_messaging</code> and <code>whatsapp_business_management</code>. We verify the details with Meta before saving. Temporary tokens from API Setup expire after 24 hours.
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
              <li key={acc.id} className="p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
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
                      <HealthBadge h={healthById.get(acc.id)} />
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 sm:shrink-0">
                    <button onClick={() => setProfileFor(profileFor === acc.id ? null : acc.id)}
                      className={cn("inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium", profileFor === acc.id ? "border-green-200 bg-green-50 text-green-700" : "border-slate-200 text-slate-600 hover:bg-slate-50")}>
                      <Icon name="storefront" className="w-3.5 h-3.5" /> Business profile
                    </button>
                {isAdmin && (
                  <>
                    <button disabled={busyId === acc.id} onClick={() => { setTokenFor(tokenFor === acc.id ? null : acc.id); setNewToken(""); }}
                      className={cn("inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium disabled:opacity-50",
                        healthById.get(acc.id)?.status === "expired_or_invalid" || healthById.get(acc.id)?.status === "expiring"
                          ? "border-red-200 text-red-600 hover:bg-red-50" : "border-slate-200 text-slate-600 hover:bg-slate-50")}>
                      <Icon name="key" className="w-3.5 h-3.5" /> Update token
                    </button>
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
                  </>
                )}
                </div>
                </div>
                {profileFor === acc.id && <BusinessProfilePanel accountId={acc.id} isAdmin={isAdmin} />}
                {isAdmin && tokenFor === acc.id && (
                  <form onSubmit={(e) => updateToken(e, acc)} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:p-4 space-y-3">
                    <label className="space-y-1.5 block"><span className="text-xs font-semibold text-slate-600">New access token</span>
                      <input type="password" autoComplete="off" autoFocus className={`${inputCls} font-mono bg-white`} value={newToken} onChange={(e) => setNewToken(e.target.value)} required /></label>
                    <p className="flex items-start gap-1.5 text-[11px] text-slate-500">
                      <Icon name="info" className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500" />
                      <span>Temporary tokens from <b>WhatsApp → API Setup</b> expire after 24 hours. For production use a permanent <b>System User</b> token (Business Settings → System users → Generate token, expiry &ldquo;Never&rdquo;).</span>
                    </p>
                    <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
                      <button type="button" onClick={() => { setTokenFor(null); setNewToken(""); }} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
                      <button type="submit" disabled={busyId === acc.id || !newToken.trim()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1fb857] disabled:opacity-60">
                        {busyId === acc.id && <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />}
                        {busyId === acc.id ? "Verifying with Meta…" : "Verify & save"}
                      </button>
                    </div>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {data?.webhook && (!data.embeddedSignup || showForm) && (
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
