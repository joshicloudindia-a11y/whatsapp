"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { cn, timeAgo } from "@/lib/utils";
import { toast } from "sonner";

const CATEGORIES = ["MARKETING", "UTILITY", "AUTHENTICATION"];
const STATUSES = ["ALL", "DRAFT", "PENDING", "APPROVED", "REJECTED"];

export default function TemplatesPage() {
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: "", category: "MARKETING", language: "en",
    body: "", footer: "", headerType: "TEXT", headerContent: "",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["templates", filterStatus],
    queryFn: () =>
      axios.get(`/api/templates${filterStatus !== "ALL" ? `?status=${filterStatus}` : ""}`).then((r) => r.data),
  });

  const templates = data?.templates ?? [];

  const handleCreate = async (submit: boolean) => {
    try {
      await axios.post("/api/templates", { ...form, submit });
      toast.success(submit ? "Template submitted for approval" : "Template saved as draft");
      setShowCreate(false);
      setForm({ name: "", category: "MARKETING", language: "en", body: "", footer: "", headerType: "TEXT", headerContent: "" });
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? "Failed");
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-lg transition-colors",
                filterStatus === s ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 text-sm font-medium text-white rounded-lg"
          style={{ background: "#25D366" }}
        >
          + New Template
        </button>
      </div>

      {/* Template Cards */}
      {isLoading ? (
        <div className="text-center py-12 text-slate-400">Loading...</div>
      ) : templates.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-slate-400 text-sm">No templates yet. Create your first message template.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {templates.map((t: any) => (
            <div key={t.id} className="bg-white rounded-xl border p-5 space-y-3" style={{ borderColor: "#e2e8f0" }}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-slate-900 text-sm">{t.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{t.language.toUpperCase()} · {t.category}</p>
                </div>
                <StatusBadge status={t.status} />
              </div>
              <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-700 whitespace-pre-wrap">
                {t.headerContent && <p className="font-semibold mb-1">{t.headerContent}</p>}
                <p>{t.body}</p>
                {t.footer && <p className="text-slate-400 mt-1">{t.footer}</p>}
              </div>
              {t.rejectionReason && (
                <p className="text-xs text-red-500">Rejected: {t.rejectionReason}</p>
              )}
              <p className="text-xs text-slate-400">{timeAgo(t.createdAt)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-slate-900">Create Message Template</h2>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Template Name</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase().replace(/\s/g, "_") })}
                  placeholder="order_confirmation"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Category</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none">
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Header (optional)</label>
              <input value={form.headerContent} onChange={(e) => setForm({ ...form, headerContent: e.target.value })}
                placeholder="Header text"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Body *</label>
              <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })}
                placeholder="Hi {{1}}, your order {{2}} has been confirmed!"
                rows={4}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-500" />
              <p className="text-xs text-slate-400">Use {`{{1}}`}, {`{{2}}`} for variables</p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Footer (optional)</label>
              <input value={form.footer} onChange={(e) => setForm({ ...form, footer: e.target.value })}
                placeholder="Reply STOP to unsubscribe"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowCreate(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={() => handleCreate(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-900 hover:bg-slate-50 font-medium">Save Draft</button>
              <button onClick={() => handleCreate(true)} className="flex-1 py-2 text-sm text-white rounded-lg font-medium" style={{ background: "#25D366" }}>Submit to Meta</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    DRAFT: "bg-slate-100 text-slate-600",
    PENDING: "bg-yellow-100 text-yellow-700",
    APPROVED: "bg-green-100 text-green-700",
    REJECTED: "bg-red-100 text-red-700",
    DELETED: "bg-slate-100 text-slate-400",
    PAUSED: "bg-orange-100 text-orange-700",
  };
  return (
    <span className={cn("px-2 py-0.5 text-xs rounded-full font-medium", map[status] ?? "bg-slate-100 text-slate-600")}>
      {status}
    </span>
  );
}
