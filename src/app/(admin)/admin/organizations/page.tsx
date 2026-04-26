"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMagnifyingGlass, faMobileScreenButton, faTrash, faPen, faPlus,
  faCircleCheck, faCircleXmark, faWifi,
} from "@fortawesome/free-solid-svg-icons";

const PLANS = ["TRIAL", "GROWTH", "PRO", "BUSINESS"] as const;
const PLAN_STYLE: Record<string, { bg: string; text: string; dot: string }> = {
  TRIAL:    { bg: "#f1f5f9", text: "#64748b", dot: "#94a3b8" },
  GROWTH:   { bg: "#f0fdf4", text: "#16a34a", dot: "#22c55e" },
  PRO:      { bg: "#f5f3ff", text: "#7c3aed", dot: "#8b5cf6" },
  BUSINESS: { bg: "#fffbeb", text: "#d97706", dot: "#f59e0b" },
};

const WA_EMPTY = { phoneNumber: "", phoneNumberId: "", displayName: "", wabaId: "", accessToken: "" };

export default function AdminOrganizationsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editOrg, setEditOrg] = useState<any | null>(null);
  const [planValue, setPlanValue] = useState("");
  const [saving, setSaving] = useState(false);

  const [waOrg, setWaOrg] = useState<any | null>(null);
  const [waForm, setWaForm] = useState({ ...WA_EMPTY });
  const [showWaForm, setShowWaForm] = useState(false);
  const [waDeleting, setWaDeleting] = useState<string | null>(null);
  const [waSaving, setWaSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-orgs", search],
    queryFn: () => axios.get(`/api/admin/organizations?search=${search}&limit=50`).then((r) => r.data),
  });

  const { data: waOrgData, refetch: refetchWa } = useQuery({
    queryKey: ["admin-org-detail", waOrg?.id],
    queryFn: () => waOrg ? axios.get(`/api/admin/organizations/${waOrg.id}`).then((r) => r.data) : null,
    enabled: !!waOrg,
  });
  const waAccounts: any[] = waOrgData?.organization?.whatsappAccounts ?? [];

  const orgs = data?.organizations ?? [];

  const openEdit = (org: any) => { setEditOrg(org); setPlanValue(org.plan); };

  const savePlan = async () => {
    if (!editOrg) return;
    setSaving(true);
    try {
      await axios.patch(`/api/admin/organizations/${editOrg.id}`, { plan: planValue });
      toast.success(`Plan updated to ${planValue}`);
      qc.invalidateQueries({ queryKey: ["admin-orgs"] });
      setEditOrg(null);
    } catch { toast.error("Failed to update plan"); }
    finally { setSaving(false); }
  };

  const deleteOrg = async (org: any) => {
    if (!confirm(`Delete "${org.name}"? This cannot be undone.`)) return;
    try {
      await axios.delete(`/api/admin/organizations/${org.id}`);
      toast.success("Organization deleted");
      qc.invalidateQueries({ queryKey: ["admin-orgs"] });
    } catch { toast.error("Failed to delete"); }
  };

  const handleWaAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setWaSaving(true);
    try {
      await axios.post(`/api/admin/organizations/${waOrg.id}/whatsapp`, waForm);
      toast.success("WhatsApp number connected");
      setWaForm({ ...WA_EMPTY });
      setShowWaForm(false);
      refetchWa();
    } catch (e: any) { toast.error(e.response?.data?.error ?? "Failed"); }
    finally { setWaSaving(false); }
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

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Organizations</h1>
          <p className="text-slate-500 text-sm mt-1">Manage all customer workspaces</p>
        </div>
        <span className="text-sm font-medium text-slate-500 bg-white border border-slate-200 rounded-lg px-3 py-1.5">
          {data?.total ?? 0} total
        </span>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <FontAwesomeIcon icon={faMagnifyingGlass} className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
        <input
          type="text"
          placeholder="Search organizations..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="w-full min-w-[700px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Organization</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Plan</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Members</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Conversations</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Created</th>
              <th className="px-5 py-3.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading ? (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-400 text-sm">Loading...</td></tr>
            ) : orgs.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-400 text-sm">No organizations found</td></tr>
            ) : orgs.map((org: any) => {
              const s = PLAN_STYLE[org.plan] ?? PLAN_STYLE.TRIAL;
              return (
                <tr key={org.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
                        style={{ background: s.bg, color: s.dot }}
                      >
                        {org.name[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{org.name}</p>
                        <p className="text-xs text-slate-400">{org.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: s.bg, color: s.text }}>
                      {org.plan}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-700">{org._count?.members ?? 0}</td>
                  <td className="px-5 py-4 text-sm text-slate-700">{org._count?.conversations ?? 0}</td>
                  <td className="px-5 py-4 text-xs text-slate-400">{new Date(org.createdAt).toLocaleDateString()}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEdit(org)}
                        title="Change Plan"
                        className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                      >
                        <FontAwesomeIcon icon={faPen} className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => { setWaOrg(org); setShowWaForm(false); setWaForm({ ...WA_EMPTY }); }}
                        title="Manage WhatsApp"
                        className="w-8 h-8 flex items-center justify-center rounded-lg border border-green-200 text-green-600 hover:bg-green-50 transition-colors"
                      >
                        <FontAwesomeIcon icon={faMobileScreenButton} className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteOrg(org)}
                        title="Delete Organization"
                        className="w-8 h-8 flex items-center justify-center rounded-lg border border-red-100 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                      >
                        <FontAwesomeIcon icon={faTrash} className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* WhatsApp Modal */}
      {waOrg && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-5 my-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "#25D366" }}>
                  <FontAwesomeIcon icon={faMobileScreenButton} className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">WhatsApp Numbers</h3>
                  <p className="text-xs text-slate-500">{waOrg.name}</p>
                </div>
              </div>
              <button onClick={() => setWaOrg(null)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100">×</button>
            </div>

            <div className="space-y-2">
              {waAccounts.length === 0 ? (
                <div className="text-center py-6 text-slate-400">
                  <FontAwesomeIcon icon={faWifi} className="w-6 h-6 mb-2 opacity-40" />
                  <p className="text-sm">No numbers connected yet</p>
                </div>
              ) : waAccounts.map((acc: any) => (
                <div key={acc.id} className="flex items-center justify-between gap-3 bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
                  <div className="min-w-0 flex items-center gap-3">
                    <FontAwesomeIcon icon={acc.isActive ? faCircleCheck : faCircleXmark} className={`w-4 h-4 shrink-0 ${acc.isActive ? "text-green-500" : "text-slate-300"}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{acc.displayName || "—"}</p>
                      <p className="text-xs text-slate-400 font-mono">+{acc.phoneNumber}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => handleWaToggle(acc)}
                      className="text-xs px-2.5 py-1 border border-slate-200 rounded-lg text-slate-600 hover:bg-white font-medium bg-white">
                      {acc.isActive ? "Deactivate" : "Activate"}
                    </button>
                    <button onClick={() => handleWaDelete(acc)} disabled={waDeleting === acc.id}
                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 disabled:opacity-40">
                      <FontAwesomeIcon icon={faTrash} className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {!showWaForm ? (
              <button onClick={() => setShowWaForm(true)}
                className="w-full py-2.5 text-sm font-semibold text-white rounded-xl flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
                style={{ background: "#25D366" }}>
                <FontAwesomeIcon icon={faPlus} className="w-3.5 h-3.5" />
                Connect New Number
              </button>
            ) : (
              <form onSubmit={handleWaAdd} className="space-y-3 border-t pt-4 border-slate-100">
                <p className="text-sm font-semibold text-slate-900">Connect WhatsApp Number</p>
                {[
                  { key: "phoneNumber",   label: "Phone Number",      placeholder: "919876543210 (no +)" },
                  { key: "phoneNumberId", label: "Phone Number ID ★", placeholder: "From Meta API Setup" },
                  { key: "displayName",   label: "Display Name",      placeholder: "Business Name" },
                  { key: "wabaId",        label: "WABA ID",           placeholder: "WhatsApp Business Account ID" },
                ].map((f) => (
                  <div key={f.key} className="space-y-1">
                    <label className="text-xs font-medium text-slate-600">{f.label}</label>
                    <input required value={(waForm as any)[f.key]}
                      onChange={(e) => setWaForm({ ...waForm, [f.key]: e.target.value })}
                      placeholder={f.placeholder}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white" />
                  </div>
                ))}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Permanent Access Token ★</label>
                  <textarea required value={waForm.accessToken}
                    onChange={(e) => setWaForm({ ...waForm, accessToken: e.target.value })}
                    placeholder="EAAxxxxxxxx..."
                    rows={2}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-500 bg-white" />
                </div>
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => setShowWaForm(false)}
                    className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
                  <button type="submit" disabled={waSaving}
                    className="flex-1 py-2 text-sm text-white rounded-lg font-semibold disabled:opacity-60 hover:opacity-90"
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm space-y-5">
            <div>
              <h3 className="text-base font-bold text-slate-900">Change Plan</h3>
              <p className="text-sm text-slate-500 mt-1">{editOrg.name}</p>
            </div>
            <div className="space-y-2">
              {PLANS.map((plan) => {
                const s = PLAN_STYLE[plan];
                const selected = planValue === plan;
                return (
                  <button key={plan} onClick={() => setPlanValue(plan)}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all"
                    style={{ borderColor: selected ? s.dot : "#e2e8f0", background: selected ? s.bg : "white" }}>
                    <div className="flex items-center gap-2.5">
                      <div className="w-2 h-2 rounded-full" style={{ background: s.dot }} />
                      <span className="text-sm font-semibold" style={{ color: s.text }}>{plan}</span>
                    </div>
                    {selected && <FontAwesomeIcon icon={faCircleCheck} className="w-4 h-4" style={{ color: s.dot }} />}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setEditOrg(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={savePlan} disabled={saving}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60 hover:opacity-90"
                style={{ background: "#25D366" }}>
                {saving ? "Saving..." : "Update Plan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
