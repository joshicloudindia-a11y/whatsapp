"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";
import { SButton, SField, SettingsCard, SettingsHeader, sInput, settingsError } from "./ui";

interface Org {
  id: string; name: string; slug: string; website: string | null; timezone: string; logo: string | null; plan: string;
  trialEndsAt: string | null; createdAt: string;
  _count: { members: number; contacts: number; conversations: number; whatsappAccounts: number; templates: number; broadcasts: number };
}

export function OrganizationSettings() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["organization"],
    queryFn: () => axios.get("/api/settings/organization").then((r) => r.data as { organization: Org; canEdit: boolean }),
  });
  const org = data?.organization;
  const [form, setForm] = useState({ name: "", website: "", timezone: "Asia/Kolkata", logo: "" });
  const [saving, setSaving] = useState(false);
  const timezones = useMemo(() => Intl.supportedValuesOf("timeZone"), []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (org) setForm({ name: org.name, website: org.website ?? "", timezone: org.timezone, logo: org.logo ?? "" });
  }, [org]);

  if (isLoading || !org) return <div className="max-w-3xl space-y-4">{[0, 1].map((i) => <div key={i} className="h-40 rounded-2xl bg-white border border-slate-200 animate-pulse" />)}</div>;

  const dirty = form.name !== org.name || form.website !== (org.website ?? "") || form.timezone !== org.timezone || form.logo !== (org.logo ?? "");
  const canEdit = data!.canEdit;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.patch("/api/settings/organization", form);
      qc.invalidateQueries({ queryKey: ["organization"] });
      toast.success("Organization updated");
    } catch (e) { toast.error(settingsError(e)); }
    finally { setSaving(false); }
  };

  const localTime = (() => {
    try { return new Date().toLocaleTimeString("en-IN", { timeZone: form.timezone, hour: "2-digit", minute: "2-digit" }); } catch { return "—"; }
  })();

  const stats = [
    { label: "Members", value: org._count.members, icon: "group" },
    { label: "Contacts", value: org._count.contacts, icon: "contacts" },
    { label: "Conversations", value: org._count.conversations, icon: "forum" },
    { label: "WhatsApp numbers", value: org._count.whatsappAccounts, icon: "smartphone" },
    { label: "Templates", value: org._count.templates, icon: "description" },
    { label: "Broadcasts", value: org._count.broadcasts, icon: "campaign" },
  ];

  return (
    <div className="max-w-3xl space-y-5">
      <SettingsHeader title="Organization" description="Your workspace profile, shared with everyone on your team." />

      <SettingsCard>
        <div className="flex items-center gap-4">
          {form.logo && /^https?:\/\//.test(form.logo) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.logo} alt="" className="w-14 h-14 rounded-2xl object-cover border border-slate-200 shrink-0" />
          ) : (
            <span className="w-14 h-14 rounded-2xl bg-slate-900 text-white flex items-center justify-center text-xl font-bold shrink-0">{org.name[0]?.toUpperCase()}</span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold text-slate-900 truncate">{org.name}</p>
            <p className="text-xs text-slate-500 font-mono truncate">{org.slug}</p>
            <p className="text-xs text-slate-400 mt-0.5">Created {new Date(org.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
          </div>
          <span className="shrink-0 rounded-full bg-green-50 px-2.5 py-1 text-[11px] font-bold text-green-700">{org.plan}</span>
        </div>
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl bg-slate-50 p-3 flex items-center gap-2.5">
              <Icon name={s.icon} className="w-4 h-4 text-slate-400" />
              <div className="min-w-0">
                <p className="text-base font-bold text-slate-900 tabular-nums leading-none">{s.value.toLocaleString("en-IN")}</p>
                <p className="text-[11px] text-slate-500 mt-1 truncate">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      </SettingsCard>

      <form onSubmit={save}>
        <SettingsCard title="Workspace details" description={canEdit ? "Only organization admins can change these." : "Only organization admins can change these details."} icon="apartment"
          footer={canEdit && <SButton type="submit" loading={saving} disabled={!dirty || form.name.trim().length < 2}>Save changes</SButton>}>
          <div className="grid gap-4 sm:grid-cols-2">
            <SField label="Business name *"><input className={sInput} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={!canEdit} maxLength={120} /></SField>
            <SField label="Workspace URL slug" hint="Permanent identifier, can't be changed."><input className={`${sInput} font-mono`} value={org.slug} disabled /></SField>
            <SField label="Website (optional)" hint="https:// is added automatically."><input type="text" inputMode="url" autoComplete="url" className={sInput} value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} disabled={!canEdit} placeholder="sunjewellers.com" /></SField>
            <SField label="Logo URL" hint="Square image, at least 128×128."><input type="url" className={sInput} value={form.logo} onChange={(e) => setForm({ ...form, logo: e.target.value })} disabled={!canEdit} placeholder="https://…/logo.png" /></SField>
            <div className="sm:col-span-2">
              <SField label="Timezone" hint={`Used for scheduled broadcasts and reports. Local time there: ${localTime}`}>
                <select className={sInput} value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} disabled={!canEdit}>
                  {timezones.map((tz) => <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>)}
                </select>
              </SField>
            </div>
          </div>
        </SettingsCard>
      </form>
    </div>
  );
}
