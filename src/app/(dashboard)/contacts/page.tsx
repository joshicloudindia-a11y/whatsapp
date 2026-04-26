"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { cn, getInitials, timeAgo } from "@/lib/utils";
import { toast } from "sonner";

const STAGES = ["LEAD", "PROSPECT", "CUSTOMER", "CHURNED"] as const;

export default function ContactsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", stage: "LEAD" });

  const { data, isLoading } = useQuery({
    queryKey: ["contacts", search, stage],
    queryFn: () =>
      axios.get(`/api/contacts?search=${search}&stage=${stage}&limit=100`).then((r) => r.data),
  });

  const contacts = data?.contacts ?? [];

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post("/api/contacts", form);
      toast.success("Contact added");
      setShowAdd(false);
      setForm({ name: "", phone: "", email: "", stage: "LEAD" });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? "Failed");
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Search by name, phone, email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 max-w-xs px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
        />
        <select
          value={stage}
          onChange={(e) => setStage(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none"
        >
          <option value="">All stages</option>
          {STAGES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 text-sm font-medium text-white rounded-lg"
          style={{ background: "#25D366" }}
        >
          + Add Contact
        </button>
      </div>

      {/* Stats bar */}
      <div className="flex gap-6 text-sm text-slate-500">
        <span><strong className="text-slate-900">{data?.total ?? 0}</strong> total contacts</span>
        {STAGES.map((s) => (
          <span key={s}>
            <strong className="text-slate-900">
              {contacts.filter((c: any) => c.stage === s).length}
            </strong>{" "}
            {s.toLowerCase()}
          </span>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: "#e2e8f0" }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-slate-500 uppercase tracking-wide" style={{ borderColor: "#e2e8f0", background: "#f8fafc" }}>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Stage</th>
              <th className="px-4 py-3">Tags</th>
              <th className="px-4 py-3">Conversations</th>
              <th className="px-4 py-3">Added</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: "#f1f5f9" }}>
            {isLoading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Loading...</td></tr>
            ) : contacts.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No contacts found</td></tr>
            ) : (
              contacts.map((c: any) => (
                <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: "#25D366" }}>
                        {getInitials(c.name || c.phone)}
                      </div>
                      <span className="font-medium text-slate-900">{c.name || "—"}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{c.phone}</td>
                  <td className="px-4 py-3 text-slate-600">{c.email || "—"}</td>
                  <td className="px-4 py-3">
                    <StageBadge stage={c.stage} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {c.tags?.slice(0, 3).map((t: any) => (
                        <span key={t.id} className="px-2 py-0.5 text-xs rounded-full bg-slate-100 text-slate-600">{t.tag}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{c._count?.conversations ?? 0}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{timeAgo(c.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Contact Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Add Contact</h2>
            <form onSubmit={handleAdd} className="space-y-3">
              <input required placeholder="Phone number *" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              <input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              <select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none">
                {STAGES.map((s) => <option key={s}>{s}</option>)}
              </select>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowAdd(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
                <button type="submit" className="flex-1 py-2 text-sm text-white rounded-lg font-medium" style={{ background: "#25D366" }}>Add Contact</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function StageBadge({ stage }: { stage: string }) {
  const map: Record<string, string> = {
    LEAD: "bg-yellow-100 text-yellow-700",
    PROSPECT: "bg-blue-100 text-blue-700",
    CUSTOMER: "bg-green-100 text-green-700",
    CHURNED: "bg-red-100 text-red-700",
  };
  return (
    <span className={cn("px-2 py-0.5 text-xs rounded-full font-medium", map[stage] ?? "bg-slate-100 text-slate-600")}>
      {stage}
    </span>
  );
}
