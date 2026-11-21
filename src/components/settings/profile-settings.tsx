"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";
import { cn, getInitials, timeAgo } from "@/lib/utils";
import { SButton, SField, SettingsCard, SettingsHeader, sInput, settingsError } from "./ui";

interface Profile {
  id: string; name: string | null; email: string; emailVerified: string | null; createdAt: string; lastLoginAt: string | null;
  hasPassword: boolean;
  twoFactorEnabled: boolean;
  memberships: { role: string; joinedAt: string | null; createdAt: string; organization: { id: string; name: string; slug: string; plan: string } }[];
}

function strength(pw: string) {
  const checks = [
    { ok: pw.length >= 10, label: "10+ characters" },
    { ok: /[A-Z]/.test(pw), label: "Upper-case letter" },
    { ok: /[a-z]/.test(pw), label: "Lower-case letter" },
    { ok: /\d/.test(pw), label: "Number" },
    { ok: /[^A-Za-z0-9]/.test(pw), label: "Symbol (recommended)" },
  ];
  const score = checks.filter((c) => c.ok).length;
  return { checks, score, label: ["Too weak", "Weak", "Fair", "Good", "Strong", "Excellent"][score], color: ["bg-red-500", "bg-red-500", "bg-amber-500", "bg-amber-400", "bg-green-500", "bg-green-600"][score] };
}

function PasswordField({ value, onChange, placeholder, autoComplete }: { value: string; onChange: (v: string) => void; placeholder?: string; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        autoComplete={autoComplete} className={cn(sInput, "pr-11")} />
      <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
        <Icon name={show ? "visibility_off" : "visibility"} className="w-4 h-4" />
      </button>
    </div>
  );
}

function TwoStepCard({ enabled, canChange, blockedReason }: { enabled: boolean; canChange: boolean; blockedReason?: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const target = !enabled;

  const cancel = () => { setOpen(false); setPassword(""); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.post("/api/profile/two-factor", { enabled: target, password });
      await qc.invalidateQueries({ queryKey: ["profile"] });
      cancel();
      toast.success(target ? "Two-step verification turned on" : "Two-step verification turned off");
    } catch (err) { toast.error(settingsError(err)); }
    finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit}>
      <SettingsCard title="Two-step verification" icon="verified_user"
        description="Add a second step to sign-in: after your password, we email you a 6-digit code."
        footer={open ? (
          <>
            <SButton type="button" variant="secondary" onClick={cancel} disabled={saving}>Cancel</SButton>
            <SButton type="submit" variant={target ? "primary" : "danger"} loading={saving} disabled={!password}>
              {target ? "Turn on" : "Turn off"}
            </SButton>
          </>
        ) : undefined}>
        <div className="flex items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <span className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", enabled ? "bg-green-50 text-green-600" : "bg-amber-50 text-amber-600")}>
              <Icon name={enabled ? "shield" : "warning"} filled={enabled} className="w-[18px] h-[18px]" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">{enabled ? "On" : "Off"}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {enabled
                  ? "Signing in needs your password and a code sent to your email. Someone who learns your password still can't get in."
                  : "Only your password protects this account. Turn this on to require an emailed code at every sign-in."}
              </p>
            </div>
          </div>
          <button type="button" role="switch" aria-checked={enabled} aria-label="Two-step verification"
            disabled={!canChange || saving}
            onClick={() => (open ? cancel() : setOpen(true))}
            className={cn("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50 disabled:cursor-not-allowed",
              (open ? target : enabled) ? "bg-[#25D366]" : "bg-slate-200")}>
            <span className={cn("inline-block h-5 w-5 rounded-full bg-white shadow transition-transform", (open ? target : enabled) ? "translate-x-[22px]" : "translate-x-0.5")} />
          </button>
        </div>

        {blockedReason && <p className="mt-3 text-xs text-slate-500 flex items-center gap-1.5"><Icon name="info" className="w-3.5 h-3.5 shrink-0" /> {blockedReason}</p>}

        {open && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-3">
            <p className="text-xs text-slate-600">
              {target
                ? "Make sure you can receive email at your login address — you'll need a code from it every time you sign in."
                : "Turning this off makes your password the only thing protecting your account."}
            </p>
            <SField label="Confirm with your current password">
              <PasswordField value={password} onChange={setPassword} autoComplete="current-password" />
            </SField>
          </div>
        )}
      </SettingsCard>
    </form>
  );
}

export function ProfileSettings() {
  const qc = useQueryClient();
  const { data: session, update } = useSession();
  const { data, isLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: () => axios.get("/api/profile").then((r) => r.data.user as Profile),
  });

  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [savingPw, setSavingPw] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (data?.name) setName(data.name);
  }, [data?.name]);

  const s = strength(pw.next);
  const nameDirty = !!data && name.trim() !== (data.name ?? "");
  const pwValid = pw.current && s.score >= 4 && pw.next === pw.confirm;

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingName(true);
    try {
      const r = await axios.patch("/api/profile", { name });
      await update({ name: r.data.user.name });
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Name updated");
    } catch (e) { toast.error(settingsError(e)); }
    finally { setSavingName(false); }
  };

  const savePw = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPw(true);
    try {
      await axios.patch("/api/profile", { currentPassword: pw.current, newPassword: pw.next });
      setPw({ current: "", next: "", confirm: "" });
      toast.success("Password changed");
    } catch (e) { toast.error(settingsError(e)); }
    finally { setSavingPw(false); }
  };

  if (isLoading || !data) return <div className="max-w-3xl space-y-4">{[0, 1, 2].map((i) => <div key={i} className="h-36 rounded-2xl bg-white border border-slate-200 animate-pulse" />)}</div>;

  const membership = data.memberships[0];

  return (
    <div className="max-w-3xl space-y-5">
      <SettingsHeader title="My profile" description="Your personal account details and security." />

      {/* Identity */}
      <section className="relative overflow-hidden rounded-2xl bg-slate-950 text-white p-5 sm:p-6">
        <div className="absolute -right-12 -top-12 w-48 h-48 rounded-full bg-green-500/25 blur-3xl" />
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-xl font-bold shrink-0">
            {getInitials(data.name ?? data.email)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold truncate">{data.name ?? "—"}</p>
            <p className="text-sm text-slate-400 truncate flex items-center gap-1.5">
              {data.email}
              {data.emailVerified && <Icon name="check_circle" filled className="w-4 h-4 text-green-400" title="Email verified" />}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {membership && <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold">{membership.role.replace(/_/g, " ")} · {membership.organization.name}</span>}
            </div>
          </div>
        </div>
        <dl className="relative mt-5 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
          <div className="rounded-xl bg-white/5 p-3"><dt className="text-slate-400">Member since</dt><dd className="mt-0.5 font-semibold">{new Date(data.createdAt).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</dd></div>
          <div className="rounded-xl bg-white/5 p-3"><dt className="text-slate-400">Email</dt><dd className="mt-0.5 font-semibold">{data.emailVerified ? "Verified" : "Not verified"}</dd></div>
          <div className="rounded-xl bg-white/5 p-3 col-span-2 sm:col-span-1"><dt className="text-slate-400">Last admin sign-in</dt><dd className="mt-0.5 font-semibold">{data.lastLoginAt ? timeAgo(data.lastLoginAt) : "—"}</dd></div>
        </dl>
      </section>

      {/* Personal info */}
      <form onSubmit={saveName}>
        <SettingsCard title="Personal information" description="Shown to your teammates in the inbox and on assignments." icon="person"
          footer={<SButton type="submit" loading={savingName} disabled={!nameDirty || name.trim().length < 2}>Save changes</SButton>}>
          <div className="grid gap-4 sm:grid-cols-2">
            <SField label="Full name"><input className={sInput} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required /></SField>
            <SField label="Email address" hint="Contact support to change your login email."><input className={sInput} value={data.email} disabled /></SField>
          </div>
        </SettingsCard>
      </form>

      {/* Password */}
      {data.hasPassword && (
        <form onSubmit={savePw}>
          <SettingsCard title="Password" description="Use a strong password you don't use anywhere else." icon="lock"
            footer={<SButton type="submit" loading={savingPw} disabled={!pwValid}>Update password</SButton>}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <SField label="Current password"><PasswordField value={pw.current} onChange={(v) => setPw({ ...pw, current: v })} autoComplete="current-password" /></SField>
              </div>
              <SField label="New password"><PasswordField value={pw.next} onChange={(v) => setPw({ ...pw, next: v })} autoComplete="new-password" /></SField>
              <SField label="Confirm new password"><PasswordField value={pw.confirm} onChange={(v) => setPw({ ...pw, confirm: v })} autoComplete="new-password" /></SField>
            </div>
            {pw.next && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="flex-1 flex gap-1">{[0, 1, 2, 3, 4].map((i) => <span key={i} className={cn("h-1.5 flex-1 rounded-full", i < s.score ? s.color : "bg-slate-100")} />)}</div>
                  <span className="text-xs font-semibold text-slate-600 w-20 text-right">{s.label}</span>
                </div>
                <ul className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {s.checks.map((c) => (
                    <li key={c.label} className={cn("flex items-center gap-1.5 text-[11px]", c.ok ? "text-green-700" : "text-slate-400")}>
                      <Icon name={c.ok ? "check_circle" : "radio_button_unchecked"} filled={c.ok} className="w-3.5 h-3.5" /> {c.label}
                    </li>
                  ))}
                  <li className={cn("flex items-center gap-1.5 text-[11px]", pw.confirm && pw.next === pw.confirm ? "text-green-700" : "text-slate-400")}>
                    <Icon name={pw.confirm && pw.next === pw.confirm ? "check_circle" : "radio_button_unchecked"} className="w-3.5 h-3.5" /> Passwords match
                  </li>
                </ul>
              </div>
            )}
          </SettingsCard>
        </form>
      )}

      {/* Two-step verification */}
      <TwoStepCard
        enabled={data.twoFactorEnabled}
        canChange={data.hasPassword && !session?.user?.impersonator}
        blockedReason={
          session?.user?.impersonator ? "Security settings can't be changed while a Super Admin is signed in as this user."
            : !data.hasPassword ? "Set a password on your account to use two-step verification." : undefined
        }
      />
    </div>
  );
}
