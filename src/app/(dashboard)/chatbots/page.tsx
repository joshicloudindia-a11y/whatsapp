"use client";

import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { cn, timeAgo } from "@/lib/utils";
import { toast } from "sonner";
import dynamic from "next/dynamic";

const ChatbotBuilder = dynamic(() => import("@/components/chatbot/chatbot-builder"), { ssr: false });

export default function ChatbotsPage() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", triggerType: "KEYWORD", triggerValue: "" });

  const { data } = useQuery({
    queryKey: ["chatbots"],
    queryFn: () => axios.get("/api/chatbots").then((r) => r.data),
  });

  const chatbots = data?.chatbots ?? [];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await axios.post("/api/chatbots", form);
      toast.success("Chatbot created");
      setShowCreate(false);
      queryClient.invalidateQueries({ queryKey: ["chatbots"] });
      setSelected(res.data.chatbot.id);
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? "Failed");
    }
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    await axios.patch(`/api/chatbots/${id}`, { isActive: !isActive });
    queryClient.invalidateQueries({ queryKey: ["chatbots"] });
    toast.success(!isActive ? "Chatbot activated" : "Chatbot deactivated");
  };

  if (selected) {
    return (
      <div className="h-full flex flex-col">
        <div className="h-14 flex items-center justify-between px-5 border-b bg-white" style={{ borderColor: "#e2e8f0" }}>
          <button onClick={() => setSelected(null)} className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
            ← Back to Chatbots
          </button>
          <span className="text-sm font-medium text-slate-900">
            {chatbots.find((c: any) => c.id === selected)?.name}
          </span>
          <button
            onClick={async () => {
              toast.success("Chatbot flow saved");
            }}
            className="px-4 py-1.5 text-sm font-medium text-white rounded-lg"
            style={{ background: "#25D366" }}
          >
            Save Flow
          </button>
        </div>
        <ChatbotBuilder chatbotId={selected} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 text-sm font-medium text-white rounded-lg"
          style={{ background: "#25D366" }}
        >
          + New Chatbot
        </button>
      </div>

      {chatbots.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: "#f0fdf4" }}>
            <BotIcon />
          </div>
          <p className="text-slate-600 font-medium">No chatbots yet</p>
          <p className="text-slate-400 text-sm mt-1">Create your first chatbot flow to automate conversations</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {chatbots.map((bot: any) => (
            <div key={bot.id} className="bg-white rounded-xl border p-5 space-y-3" style={{ borderColor: "#e2e8f0" }}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900">{bot.name}</h3>
                  {bot.description && <p className="text-xs text-slate-400 mt-0.5">{bot.description}</p>}
                </div>
                <button
                  onClick={() => toggleActive(bot.id, bot.isActive)}
                  className={cn(
                    "relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors",
                    bot.isActive ? "bg-green-500" : "bg-slate-200"
                  )}
                >
                  <span className={cn("inline-block w-4 h-4 transform rounded-full bg-white shadow transition-transform mt-0.5",
                    bot.isActive ? "translate-x-4 ml-0.5" : "translate-x-0.5"
                  )} />
                </button>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="px-2 py-0.5 bg-slate-100 rounded-full">{bot.triggerType}</span>
                {bot.triggerValue && <span className="text-slate-400">"{bot.triggerValue}"</span>}
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>{timeAgo(bot.createdAt)}</span>
                <span>{bot._count?.sessions ?? 0} sessions</span>
              </div>
              <button
                onClick={() => setSelected(bot.id)}
                className="w-full py-2 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 font-medium"
              >
                Edit Flow
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Create Chatbot</h2>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Name</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Customer Support Bot"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Trigger Type</label>
                <select value={form.triggerType} onChange={(e) => setForm({ ...form, triggerType: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none">
                  <option value="KEYWORD">Keyword Match</option>
                  <option value="NEW_CONVERSATION">New Conversation</option>
                  <option value="ANY_MESSAGE">Any Message</option>
                </select>
              </div>
              {form.triggerType === "KEYWORD" && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Keyword</label>
                  <input value={form.triggerValue} onChange={(e) => setForm({ ...form, triggerValue: e.target.value })}
                    placeholder="hi, hello, start"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
                <button type="submit" className="flex-1 py-2 text-sm text-white rounded-lg font-medium" style={{ background: "#25D366" }}>Create & Build</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function BotIcon() {
  return (
    <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
    </svg>
  );
}
