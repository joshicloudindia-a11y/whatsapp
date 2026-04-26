"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";

const EMPTY_PLAN = {
  name: "", slug: "", description: "", monthlyPrice: 0, annualPrice: 0,
  currency: "USD", isActive: true, isPopular: false, sortOrder: 0,
  maxUsers: 3, maxBroadcasts: 5000, maxAutomations: 100, maxApiCalls: 10000,
  maxAiCredits: 100, maxWhatsappNumbers: 1, features: "[]",
};

export default function AdminPlansPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editPlan, setEditPlan] = useState<any | null>(null);
  const [form, setForm] = useState<any>(EMPTY_PLAN);
  const [saving, setSaving] = useState(false);

  const { data } = useQuery({
    queryKey: ["admin-plans"],
    queryFn: () => axios.get("/api/admin/plans").then((r) => r.data),
  });

  const plans = data?.plans ?? [];

  const openCreate = () => { setForm(EMPTY_PLAN); setEditPlan(null); setShowCreate(true); };
  const openEdit = (plan: any) => {
    setForm({ ...plan, features: JSON.stringify(plan.features ?? []) });
    setEditPlan(plan);
    setShowCreate(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, features: JSON.parse(form.features || "[]") };
      if (editPlan) {
        await axios.patch(`/api/admin/plans/${editPlan.id}`, payload);
        toast.success("Plan updated");
      } else {
        await axios.post("/api/admin/plans", payload);
        toast.success("Plan created");
      }
      qc.invalidateQueries({ queryKey: ["admin-plans"] });
      setShowCreate(false);
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? "Failed");
    } finally {
      setSaving(false);
    }
  };

  const deletePlan = async (id: string) => {
    if (!confirm("Delete this plan?")) return;
    try {
      await axios.delete(`/api/admin/plans/${id}`);
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["admin-plans"] });
    } catch { toast.error("Failed"); }
  };

  const F = (key: string, type = "text") => ({
    value: form[key] ?? "",
    onChange: (e: any) => setForm({ ...form, [key]: type === "number" ? Number(e.target.value) : e.target.value }),
    className: "w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500",
    type,
  });

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Plans & Pricing</h1>
          <p className="text-slate-500 text-sm mt-1">Manage subscription plans and their features</p>
        </div>
        <button onClick={openCreate} className="px-4 py-2 text-sm font-semibold text-white rounded-xl" style={{ background: "#25D366" }}>
          + New Plan
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {plans.map((plan: any) => (
          <div key={plan.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900">{plan.name}</h3>
                  {plan.isPopular && <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Popular</span>}
                  {!plan.isActive && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Inactive</span>}
                </div>
                <p className="text-sm text-slate-500 mt-0.5">{plan.description}</p>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold text-slate-900">${plan.monthlyPrice}<span className="text-sm font-normal text-slate-400">/mo</span></p>
                <p className="text-xs text-slate-400">${plan.annualPrice}/yr</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                ["Users", plan.maxUsers],
                ["Broadcasts", plan.maxBroadcasts.toLocaleString()],
                ["Automations", plan.maxAutomations],
                ["API Calls", plan.maxApiCalls.toLocaleString()],
                ["AI Credits", plan.maxAiCredits],
                ["WA Numbers", plan.maxWhatsappNumbers],
              ].map(([label, val]) => (
                <div key={label} className="rounded-lg p-2 bg-slate-50">
                  <p className="text-xs font-bold text-slate-700">{val}</p>
                  <p className="text-[10px] text-slate-400">{label}</p>
                </div>
              ))}
            </div>

            {plan.features?.length > 0 && (
              <div className="space-y-1">
                {plan.features.slice(0, 3).map((f: string, i: number) => (
                  <p key={i} className="text-xs text-slate-600">✓ {f}</p>
                ))}
                {plan.features.length > 3 && <p className="text-xs text-slate-400">+{plan.features.length - 3} more</p>}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button onClick={() => openEdit(plan)} className="flex-1 py-2 text-sm font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">Edit</button>
              <button onClick={() => deletePlan(plan.id)} className="px-4 py-2 text-sm font-medium rounded-lg border border-red-100 text-red-500 hover:bg-red-50">Delete</button>
            </div>
          </div>
        ))}
      </div>

      {/* Create/Edit Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg space-y-4 my-8">
            <h3 className="text-base font-bold text-slate-900">{editPlan ? "Edit Plan" : "Create Plan"}</h3>
            <form onSubmit={handleSave} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-medium text-slate-600">Name</label><input {...F("name")} required /></div>
                <div><label className="text-xs font-medium text-slate-600">Slug</label><input {...F("slug")} /></div>
              </div>
              <div><label className="text-xs font-medium text-slate-600">Description</label><input {...F("description")} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-medium text-slate-600">Monthly Price ($)</label><input {...F("monthlyPrice", "number")} /></div>
                <div><label className="text-xs font-medium text-slate-600">Annual Price ($)</label><input {...F("annualPrice", "number")} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-xs font-medium text-slate-600">Max Users</label><input {...F("maxUsers", "number")} /></div>
                <div><label className="text-xs font-medium text-slate-600">Max Broadcasts</label><input {...F("maxBroadcasts", "number")} /></div>
                <div><label className="text-xs font-medium text-slate-600">Max Automations</label><input {...F("maxAutomations", "number")} /></div>
                <div><label className="text-xs font-medium text-slate-600">Max API Calls</label><input {...F("maxApiCalls", "number")} /></div>
                <div><label className="text-xs font-medium text-slate-600">Max AI Credits</label><input {...F("maxAiCredits", "number")} /></div>
                <div><label className="text-xs font-medium text-slate-600">WA Numbers</label><input {...F("maxWhatsappNumbers", "number")} /></div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Features (JSON array)</label>
                <textarea {...F("features")} rows={3} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                  Active
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" checked={form.isPopular} onChange={(e) => setForm({ ...form, isPopular: e.target.checked })} />
                  Popular (highlighted)
                </label>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60" style={{ background: "#25D366" }}>
                  {saving ? "Saving..." : editPlan ? "Update" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
