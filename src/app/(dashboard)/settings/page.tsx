"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { cn, timeAgo, getInitials } from "@/lib/utils";
import { toast } from "sonner";

type Tab = "profile" | "organization" | "team" | "api-keys" | "billing";

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab | null) ?? "profile";
  const [tab, setTab] = useState<Tab>(initialTab);
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  useEffect(() => {
    const t = searchParams.get("tab") as Tab | null;
    if (t) setTab(t);
  }, [searchParams]);

  const tabs: { id: Tab; label: string; adminOnly?: boolean }[] = [
    { id: "profile",      label: "My Profile" },
    { id: "organization", label: "Organization",  adminOnly: true },
    { id: "team",         label: "Team",          adminOnly: true },
    { id: "api-keys",     label: "API Keys",      adminOnly: true },
    { id: "billing",      label: "My Subscription" },
  ];

  return (
    <div className="flex h-full">
      <div className="w-52 border-r bg-white p-3 space-y-0.5 shrink-0" style={{ borderColor: "#e2e8f0" }}>
        {tabs
          .filter((t) => !t.adminOnly || isAdmin)
          .map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                tab === t.id ? "bg-green-50 text-green-700" : "text-slate-600 hover:bg-slate-50"
              )}
            >
              {t.label}
            </button>
          ))}
      </div>

      <div className="flex-1 p-6 overflow-auto">
        {tab === "profile"      && <ProfileSettings />}
        {tab === "organization" && isAdmin && <OrgSettings />}
        {tab === "team"         && isAdmin && <TeamSettings />}
        {tab === "api-keys"     && isAdmin && <ApiKeysSettings />}
        {tab === "billing"      && <MySubscription />}
      </div>
    </div>
  );
}

// ─── Profile Settings ─────────────────────────────────────────────────────────

function ProfileSettings() {
  const { data: session, update } = useSession();
  const [nameForm, setNameForm]   = useState({ name: session?.user?.name ?? "" });
  const [passForm, setPassForm]   = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [savingName, setSavingName] = useState(false);
  const [savingPass, setSavingPass] = useState(false);

  const handleNameSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameForm.name.trim()) return;
    setSavingName(true);
    try {
      await axios.patch("/api/profile", { name: nameForm.name });
      await update({ name: nameForm.name });
      toast.success("Profile updated");
    } catch {
      toast.error("Update failed");
    } finally {
      setSavingName(false);
    }
  };

  const handlePassSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passForm.newPassword !== passForm.confirm) {
      toast.error("Passwords don't match");
      return;
    }
    setSavingPass(true);
    try {
      await axios.patch("/api/profile", {
        currentPassword: passForm.currentPassword,
        newPassword: passForm.newPassword,
      });
      toast.success("Password changed");
      setPassForm({ currentPassword: "", newPassword: "", confirm: "" });
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? "Failed");
    } finally {
      setSavingPass(false);
    }
  };

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">My Profile</h2>
        <p className="text-sm text-slate-500">Update your personal information</p>
      </div>

      {/* Avatar + Info */}
      <div className="flex items-center gap-4 p-5 bg-white rounded-xl border" style={{ borderColor: "#e2e8f0" }}>
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold text-white shrink-0"
          style={{ background: "#25D366" }}
        >
          {getInitials(session?.user?.name)}
        </div>
        <div>
          <p className="font-semibold text-slate-900 text-base">{session?.user?.name}</p>
          <p className="text-sm text-slate-500">{session?.user?.email}</p>
          <span className="inline-block mt-1 px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
            {session?.user?.role}
          </span>
        </div>
      </div>

      {/* Update Name */}
      <div className="bg-white rounded-xl border p-5 space-y-4" style={{ borderColor: "#e2e8f0" }}>
        <h3 className="text-sm font-semibold text-slate-900">Update Name</h3>
        <form onSubmit={handleNameSave} className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Full Name</label>
            <input
              required
              value={nameForm.name}
              onChange={(e) => setNameForm({ name: e.target.value })}
              placeholder="Your name"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <button
            type="submit"
            disabled={savingName}
            className="px-5 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-60"
            style={{ background: "#25D366" }}
          >
            {savingName ? "Saving..." : "Save Name"}
          </button>
        </form>
      </div>

      {/* Change Password */}
      <div className="bg-white rounded-xl border p-5 space-y-4" style={{ borderColor: "#e2e8f0" }}>
        <h3 className="text-sm font-semibold text-slate-900">Change Password</h3>
        <form onSubmit={handlePassSave} className="space-y-3">
          {[
            { label: "Current Password", key: "currentPassword" as const, placeholder: "••••••••" },
            { label: "New Password",     key: "newPassword"     as const, placeholder: "Min. 8 characters" },
            { label: "Confirm New Password", key: "confirm"     as const, placeholder: "••••••••" },
          ].map((f) => (
            <div key={f.key} className="space-y-1">
              <label className="text-xs font-medium text-slate-600">{f.label}</label>
              <input
                type="password"
                required
                value={passForm[f.key]}
                onChange={(e) => setPassForm({ ...passForm, [f.key]: e.target.value })}
                placeholder={f.placeholder}
                minLength={f.key !== "currentPassword" ? 8 : undefined}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          ))}
          <button
            type="submit"
            disabled={savingPass}
            className="px-5 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-60"
            style={{ background: "#25D366" }}
          >
            {savingPass ? "Changing..." : "Change Password"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Organization Settings ────────────────────────────────────────────────────

function OrgSettings() {
  const { data: session } = useSession();
  const { data: subData } = useQuery({
    queryKey: ["subscription"],
    queryFn: () => axios.get("/api/settings/subscription").then((r) => r.data),
  });

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Organization</h2>
        <p className="text-sm text-slate-500">Your workspace details</p>
      </div>
      <div className="bg-white rounded-xl border p-5 space-y-4" style={{ borderColor: "#e2e8f0" }}>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Organization Slug</label>
          <input
            readOnly
            value={session?.user?.organizationSlug ?? ""}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-500"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Current Plan</label>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 text-sm font-medium bg-green-100 text-green-700 rounded-full">
              {subData?.plan ?? "—"}
            </span>
            {subData?.status && (
              <span className="text-xs text-slate-400">{subData.status}</span>
            )}
          </div>
        </div>
        {subData?.trialEndsAt && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Trial Ends</label>
            <p className="text-sm text-slate-700">{new Date(subData.trialEndsAt).toLocaleDateString()}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Team Settings ────────────────────────────────────────────────────────────

function TeamSettings() {
  const [email, setEmail] = useState("");
  const [role, setRole]   = useState("AGENT");

  const { data, refetch } = useQuery({
    queryKey: ["team-members"],
    queryFn: () => axios.get("/api/settings/team").then((r) => r.data),
  });

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post("/api/settings/team/invite", { email, role });
      toast.success(`Invitation sent to ${email}`);
      setEmail("");
      refetch();
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? "Failed");
    }
  };

  return (
    <div className="max-w-2xl space-y-5">
      <h2 className="text-lg font-bold text-slate-900">Team Members</h2>
      <div className="bg-white rounded-xl border p-5" style={{ borderColor: "#e2e8f0" }}>
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Invite Member</h3>
        <form onSubmit={handleInvite} className="flex gap-2">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="colleague@company.com"
            className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          <select value={role} onChange={(e) => setRole(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none">
            <option value="AGENT">Agent</option>
            <option value="ADMIN">Admin</option>
            <option value="CAMPAIGN_MANAGER">Campaign Mgr</option>
            <option value="TEMPLATE_MANAGER">Template Mgr</option>
          </select>
          <button type="submit" className="px-4 py-2 text-sm font-medium text-white rounded-lg" style={{ background: "#25D366" }}>Invite</button>
        </form>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: "#e2e8f0" }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-slate-500 uppercase" style={{ borderColor: "#e2e8f0", background: "#f8fafc" }}>
              <th className="px-4 py-3">Member</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: "#f1f5f9" }}>
            {data?.members?.map((m: any) => (
              <tr key={m.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: "#25D366" }}>
                      {getInitials(m.user.name)}
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">{m.user.name ?? "—"}</p>
                      <p className="text-xs text-slate-400">{m.user.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 text-xs bg-slate-100 text-slate-700 rounded-full">{m.role}</span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">{m.joinedAt ? timeAgo(m.joinedAt) : "Invited"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── API Keys ─────────────────────────────────────────────────────────────────

function ApiKeysSettings() {
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const { data, refetch } = useQuery({
    queryKey: ["api-keys"],
    queryFn: () => axios.get("/api/settings/api-keys").then((r) => r.data),
  });

  const createKey = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await axios.post("/api/settings/api-keys", { name: newKeyName });
      setCreatedKey(res.data.plainKey);
      setNewKeyName("");
      refetch();
    } catch {
      toast.error("Failed to create key");
    }
  };

  return (
    <div className="max-w-lg space-y-5">
      <h2 className="text-lg font-bold text-slate-900">API Keys</h2>

      {createdKey && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
          <p className="text-sm font-medium text-amber-800">Copy your API key — it won't be shown again</p>
          <code className="block text-xs bg-amber-100 p-3 rounded-lg text-amber-900 break-all">{createdKey}</code>
          <button onClick={() => { navigator.clipboard.writeText(createdKey); toast.success("Copied!"); }}
            className="text-xs text-amber-700 underline">Copy to clipboard</button>
        </div>
      )}

      <form onSubmit={createKey} className="flex gap-2">
        <input required value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)}
          placeholder="Key name (e.g. Production)"
          className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
        <button type="submit" className="px-4 py-2 text-sm font-medium text-white rounded-lg" style={{ background: "#25D366" }}>Create Key</button>
      </form>

      <div className="space-y-2">
        {data?.keys?.map((k: any) => (
          <div key={k.id} className="bg-white rounded-xl border p-4 flex items-center justify-between" style={{ borderColor: "#e2e8f0" }}>
            <div>
              <p className="font-medium text-sm text-slate-900">{k.name}</p>
              <p className="text-xs text-slate-400 font-mono">{k.keyPrefix}••••••••••••</p>
            </div>
            <div className="text-right text-xs text-slate-400">
              <p>Created {timeAgo(k.createdAt)}</p>
              {k.lastUsedAt && <p>Last used {timeAgo(k.lastUsedAt)}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── My Subscription ─────────────────────────────────────────────────────────

function MySubscription() {
  const { data: subData } = useQuery({
    queryKey: ["subscription"],
    queryFn: () => axios.get("/api/settings/subscription").then((r) => r.data),
  });
  const { data } = useQuery({
    queryKey: ["public-plans"],
    queryFn: () => axios.get("/api/plans").then((r) => r.data),
  });

  const currentPlan: string = subData?.plan ?? "TRIAL";
  const plans: any[] = data?.plans ?? [];

  const PLAN_COLORS: Record<string, string> = {
    TRIAL: "#64748b", GROWTH: "#3b82f6", PRO: "#8b5cf6", BUSINESS: "#25D366",
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">My Subscription</h2>
        <p className="text-sm text-slate-500">Your current plan and available upgrades</p>
      </div>

      {/* Current plan card */}
      <div className="bg-white rounded-xl border p-5 flex items-center gap-4" style={{ borderColor: "#e2e8f0" }}>
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg shrink-0"
          style={{ background: PLAN_COLORS[currentPlan] ?? "#25D366" }}
        >
          {currentPlan[0]}
        </div>
        <div className="flex-1">
          <p className="font-bold text-slate-900 text-base">{currentPlan} Plan</p>
          <p className="text-sm text-slate-500">Your workspace is currently on the {currentPlan.toLowerCase()} plan</p>
        </div>
        <span className="px-3 py-1 text-xs font-semibold rounded-full text-white" style={{ background: PLAN_COLORS[currentPlan] ?? "#25D366" }}>
          Active
        </span>
      </div>

      {/* Available plans */}
      {plans.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-slate-700 mb-3">Available Plans</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {plans.map((plan) => {
              const isCurrent = plan.slug?.toUpperCase() === currentPlan || plan.name?.toUpperCase() === currentPlan;
              return (
                <div
                  key={plan.id}
                  className={cn(
                    "bg-white rounded-xl border p-4 space-y-3",
                    isCurrent ? "ring-2 ring-green-500" : ""
                  )}
                  style={{ borderColor: "#e2e8f0" }}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-bold text-slate-900">{plan.name}</p>
                      {plan.description && <p className="text-xs text-slate-400 mt-0.5">{plan.description}</p>}
                    </div>
                    {isCurrent && (
                      <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-700">Current</span>
                    )}
                  </div>
                  <div className="flex gap-4 text-sm">
                    <div>
                      <p className="text-xs text-slate-400">Monthly</p>
                      <p className="font-bold text-lg" style={{ color: "#25D366" }}>
                        {plan.currency === "INR" ? "₹" : "$"}{plan.monthlyPrice}
                      </p>
                    </div>
                    {plan.annualPrice > 0 && (
                      <div>
                        <p className="text-xs text-slate-400">Annual</p>
                        <p className="font-bold text-lg text-slate-700">
                          {plan.currency === "INR" ? "₹" : "$"}{plan.annualPrice}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    {[
                      { label: "Users", val: plan.maxUsers },
                      { label: "Broadcasts", val: plan.maxBroadcasts >= 999999 ? "Unlimited" : plan.maxBroadcasts?.toLocaleString() },
                      { label: "Automations", val: plan.maxAutomations?.toLocaleString() },
                      { label: "WA Numbers", val: plan.maxWhatsappNumbers },
                    ].map((s) => (
                      <div key={s.label} className="flex justify-between px-2 py-1 bg-slate-50 rounded">
                        <span className="text-slate-400">{s.label}</span>
                        <span className="font-medium text-slate-700">{s.val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Upgrade CTA */}
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800">
        <p className="font-semibold">Want to upgrade or change your plan?</p>
        <p className="mt-1 text-green-700">Contact your account manager or reach out to support to upgrade your subscription.</p>
      </div>
    </div>
  );
}
