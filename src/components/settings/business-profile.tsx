"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

interface Profile { about?: string; address?: string; description?: string; email?: string; websites?: string[]; vertical?: string; profile_picture_url?: string }
interface ProfileData { profile: Profile | null; profileError: string | null; marketingStatus: string; verticals: string[] }

const inputCls = "w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500 disabled:bg-slate-50";
const err = (e: unknown) => (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Something went wrong";
const VERTICAL_LABEL = (v: string) => (v === "UNDEFINED" ? "Not set" : v === "PROF_SERVICES" ? "Professional services" : v === "EDU" ? "Education" : v === "ENTERTAIN" ? "Entertainment" : v === "EVENT_PLAN" ? "Event planning" : v === "GOVT" ? "Government" : v.charAt(0) + v.slice(1).toLowerCase());

function MarketingStatus({ status }: { status: string }) {
  const onboarded = status === "ONBOARDED";
  const eligible = status === "ELIGIBLE";
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border p-3", onboarded ? "border-green-200 bg-green-50/60" : "border-slate-200 bg-slate-50/60")}>
      <Icon name="campaign" className={cn("w-5 h-5 mt-0.5 shrink-0", onboarded ? "text-green-600" : "text-slate-400")} />
      <div className="text-xs text-slate-600">
        <p className="font-semibold text-slate-800">
          Marketing Messages API: {onboarded ? "Active" : eligible ? "Eligible, not onboarded" : "Not available"}
        </p>
        <p className="mt-0.5">
          {onboarded
            ? "Marketing broadcasts from this number are sent with Meta's optimized delivery automatically."
            : eligible
              ? "Accept the Marketing Messages terms in Meta Business Suite → WhatsApp Manager to turn on optimized delivery. Broadcasts use the regular Cloud API until then."
              : "This account isn't eligible yet. Broadcasts are sent through the regular Cloud API."}
        </p>
      </div>
    </div>
  );
}

function ProfileForm({ accountId, initial, verticals, isAdmin }: { accountId: string; initial: Profile; verticals: string[]; isAdmin: boolean }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    about: initial.about ?? "", description: initial.description ?? "", address: initial.address ?? "",
    email: initial.email ?? "", website1: initial.websites?.[0] ?? "", website2: initial.websites?.[1] ?? "",
    vertical: initial.vertical ?? "UNDEFINED",
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.patch(`/api/settings/whatsapp/${accountId}/profile`, {
        about: f.about, description: f.description, address: f.address, email: f.email,
        websites: [f.website1, f.website2].filter((w) => w.trim()), vertical: f.vertical,
      });
      toast.success("Business profile updated on WhatsApp");
      qc.invalidateQueries({ queryKey: ["wa-profile", accountId] });
    } catch (e) { toast.error(err(e)); }
    finally { setSaving(false); }
  };

  const ro = !isAdmin;
  return (
    <form onSubmit={save} className="space-y-3">
      <div className="flex items-center gap-3">
        {initial.profile_picture_url
          ? <img src={initial.profile_picture_url} alt="" className="w-12 h-12 rounded-full object-cover border border-slate-200" />
          : <span className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center"><Icon name="person" className="w-6 h-6 text-slate-400" /></span>}
        <p className="text-xs text-slate-500">This is what customers see when they open your business info in WhatsApp. Change the profile photo in WhatsApp Manager.</p>
      </div>
      <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-600">About <span className="font-normal text-slate-400">({f.about.length}/139)</span></span>
        <input className={inputCls} maxLength={139} value={f.about} onChange={set("about")} disabled={ro} placeholder="Hey there! We reply within minutes." /></label>
      <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-600">Description</span>
        <textarea className={inputCls} rows={3} maxLength={512} value={f.description} onChange={set("description")} disabled={ro} /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-600">Category</span>
          <select className={inputCls} value={f.vertical} onChange={set("vertical")} disabled={ro}>
            {verticals.map((v) => <option key={v} value={v}>{VERTICAL_LABEL(v)}</option>)}
          </select></label>
        <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-600">Email</span>
          <input type="email" className={inputCls} maxLength={128} value={f.email} onChange={set("email")} disabled={ro} /></label>
      </div>
      <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-600">Address</span>
        <input className={inputCls} maxLength={256} value={f.address} onChange={set("address")} disabled={ro} /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-600">Website</span>
          <input className={inputCls} value={f.website1} onChange={set("website1")} disabled={ro} placeholder="example.com" /></label>
        <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-600">Second website (optional)</span>
          <input className={inputCls} value={f.website2} onChange={set("website2")} disabled={ro} /></label>
      </div>
      {isAdmin && (
        <div className="flex justify-end">
          <button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1fb857] disabled:opacity-60">
            {saving && <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />}
            {saving ? "Saving to WhatsApp…" : "Save profile"}
          </button>
        </div>
      )}
    </form>
  );
}

/** Business profile (WhatsApp Business Management API) and Marketing Messages API status for one number. */
export function BusinessProfilePanel({ accountId, isAdmin }: { accountId: string; isAdmin: boolean }) {
  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["wa-profile", accountId],
    queryFn: () => axios.get(`/api/settings/whatsapp/${accountId}/profile`).then((r) => r.data as ProfileData),
    staleTime: 60_000,
  });

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:p-4 space-y-4">
      {isLoading || !data ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-10 rounded-xl bg-slate-100 animate-pulse" />)}</div>
      ) : (
        <>
          <MarketingStatus status={data.marketingStatus} />
          {data.profile
            ? <ProfileForm key={dataUpdatedAt} accountId={accountId} initial={data.profile} verticals={data.verticals} isAdmin={isAdmin} />
            : <p className="text-xs text-red-600">Could not load the business profile from Meta: {data.profileError}</p>}
        </>
      )}
    </div>
  );
}
