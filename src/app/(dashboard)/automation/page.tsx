"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { cn, timeAgo } from "@/lib/utils";
import { toast } from "sonner";

const EVENTS = [
  "MESSAGE_RECEIVED", "CONVERSATION_CREATED", "CONVERSATION_ASSIGNED",
  "CONVERSATION_RESOLVED", "CONTACT_CREATED", "CONTACT_UPDATED", "BROADCAST_REPLIED",
];

export default function AutomationPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: "", triggerEvent: "MESSAGE_RECEIVED",
    conditions: "[]", actions: "[]",
  });

  const { data } = useQuery({
    queryKey: ["automations"],
    queryFn: () => axios.get("/api/automations").then((r) => r.data),
  });

  const automations = data?.automations ?? [];

  const toggle = async (id: string, isActive: boolean) => {
    await axios.patch(`/api/automations/${id}`, { isActive: !isActive });
    queryClient.invalidateQueries({ queryKey: ["automations"] });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post("/api/automations", {
        ...form,
        conditions: JSON.parse(form.conditions),
        actions: JSON.parse(form.actions),
      });
      toast.success("Automation created");
      setShowCreate(false);
      queryClient.invalidateQueries({ queryKey: ["automations"] });
    } catch {
      toast.error("Failed to create automation");
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 text-sm font-medium text-white rounded-lg"
          style={{ background: "#25D366" }}
        >
          + New Automation
        </button>
      </div>

      {automations.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">
          No automations yet. Create rules to auto-respond, assign, or tag conversations.
        </div>
      ) : (
        <div className="space-y-3">
          {automations.map((a: any) => (
            <div key={a.id} className="bg-white rounded-xl border p-5 flex items-start justify-between" style={{ borderColor: "#e2e8f0" }}>
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <h3 className="font-semibold text-slate-900">{a.name}</h3>
                  <span className="px-2 py-0.5 text-xs bg-slate-100 text-slate-600 rounded-full">{a.triggerEvent}</span>
                </div>
                <p className="text-xs text-slate-400">Ran {a.runCount} times · {timeAgo(a.createdAt)}</p>
              </div>
              <button
                onClick={() => toggle(a.id, a.isActive)}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors",
                  a.isActive ? "bg-green-500" : "bg-slate-200"
                )}
              >
                <span className={cn("inline-block w-4 h-4 transform rounded-full bg-white shadow transition-transform mt-0.5",
                  a.isActive ? "translate-x-4 ml-0.5" : "translate-x-0.5"
                )} />
              </button>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900">New Automation Rule</h2>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Name</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Auto-assign support conversations"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Trigger Event</label>
                <select value={form.triggerEvent} onChange={(e) => setForm({ ...form, triggerEvent: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none">
                  {EVENTS.map((e) => <option key={e}>{e}</option>)}
                </select>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg text-xs text-blue-700">
                Advanced conditions and actions are configured via the API or visual editor (coming soon).
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
                <button type="submit" className="flex-1 py-2 text-sm text-white rounded-lg font-medium" style={{ background: "#25D366" }}>Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
