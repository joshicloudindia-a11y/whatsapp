"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { cn, timeAgo, getInitials } from "@/lib/utils";
import { toast } from "sonner";

type Tab = "profile" | "organization" | "whatsapp" | "team" | "api-keys" | "billing";

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("profile");
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const tabs: { id: Tab; label: string; adminOnly?: boolean }[] = [
    { id: "profile",      label: "My Profile" },
    { id: "organization", label: "Organization" },
    { id: "whatsapp",     label: "WhatsApp" },
    { id: "team",         label: "Team" },
    { id: "api-keys",     label: "API Keys" },
    { id: "billing",      label: "Plans & Billing", adminOnly: true },
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
        {tab === "organization" && <OrgSettings />}
        {tab === "whatsapp"     && <WhatsappSettings />}
        {tab === "team"         && <TeamSettings />}
        {tab === "api-keys"     && <ApiKeysSettings />}
        {tab === "billing"      && isAdmin && <BillingAdminSettings />}
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
            <span className="px-3 py-1 text-sm font-medium bg-green-100 text-green-700 rounded-full">BUSINESS</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── WhatsApp Settings ────────────────────────────────────────────────────────

function WhatsappSettings() {
  const EMPTY = { phoneNumber: "", phoneNumberId: "", displayName: "", wabaId: "", accessToken: "" };
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm]       = useState({ ...EMPTY });
  const [deleting, setDeleting] = useState<string | null>(null);

  const { data, refetch } = useQuery({
    queryKey: ["whatsapp-accounts"],
    queryFn: () => axios.get("/api/settings/whatsapp").then((r) => r.data),
  });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post("/api/settings/whatsapp", form);
      toast.success("WhatsApp number connected");
      setShowAdd(false);
      setForm({ ...EMPTY });
      refetch();
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? "Failed");
    }
  };

  const handleToggle = async (acc: any) => {
    try {
      await axios.patch(`/api/settings/whatsapp/${acc.id}`, { isActive: !acc.isActive });
      toast.success(acc.isActive ? "Number deactivated" : "Number activated");
      refetch();
    } catch {
      toast.error("Update failed");
    }
  };

  const handleDelete = async (acc: any) => {
    if (!confirm(`Disconnect "${acc.displayName}"? This will also remove all associated conversations.`)) return;
    setDeleting(acc.id);
    try {
      await axios.delete(`/api/settings/whatsapp/${acc.id}`);
      toast.success("Number disconnected");
      refetch();
    } catch {
      toast.error("Delete failed");
    } finally {
      setDeleting(null);
    }
  };

  const FIELDS = [
    { key: "phoneNumber",   label: "Phone Number",              placeholder: "e.g. 919876543210 (with country code, no +)" },
    { key: "phoneNumberId", label: "Phone Number ID ★",         placeholder: "From Meta → WhatsApp → API Setup (e.g. 123456789012345)" },
    { key: "displayName",   label: "Display Name",              placeholder: "Your Business Name" },
    { key: "wabaId",        label: "WABA ID",                   placeholder: "WhatsApp Business Account ID from Meta Business Manager" },
  ];

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">WhatsApp Numbers</h2>
          <p className="text-sm text-slate-500">Connected WhatsApp Business accounts</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="px-3 py-1.5 text-sm font-medium text-white rounded-lg" style={{ background: "#25D366" }}>
          + Connect Number
        </button>
      </div>

      {/* Where to find these IDs */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-800 space-y-1">
        <p className="font-semibold">Where to find your Meta credentials:</p>
        <p>1. Go to <strong>developers.facebook.com</strong> → Your App → WhatsApp → API Setup</p>
        <p>2. <strong>Phone Number ID</strong> — shown under "From" phone number (e.g. 123456789012345)</p>
        <p>3. <strong>WABA ID</strong> — shown as "WhatsApp Business Account ID"</p>
        <p>4. <strong>Access Token</strong> — Generate a Permanent Token via System User in Meta Business Manager</p>
        <p>5. <strong>Webhook URL</strong> — <code className="bg-blue-100 px-1 rounded">{process.env.NEXT_PUBLIC_APP_URL ?? "https://yourdomain.com"}/api/webhook/whatsapp</code></p>
        <p>6. <strong>Verify Token</strong> — <code className="bg-blue-100 px-1 rounded">whatsapp_webhook_verify_2024_secure</code></p>
      </div>

      {(!data?.accounts || data.accounts.length === 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
          No WhatsApp number connected yet. Click "+ Connect Number" and enter your Meta credentials.
        </div>
      )}

      <div className="space-y-3">
        {data?.accounts?.map((acc: any) => (
          <div key={acc.id} className="bg-white rounded-xl border p-4 space-y-3" style={{ borderColor: "#e2e8f0" }}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{acc.displayName}</p>
                <p className="text-sm text-slate-500">+{acc.phoneNumber}</p>
                <div className="mt-1.5 space-y-0.5">
                  <p className="text-xs text-slate-400 font-mono">Phone Number ID: {acc.phoneNumberId}</p>
                  <p className="text-xs text-slate-400 font-mono">WABA ID: {acc.wabaId}</p>
                </div>
              </div>
              <span className={cn("px-2 py-0.5 text-xs rounded-full font-medium shrink-0", acc.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500")}>
                {acc.isActive ? "Active" : "Inactive"}
              </span>
            </div>
            <div className="flex gap-2 pt-1 border-t" style={{ borderColor: "#f1f5f9" }}>
              <button onClick={() => handleToggle(acc)}
                className="flex-1 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-medium">
                {acc.isActive ? "Deactivate" : "Activate"}
              </button>
              <button onClick={() => handleDelete(acc)} disabled={deleting === acc.id}
                className="px-4 py-1.5 text-xs rounded-lg font-medium bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50">
                {deleting === acc.id ? "..." : "Disconnect"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-auto">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4 my-4">
            <h2 className="text-lg font-bold text-slate-900">Connect WhatsApp Number</h2>
            <form onSubmit={handleAdd} className="space-y-3">
              {FIELDS.map((f) => (
                <div key={f.key} className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">{f.label}</label>
                  <input required value={(form as any)[f.key]}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
              ))}
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Permanent Access Token ★</label>
                <textarea required value={form.accessToken}
                  onChange={(e) => setForm({ ...form, accessToken: e.target.value })}
                  placeholder="EAAxxxxxxxx... (System User Permanent Token from Meta Business Manager)"
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowAdd(false)}
                  className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600">Cancel</button>
                <button type="submit"
                  className="flex-1 py-2 text-sm text-white rounded-lg font-medium" style={{ background: "#25D366" }}>
                  Connect Number
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
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

// ─── Billing Admin — Full CRUD ────────────────────────────────────────────────

const EMPTY_PLAN = {
  name: "", slug: "", description: "",
  monthlyPrice: "", annualPrice: "", currency: "USD",
  isActive: true, isPopular: false, sortOrder: "0",
  maxUsers: "3", maxBroadcasts: "15000", maxAutomations: "1000",
  maxApiCalls: "10000", maxAiCredits: "250", maxWhatsappNumbers: "1",
  features: "",
};

function BillingAdminSettings() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm]     = useState(false);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [form, setForm]             = useState({ ...EMPTY_PLAN });
  const [deleting, setDeleting]     = useState<string | null>(null);
  const [saving, setSaving]         = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-plans"],
    queryFn: () => axios.get("/api/admin/plans").then((r) => r.data),
  });

  const plans: any[] = data?.plans ?? [];

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_PLAN });
    setShowForm(true);
  };

  const openEdit = (plan: any) => {
    setEditingId(plan.id);
    setForm({
      name: plan.name,
      slug: plan.slug,
      description: plan.description ?? "",
      monthlyPrice: String(plan.monthlyPrice),
      annualPrice: String(plan.annualPrice),
      currency: plan.currency,
      isActive: plan.isActive,
      isPopular: plan.isPopular,
      sortOrder: String(plan.sortOrder),
      maxUsers: String(plan.maxUsers),
      maxBroadcasts: String(plan.maxBroadcasts),
      maxAutomations: String(plan.maxAutomations),
      maxApiCalls: String(plan.maxApiCalls),
      maxAiCredits: String(plan.maxAiCredits),
      maxWhatsappNumbers: String(plan.maxWhatsappNumbers),
      features: Array.isArray(plan.features) ? plan.features.join("\n") : "",
    });
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      ...form,
      features: form.features.split("\n").map((s) => s.trim()).filter(Boolean),
    };
    try {
      if (editingId) {
        await axios.patch(`/api/admin/plans/${editingId}`, payload);
        toast.success("Plan updated");
      } else {
        await axios.post("/api/admin/plans", payload);
        toast.success("Plan created");
      }
      queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
      setShowForm(false);
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? "Failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete plan "${name}"? This cannot be undone.`)) return;
    setDeleting(id);
    try {
      await axios.delete(`/api/admin/plans/${id}`);
      toast.success("Plan deleted");
      queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
    } catch {
      toast.error("Delete failed");
    } finally {
      setDeleting(null);
    }
  };

  const toggleField = async (id: string, field: "isActive" | "isPopular", value: boolean) => {
    await axios.patch(`/api/admin/plans/${id}`, { [field]: !value });
    queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
  };

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Plans & Billing</h2>
          <p className="text-sm text-slate-500">Manage subscription plans shown to customers</p>
        </div>
        <button onClick={openCreate} className="px-4 py-2 text-sm font-medium text-white rounded-lg" style={{ background: "#25D366" }}>
          + Add Plan
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-slate-400 text-sm">Loading plans...</div>
      ) : plans.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed rounded-2xl border-slate-200">
          <p className="text-slate-500 font-medium">No plans yet</p>
          <p className="text-slate-400 text-sm mt-1">Create your first pricing plan</p>
          <button onClick={openCreate} className="mt-4 px-4 py-2 text-sm font-medium text-white rounded-lg" style={{ background: "#25D366" }}>
            + Create Plan
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={cn("bg-white rounded-xl border p-5 relative flex flex-col gap-3",
                plan.isPopular ? "ring-2" : ""
              )}
              style={{ borderColor: "#e2e8f0", ...(plan.isPopular ? { ringColor: "#25D366" } : {}) }}
            >
              {plan.isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 text-xs font-bold text-white rounded-full" style={{ background: "#25D366" }}>
                  Best Value
                </div>
              )}

              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-bold text-slate-900">{plan.name}</p>
                  {plan.description && <p className="text-xs text-slate-400 mt-0.5">{plan.description}</p>}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={cn("w-2 h-2 rounded-full shrink-0", plan.isActive ? "bg-green-500" : "bg-slate-300")} />
                  <span className="text-xs text-slate-400">{plan.isActive ? "Active" : "Hidden"}</span>
                </div>
              </div>

              {/* Pricing */}
              <div className="flex gap-4 text-sm">
                <div>
                  <p className="text-xs text-slate-400">Monthly</p>
                  <p className="font-bold text-xl" style={{ color: "#25D366" }}>
                    {plan.currency === "INR" ? "₹" : "$"}{plan.monthlyPrice}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Annual</p>
                  <p className="font-bold text-xl text-slate-700">
                    {plan.currency === "INR" ? "₹" : "$"}{plan.annualPrice}
                  </p>
                </div>
              </div>

              {/* Limits */}
              <div className="grid grid-cols-2 gap-1 text-xs text-slate-600">
                {[
                  { label: "Users",      val: plan.maxUsers },
                  { label: "Broadcasts", val: plan.maxBroadcasts >= 999999 ? "Unlimited" : plan.maxBroadcasts.toLocaleString() },
                  { label: "Automations",val: plan.maxAutomations.toLocaleString() },
                  { label: "API Calls",  val: plan.maxApiCalls >= 1000000 ? `${(plan.maxApiCalls/1000000).toFixed(0)}M` : plan.maxApiCalls.toLocaleString() },
                  { label: "AI Credits", val: plan.maxAiCredits },
                  { label: "WA Numbers", val: plan.maxWhatsappNumbers },
                ].map((s) => (
                  <div key={s.label} className="flex justify-between px-2 py-1 bg-slate-50 rounded">
                    <span className="text-slate-400">{s.label}</span>
                    <span className="font-medium text-slate-700">{s.val}</span>
                  </div>
                ))}
              </div>

              {/* Features list */}
              {Array.isArray(plan.features) && plan.features.length > 0 && (
                <ul className="text-xs text-slate-600 space-y-1">
                  {plan.features.slice(0, 4).map((f: string, i: number) => (
                    <li key={i} className="flex items-center gap-1">
                      <span className="text-green-500">✓</span> {f}
                    </li>
                  ))}
                  {plan.features.length > 4 && (
                    <li className="text-slate-400">+{plan.features.length - 4} more</li>
                  )}
                </ul>
              )}

              {/* Actions */}
              <div className="flex gap-2 mt-auto pt-2 border-t" style={{ borderColor: "#f1f5f9" }}>
                <button
                  onClick={() => toggleField(plan.id, "isActive", plan.isActive)}
                  className="flex-1 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 font-medium"
                >
                  {plan.isActive ? "Hide" : "Show"}
                </button>
                <button
                  onClick={() => toggleField(plan.id, "isPopular", plan.isPopular)}
                  className="flex-1 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 font-medium"
                >
                  {plan.isPopular ? "Un-feature" : "Feature"}
                </button>
                <button
                  onClick={() => openEdit(plan)}
                  className="flex-1 py-1.5 text-xs rounded-lg font-medium text-white"
                  style={{ background: "#25D366" }}
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(plan.id, plan.name)}
                  disabled={deleting === plan.id}
                  className="px-2.5 py-1.5 text-xs rounded-lg font-medium bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50"
                >
                  {deleting === plan.id ? "..." : "Del"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-auto">
          <div className="bg-white rounded-2xl w-full max-w-2xl p-6 space-y-5 my-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">{editingId ? "Edit Plan" : "Create New Plan"}</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              {/* Basic info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Plan Name *</label>
                  <input required value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") })}
                    placeholder="Growth"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Slug</label>
                  <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })}
                    placeholder="growth"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Description</label>
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Best for growing businesses"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>

              {/* Pricing */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Monthly Price *</label>
                  <input required type="number" min="0" step="0.01" value={form.monthlyPrice}
                    onChange={(e) => setForm({ ...form, monthlyPrice: e.target.value })}
                    placeholder="49"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Annual Price</label>
                  <input type="number" min="0" step="0.01" value={form.annualPrice}
                    onChange={(e) => setForm({ ...form, annualPrice: e.target.value })}
                    placeholder="470"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Currency</label>
                  <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none">
                    <option value="USD">USD ($)</option>
                    <option value="INR">INR (₹)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                  </select>
                </div>
              </div>

              {/* Limits */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Plan Limits</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { key: "maxUsers",           label: "Max Users" },
                    { key: "maxBroadcasts",      label: "Max Broadcasts/mo" },
                    { key: "maxAutomations",     label: "Max Automations" },
                    { key: "maxApiCalls",        label: "Max API Calls" },
                    { key: "maxAiCredits",       label: "AI Credits/mo" },
                    { key: "maxWhatsappNumbers", label: "WA Numbers" },
                  ].map((f) => (
                    <div key={f.key} className="space-y-1">
                      <label className="text-xs font-medium text-slate-600">{f.label}</label>
                      <input type="number" min="0" value={(form as any)[f.key]}
                        onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Features */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Features (one per line)</label>
                <textarea value={form.features}
                  onChange={(e) => setForm({ ...form, features: e.target.value })}
                  placeholder={"Unlimited broadcasts\n24x7 support\nHubSpot integration"}
                  rows={4}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>

              {/* Toggles */}
              <div className="flex gap-6">
                {[
                  { key: "isActive",  label: "Active (visible to users)" },
                  { key: "isPopular", label: "Mark as Best Value" },
                ].map((f) => (
                  <label key={f.key} className="flex items-center gap-2 cursor-pointer">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, [f.key]: !(form as any)[f.key] })}
                      className={cn("relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors",
                        (form as any)[f.key] ? "bg-green-500" : "bg-slate-200"
                      )}
                    >
                      <span className={cn("inline-block w-4 h-4 transform rounded-full bg-white shadow transition-transform mt-0.5",
                        (form as any)[f.key] ? "translate-x-4 ml-0.5" : "translate-x-0.5"
                      )} />
                    </button>
                    <span className="text-sm text-slate-700">{f.label}</span>
                  </label>
                ))}
              </div>

              {/* Sort order */}
              <div className="space-y-1 w-32">
                <label className="text-xs font-medium text-slate-600">Sort Order</label>
                <input type="number" min="0" value={form.sortOrder}
                  onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>

              <div className="flex gap-2 pt-2 border-t" style={{ borderColor: "#e2e8f0" }}>
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 text-sm font-semibold text-white rounded-lg disabled:opacity-60"
                  style={{ background: "#25D366" }}>
                  {saving ? "Saving..." : editingId ? "Update Plan" : "Create Plan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
