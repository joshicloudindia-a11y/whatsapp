"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

export default function AnalyticsPage() {
  const [range, setRange] = useState("7d");

  const { data, isLoading } = useQuery({
    queryKey: ["analytics", range],
    queryFn: () => axios.get(`/api/analytics?range=${range}`).then((r) => r.data),
  });

  const overview = data?.overview ?? {};

  const kpis = [
    { label: "Total Conversations", value: overview.totalConversations ?? 0, icon: "💬", color: "#25D366" },
    { label: "Open Conversations", value: overview.openConversations ?? 0, icon: "📂", color: "#3b82f6" },
    { label: "Resolved", value: overview.resolvedConversations ?? 0, icon: "✅", color: "#10b981" },
    { label: "Messages Sent", value: overview.messagesSent ?? 0, icon: "📤", color: "#8b5cf6" },
    { label: "Messages Received", value: overview.messagesReceived ?? 0, icon: "📥", color: "#f59e0b" },
    { label: "New Contacts", value: overview.newContacts ?? 0, icon: "👤", color: "#ef4444" },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Range picker */}
      <div className="flex gap-1">
        {[["7d", "Last 7 days"], ["30d", "Last 30 days"], ["90d", "Last 90 days"]].map(([val, label]) => (
          <button
            key={val}
            onClick={() => setRange(val)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              range === val ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {kpis.map((k) => (
          <div key={k.label} className="bg-white rounded-xl border p-5" style={{ borderColor: "#e2e8f0" }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-slate-500">{k.label}</p>
              <span className="text-lg">{k.icon}</span>
            </div>
            <p className="text-3xl font-bold" style={{ color: k.color }}>
              {isLoading ? "—" : k.value.toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      {/* Message Volume Chart */}
      <div className="bg-white rounded-xl border p-5" style={{ borderColor: "#e2e8f0" }}>
        <h2 className="text-base font-semibold text-slate-900 mb-5">Message Volume</h2>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data?.dailyMessages ?? []}>
            <defs>
              <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#25D366" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#25D366" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip />
            <Legend />
            <Area type="monotone" dataKey="sent" stroke="#25D366" fill="url(#g1)" strokeWidth={2} name="Sent" />
            <Area type="monotone" dataKey="received" stroke="#3b82f6" fill="url(#g2)" strokeWidth={2} name="Received" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Broadcast Performance */}
      {data?.recentBroadcasts?.length > 0 && (
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: "#e2e8f0" }}>
          <h2 className="text-base font-semibold text-slate-900 mb-5">Broadcast Performance</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.recentBroadcasts}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="sentCount" name="Sent" fill="#25D366" radius={[4, 4, 0, 0]} />
              <Bar dataKey="readCount" name="Read" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="failedCount" name="Failed" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
