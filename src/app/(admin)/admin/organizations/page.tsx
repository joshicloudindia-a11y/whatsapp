"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";

const PLANS = ["TRIAL", "GROWTH", "PRO", "BUSINESS"] as const;
const PLAN_COLORS: Record<string, string> = {
  TRIAL: "#94a3b8", GROWTH: "#22c55e", PRO: "#6366f1", BUSINESS: "#f59e0b",
};

const WA_EMPTY = { phoneNumber: "", phoneNumberId: "", displayName: "", wabaId: "", accessToken: "" };

export default function AdminOrganizationsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editOrg, setEditOrg] = useState<any | null>(null);
  const [planValue, setPlanValue] = useState("");
  const [saving, setSaving] = useState(false);

  // WhatsApp management state
  const [waOrg, setWaOrg] = useState<any | null>(null);
  const [waForm, setWaForm] = useState({ ...WA_EMPTY });
  const [showWaForm, setShowWaForm] = useState(false);
  const [waDeleting, setWaDeleting] = useState<string | null>(null);
  const [waSaving, setWaSaving] = useState(false);

  const { data: waOrgData, refetch: refetchWa } = useQuery({
    queryKey: ["admin-org-detail", waOrg?.id],
    queryFn: () => waOrg ? axios.get(`/api/admin/organizations/${waOrg.id}`).then((r) => r.data) : null,
    enabled: !!waOrg,
  });
  const waAccounts: any[] = waOrgData?.organization?.whatsappAccounts ?? [];

  const handleWaAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setWaSaving(true);
    try {
      await axios.post(`/api/admin/organizations/${waOrg.id}/whatsapp`, waForm);
      toast.success("WhatsApp number connected");
      setWaForm({ ...WA_EMPTY });
      setShowWaForm(false);
      refetchWa();
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? "Failed");
    } finally {
      setWaSaving(false);
    }
  };

  const handleWaToggle = async (acc: any) => {
    try {
      await axios.patch(`/api/admin/organizations/${waOrg.id}/whatsapp?accountId=${acc.id}`, { isActive: !acc.isActive });
      toast.success(acc.isActive ? "Deactivated" : "Activated");
      refetchWa();
    } catch { toast.error("Update failed"); }
  };

  const handleWaDelete = async (acc: any) => {
    if (!confirm(`Disconnect "${acc.displayName}"?`)) return;
    setWaDeleting(acc.id);
    try {
      await axios.delete(`/api/admin/organizations/${waOrg.id}/whatsapp?accountId=${acc.id}`);
      toast.success("Disconnected");
      refetchWa();
    } catch { toast.error("Failed"); }
    finally { setWaDeleting(null); }
  };

  const { data, isLoading } = useQuery({
    queryKey: ["admin-orgs", search],
    queryFn: () => axios.get(`/api/admin/organizations?search=${search}&limit=50`).then((r) => r.data),
  });

  const orgs = data?.organizations ?? [];

  const openEdit = (org: any) => {
    setEditOrg(org);
    setPlanValue(org.plan);
  };

  const savePlan = async () => {
    if (!editOrg) return;
    setSaving(true);
    try {
      await axios.patch(`/api/admin/organizations/${editOrg.id}`, { plan: planValue });
      toast.success(`${editOrg.name} plan updated to ${planValue}`);
      qc.invalidateQueries({ queryKey: ["admin-orgs"] });
      setEditOrg(null);
    } catch {
      toast.error("Failed to update plan");
    } finally {
      setSaving(false);
    }
  };

  const deleteOrg = async (org: any) => {
    if (!confirm(`Delete "${org.name}"? This cannot be undone.`)) return;
    try {
      await axios.delete(`/api/admin/organizations/${org.id}`);
      toast.success("Organization deleted");
      qc.invalidateQueries({ queryKey: ["admin-orgs"] });
    } catch {
      toast.error("Failed to delete");
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Organizations</h1>
          <p className="text-slate-500 text-sm mt-1">Manage all customer organizations</p>
        </div>
        <div className="text-sm text-slate-500">{data?.total ?? 0} total</div>
      </div>

      <input
        type="text"
        placeholder="Search organizations..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-sm px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
      />

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Organization</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Plan</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Members</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Conversations</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Broadcasts</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Created</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading ? (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-slate-400 text-sm">Loading...</td></tr>
            ) : orgs.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-slate-400 text-sm">No organizations found</td></tr>
            ) : orgs.map((org: any) => (
              <tr key={org.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-5 py-3.5">
                  <p className="text-sm font-semibold text-slate-900">{org.name}</p>
                  <p className="text-xs text-slate-400">{org.slug}</p>
                </td>
                <td className="px-5 py-3.5">
                  <span
                    className="text-xs font-semibold px-2.5 py-1 rounded-full"
                    style={{ background: PLAN_COLORS[org.plan] + "20", color: PLAN_COLORS[org.plan] }}
                  >
                    {org.plan}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-sm text-slate-700">{org._count?.members ?? 0}</td>
                <td className="px-5 py-3.5 text-sm text-slate-700">{org._count?.conversations ?? 0}</td>
                <td className="px-5 py-3.5 text-sm text-slate-700">{org._count?.broadcasts ?? 0}</td>
                <td className="px-5 py-3.5 text-xs text-slate-400">{new Date(org.createdAt).toLocaleDateString()}</td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openEdit(org)}
                      className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 font-medium"
                    >
                      Change Plan
                    </button>
                    <button
                      onClick={() => { setWaOrg(org); setShowWaForm(false); setWaForm({ ...WA_EMPTY }); }}
                      className="text-xs px-3 py-1.5 rounded-lg border border-green-200 text-green-700 hover:bg-green-50 font-medium"
                    >
                      WhatsApp
                    </button>
                    <button
                      onClick={() => deleteOrg(org)}
                      className="text-xs px-3 py-1.5 rounded-lg border border-red-100 text-red-500 hover:bg-red-50 font-medium"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* WhatsApp Management Modal */}
      {waOrg && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-5 my-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">WhatsApp Numbers</h3>
                <p className="text-sm text-slate-500">{waOrg.name}</p>
              </div>
              <button onClick={() => setWaOrg(null)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
            </div>

            {/* Existing accounts */}
            <div className="space-y-2">
              {waAccounts.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">No WhatsApp numbers connected</p>
              ) : waAccounts.map((acc: any) => (
                <div key={acc.id} className="flex items-center justify-between gap-3 bg-slate-50 rounded-xl px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{acc.displayName || acc.phoneNumber}</p>
                    <p className="text-xs text-slate-400 font-mono">+{acc.phoneNumber}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${acc.isActive ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-500"}`}>
                      {acc.isActive ? "Active" : "Inactive"}
                    </span>
                    <button onClick={() => handleWaToggle(acc)}
                      className="text-xs px-2 py-1 border border-slate-200 rounded-lg text-slate-600 hover:bg-white font-medium">
                      {acc.isActive ? "Deactivate" : "Activate"}
                    </button>
                    <button onClick={() => handleWaDelete(acc)} disabled={waDeleting === acc.id}
                      className="text-xs px-2 py-1 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 font-medium disabled:opacity-50">
                      {waDeleting === acc.id ? "..." : "Remove"}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {!showWaForm ? (
              <button onClick={() => setShowWaForm(true)}
                className="w-full py-2.5 text-sm font-medium text-white rounded-xl"
                style={{ background: "#25D366" }}>
                + Connect New Number
              </button>
            ) : (
              <form onSubmit={handleWaAdd} className="space-y-3 border-t pt-4" style={{ borderColor: "#e2e8f0" }}>
                <p className="text-sm font-semibold text-slate-900">Connect WhatsApp Number</p>
                {[
                  { key: "phoneNumber",   label: "Phone Number",   placeholder: "919876543210 (no +)" },
                  { key: "phoneNumberId", label: "Phone Number ID ★", placeholder: "From Meta API Setup" },
                  { key: "displayName",   label: "Display Name",   placeholder: "Business Name" },
                  { key: "wabaId",        label: "WABA ID",        placeholder: "WhatsApp Business Account ID" },
                ].map((f) => (
                  <div key={f.key} className="space-y-1">
                    <label className="text-xs font-medium text-slate-600">{f.label}</label>
                    <input required value={(waForm as any)[f.key]}
                      onChange={(e) => setWaForm({ ...waForm, [f.key]: e.target.value })}
                      placeholder={f.placeholder}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                ))}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Permanent Access Token ★</label>
                  <textarea required value={waForm.accessToken}
                    onChange={(e) => setWaForm({ ...waForm, accessToken: e.target.value })}
                    placeholder="EAAxxxxxxxx..."
                    rows={2}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowWaForm(false)}
                    className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600">Cancel</button>
                  <button type="submit" disabled={waSaving}
                    className="flex-1 py-2 text-sm text-white rounded-lg font-medium disabled:opacity-60"
                    style={{ background: "#25D366" }}>
                    {waSaving ? "Connecting..." : "Connect"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Change Plan Modal */}
      {editOrg && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-5">
            <div>
              <h3 className="text-base font-bold text-slate-900">Change Plan</h3>
              <p className="text-sm text-slate-500 mt-1">{editOrg.name}</p>
            </div>

            <div className="space-y-2">
              {PLANS.map((plan) => (
                <button
                  key={plan}
                  onClick={() => setPlanValue(plan)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all"
                  style={{
                    borderColor: planValue === plan ? PLAN_COLORS[plan] : "#e2e8f0",
                    background: planValue === plan ? PLAN_COLORS[plan] + "10" : "white",
                  }}
                >
                  <span className="text-sm font-semibold" style={{ color: PLAN_COLORS[plan] }}>{plan}</span>
                  {planValue === plan && <span className="text-xs" style={{ color: PLAN_COLORS[plan] }}>✓ Selected</span>}
                </button>
              ))}
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setEditOrg(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={savePlan}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: "#25D366" }}
              >
                {saving ? "Saving..." : "Update Plan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
