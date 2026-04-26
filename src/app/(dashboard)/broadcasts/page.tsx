"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { cn, timeAgo } from "@/lib/utils";
import { toast } from "sonner";

export default function BroadcastsPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", templateId: "", whatsappAccountId: "", filter: { tags: [], stage: "" } });
  const [sending, setSending] = useState<string | null>(null);

  const { data: bData } = useQuery({
    queryKey: ["broadcasts"],
    queryFn: () => axios.get("/api/broadcasts").then((r) => r.data),
  });

  const { data: tData } = useQuery({
    queryKey: ["templates-approved"],
    queryFn: () => axios.get("/api/templates?status=APPROVED").then((r) => r.data),
  });

  const broadcasts = bData?.broadcasts ?? [];
  const templates = tData?.templates ?? [];

  const sendBroadcast = async (id: string) => {
    setSending(id);
    try {
      await axios.post(`/api/broadcasts/${id}/send`);
      toast.success("Broadcast started");
      queryClient.invalidateQueries({ queryKey: ["broadcasts"] });
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? "Failed");
    } finally {
      setSending(null);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post("/api/broadcasts", {
        name: form.name,
        templateId: form.templateId || undefined,
        whatsappAccountId: form.whatsappAccountId || undefined,
        recipientFilter: form.filter,
      });
      toast.success("Broadcast created");
      setShowCreate(false);
      queryClient.invalidateQueries({ queryKey: ["broadcasts"] });
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? "Failed");
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 text-sm font-medium text-white rounded-lg"
          style={{ background: "#25D366" }}
        >
          + New Broadcast
        </button>
      </div>

      {/* Broadcasts List */}
      {broadcasts.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">
          No broadcasts yet. Create your first campaign.
        </div>
      ) : (
        <div className="space-y-3">
          {broadcasts.map((b: any) => (
            <div key={b.id} className="bg-white rounded-xl border p-5" style={{ borderColor: "#e2e8f0" }}>
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-slate-900">{b.name}</h3>
                    <BroadcastStatusBadge status={b.status} />
                  </div>
                  {b.template && (
                    <p className="text-xs text-slate-400">Template: {b.template.name} · {b.template.category}</p>
                  )}
                  <p className="text-xs text-slate-400">{timeAgo(b.createdAt)}</p>
                </div>
                {(b.status === "DRAFT" || b.status === "SCHEDULED") && (
                  <button
                    onClick={() => sendBroadcast(b.id)}
                    disabled={sending === b.id}
                    className="px-3 py-1.5 text-xs font-medium text-white rounded-lg disabled:opacity-60"
                    style={{ background: "#25D366" }}
                  >
                    {sending === b.id ? "Starting..." : "Send Now"}
                  </button>
                )}
              </div>

              {/* Stats */}
              <div className="mt-4 grid grid-cols-5 gap-3">
                {[
                  { label: "Total", value: b.totalCount, color: "text-slate-700" },
                  { label: "Sent", value: b.sentCount, color: "text-blue-600" },
                  { label: "Delivered", value: b.deliveredCount, color: "text-indigo-600" },
                  { label: "Read", value: b.readCount, color: "text-green-600" },
                  { label: "Failed", value: b.failedCount, color: "text-red-600" },
                ].map((s) => (
                  <div key={s.label} className="text-center p-3 rounded-lg bg-slate-50">
                    <p className={cn("text-xl font-bold", s.color)}>{s.value}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Progress bar */}
              {b.status === "RUNNING" && b.totalCount > 0 && (
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span>Progress</span>
                    <span>{Math.round((b.sentCount / b.totalCount) * 100)}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{ width: `${(b.sentCount / b.totalCount) * 100}%`, background: "#25D366" }}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900">New Broadcast</h2>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Campaign Name</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Summer Sale 2024"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Message Template</label>
                <select value={form.templateId} onChange={(e) => setForm({ ...form, templateId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none">
                  <option value="">Select template...</option>
                  {templates.map((t: any) => <option key={t.id} value={t.id}>{t.name} ({t.language})</option>)}
                </select>
                {templates.length === 0 && (
                  <p className="text-xs text-orange-500">No approved templates. Create and submit a template first.</p>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Audience</label>
                <p className="text-xs text-slate-400">All contacts (filtering by tag/stage coming soon)</p>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
                <button type="submit" className="flex-1 py-2 text-sm text-white rounded-lg font-medium" style={{ background: "#25D366" }}>Create Broadcast</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function BroadcastStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    DRAFT: "bg-slate-100 text-slate-600",
    SCHEDULED: "bg-yellow-100 text-yellow-700",
    RUNNING: "bg-blue-100 text-blue-700",
    COMPLETED: "bg-green-100 text-green-700",
    PAUSED: "bg-orange-100 text-orange-700",
    FAILED: "bg-red-100 text-red-700",
  };
  return (
    <span className={cn("px-2 py-0.5 text-xs rounded-full font-medium", map[status] ?? "bg-slate-100 text-slate-600")}>
      {status}
    </span>
  );
}
