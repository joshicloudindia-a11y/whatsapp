"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPen, faTrash, faPlus, faXmark, faCrown, faBolt } from "@fortawesome/free-solid-svg-icons";

const EMPTY_PLAN = {
  name: "", slug: "", description: "", monthlyPrice: 0, annualPrice: 0,
  currency: "USD", isActive: true, isPopular: false, sortOrder: 0,
  maxUsers: 3, maxBroadcasts: 5000, maxAutomations: 100, maxApiCalls: 10000,
  maxAiCredits: 100, maxWhatsappNumbers: 1, features: "[]",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white";

export default function AdminPlansPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editPlan, setEditPlan] = useState<any | null>(null);
  const [form, setForm] = useState<any>(EMPTY_PLAN);
  const [saving, setSaving] = useState(false);

  const { data } = useQuery({
    queryKey: ["admin-plans"],
    queryFn: () => axios.get("/api/admin/plans").then((r) => r.data),
  });

  const plans = data?.plans ?? [];

  const openCreate = () => { setForm(EMPTY_PLAN); setEditPlan(null); setShowForm(true); };
  const openEdit = (plan: any) => {
    setForm({ ...plan, features: JSON.stringify(plan.features ?? []) });
    setEditPlan(plan);
    setShowForm(true);
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
      setShowForm(false);
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

  const set = (key: string, val: any) => setForm((f: any) => ({ ...f, [key]: val }));
  const num = (key: string) => ({ value: form[key] ?? 0, onChange: (e: any) => set(key, Number(e.target.value)), type: "number", className: inputCls });
  const txt = (key: string) => ({ value: form[key] ?? "", onChange: (e: any) => set(key, e.target.value), className: inputCls });

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Plans & Pricing</h1>
          <p className="text-slate-500 text-sm mt-1">Manage subscription plans and their features</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white rounded-xl self-start sm:self-auto"
          style={{ background: "#25D366" }}
        >
          <FontAwesomeIcon icon={faPlus} className="w-3.5 h-3.5" />
          New Plan
        </button>
      </div>

      {/* Plan cards */}
      {plans.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-16 text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: "#f0fdf4" }}>
            <FontAwesomeIcon icon={faCrown} className="w-6 h-6" style={{ color: "#25D366" }} />
          </div>
          <p className="text-slate-700 font-semibold">No plans yet</p>
          <p className="text-slate-400 text-sm mt-1">Create your first subscription plan to get started</p>
          <button onClick={openCreate} className="mt-5 px-5 py-2.5 text-sm font-semibold text-white rounded-xl" style={{ background: "#25D366" }}>
            Create Plan
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {plans.map((plan: any) => (
            <div key={plan.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col gap-4">

              {/* Plan header */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-bold text-slate-900">{plan.name}</h3>
                    {plan.isPopular && (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                        <FontAwesomeIcon icon={faCrown} className="w-2.5 h-2.5" /> Popular
                      </span>
                    )}
                    {!plan.isActive && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Inactive</span>
                    )}
                  </div>
                  {plan.description && (
                    <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{plan.description}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold text-slate-900 leading-none">
                    ${plan.monthlyPrice}<span className="text-xs font-normal text-slate-400">/mo</span>
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">${plan.annualPrice}/yr</p>
                </div>
              </div>

              {/* Limits grid */}
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  ["Users", plan.maxUsers],
                  ["Broadcasts", plan.maxBroadcasts >= 999999 ? "∞" : plan.maxBroadcasts.toLocaleString()],
                  ["Automations", plan.maxAutomations],
                  ["API Calls", plan.maxApiCalls >= 1000000 ? `${(plan.maxApiCalls/1000).toFixed(0)}K` : plan.maxApiCalls.toLocaleString()],
                  ["AI Credits", plan.maxAiCredits],
                  ["WA Nums", plan.maxWhatsappNumbers],
                ].map(([label, val]) => (
                  <div key={label as string} className="rounded-lg p-2 bg-slate-50">
                    <p className="text-xs font-bold text-slate-800">{val}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>

              {/* Features */}
              {plan.features?.length > 0 && (
                <div className="space-y-1.5 flex-1">
                  {plan.features.slice(0, 3).map((f: string, i: number) => (
                    <p key={i} className="flex items-start gap-1.5 text-xs text-slate-600">
                      <FontAwesomeIcon icon={faBolt} className="w-2.5 h-2.5 mt-0.5 shrink-0" style={{ color: "#25D366" }} />
                      {f}
                    </p>
                  ))}
                  {plan.features.length > 3 && (
                    <p className="text-xs text-slate-400">+{plan.features.length - 3} more features</p>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-1 border-t border-slate-50">
                <button
                  onClick={() => openEdit(plan)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  <FontAwesomeIcon icon={faPen} className="w-3 h-3" />
                  Edit
                </button>
                <button
                  onClick={() => deletePlan(plan.id)}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-red-100 text-red-500 hover:bg-red-50 transition-colors"
                >
                  <FontAwesomeIcon icon={faTrash} className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] rounded-t-2xl">

            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
              <h3 className="text-base font-bold text-slate-900">
                {editPlan ? "Edit Plan" : "Create New Plan"}
              </h3>
              <button
                onClick={() => setShowForm(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <FontAwesomeIcon icon={faXmark} className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable form body */}
            <div className="overflow-y-auto flex-1">
              <form id="plan-form" onSubmit={handleSave} className="p-5 space-y-4">

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Plan Name">
                    <input {...txt("name")} required placeholder="e.g. Growth" />
                  </Field>
                  <Field label="Slug">
                    <input {...txt("slug")} placeholder="e.g. growth" />
                  </Field>
                </div>

                <Field label="Description">
                  <input {...txt("description")} placeholder="Short description" />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Monthly Price ($)">
                    <input {...num("monthlyPrice")} min={0} />
                  </Field>
                  <Field label="Annual Price ($)">
                    <input {...num("annualPrice")} min={0} />
                  </Field>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <Field label="Max Users"><input {...num("maxUsers")} min={1} /></Field>
                  <Field label="Broadcasts"><input {...num("maxBroadcasts")} min={0} /></Field>
                  <Field label="Automations"><input {...num("maxAutomations")} min={0} /></Field>
                  <Field label="API Calls"><input {...num("maxApiCalls")} min={0} /></Field>
                  <Field label="AI Credits"><input {...num("maxAiCredits")} min={0} /></Field>
                  <Field label="WA Numbers"><input {...num("maxWhatsappNumbers")} min={1} /></Field>
                </div>

                <Field label="Features (JSON array)">
                  <textarea
                    {...txt("features")}
                    rows={3}
                    placeholder='["Feature one", "Feature two"]'
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                  />
                </Field>

                <div className="flex flex-wrap gap-5">
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.isActive}
                      onChange={(e) => set("isActive", e.target.checked)}
                      className="w-4 h-4 rounded accent-green-500"
                    />
                    Active
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.isPopular}
                      onChange={(e) => set("isPopular", e.target.checked)}
                      className="w-4 h-4 rounded accent-green-500"
                    />
                    Mark as Popular
                  </label>
                </div>
              </form>
            </div>

            {/* Modal footer */}
            <div className="flex gap-3 px-5 py-4 border-t border-slate-100 shrink-0">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="plan-form"
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60 transition-opacity"
                style={{ background: "#25D366" }}
              >
                {saving ? "Saving…" : editPlan ? "Update Plan" : "Create Plan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
