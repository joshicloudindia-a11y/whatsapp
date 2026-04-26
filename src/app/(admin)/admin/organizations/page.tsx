"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";

const PLANS = ["TRIAL", "GROWTH", "PRO", "BUSINESS"] as const;
const PLAN_COLORS: Record<string, string> = {
  TRIAL: "#94a3b8", GROWTH: "#22c55e", PRO: "#6366f1", BUSINESS: "#f59e0b",
};

export default function AdminOrganizationsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editOrg, setEditOrg] = useState<any | null>(null);
  const [planValue, setPlanValue] = useState("");
  const [saving, setSaving] = useState(false);

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
