"use client";

import { Icon } from "@/components/ui/icon";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useAdmin } from "@/components/admin/admin-context";
import {
  Page, PageHeader, Card, Badge, SearchInput, FilterTabs, EmptyState, SkeletonRows, Pagination, Modal, useDebounced, cx,
} from "@/components/admin/ui";
import { formatAction } from "@/lib/audit-format";

type Category = "all" | "auth" | "users" | "orgs" | "plans" | "whatsapp" | "security";
const LIMIT = 30;

interface Log {
  id: string; actorId: string | null; actorEmail: string | null; actorRole: string | null; action: string;
  entity: string | null; entityId: string | null; metadata: unknown; ip: string | null; userAgent: string | null; createdAt: string;
}

function iconFor(action: string): string {
  if (action.startsWith("admin.")) return "login";
  if (action.startsWith("user.")) return "person";
  if (action.startsWith("org.")) return "apartment";
  if (action.startsWith("plan.")) return "credit_card";
  if (action.startsWith("whatsapp.")) return "smartphone";
  if (action.startsWith("access.")) return "block";
  return "history";
}

export default function AuditLogsPage() {
  const { can } = useAdmin();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category>("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Log | null>(null);
  const debounced = useDebounced(search);
  const allowed = can("audit:read");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-audit", debounced, category, page],
    queryFn: () => axios.get("/api/admin/audit-logs", { params: { search: debounced, category, page, limit: LIMIT } }).then((r) => r.data),
    enabled: allowed,
    placeholderData: (prev) => prev,
  });
  const logs: Log[] = data?.logs ?? [];

  if (!allowed) {
    return (
      <Page>
        <Card><EmptyState icon={"admin_panel_settings"} title="Access restricted" description="Your role does not include access to audit logs." /></Card>
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader title="Audit Logs" description="Permanent record of every admin sign-in and change. Entries cannot be edited or deleted from the panel." />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search email, action or IP…" />
        <FilterTabs<Category>
          value={category}
          onChange={(v) => { setCategory(v); setPage(1); }}
          options={[
            { value: "all", label: "All" }, { value: "auth", label: "Sign-ins" }, { value: "users", label: "Users" },
            { value: "orgs", label: "Orgs" }, { value: "plans", label: "Plans" }, { value: "whatsapp", label: "WhatsApp" },
            { value: "security", label: "Denied" },
          ]}
        />
      </div>

      <Card className="overflow-hidden">
        {isLoading ? <SkeletonRows rows={8} /> : logs.length === 0 ? (
          <EmptyState icon={"history"} title="No entries" description="Nothing matches these filters yet." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {logs.map((log) => {
              const f = formatAction(log.action);
              return (
                <li key={log.id}>
                  <button onClick={() => setSelected(log)} className="w-full flex items-start gap-3 px-4 sm:px-5 py-3.5 text-left hover:bg-slate-50/70">
                    <div className={cx("mt-0.5 w-9 h-9 rounded-xl flex items-center justify-center shrink-0", f.danger ? "bg-red-50 text-red-500" : "bg-slate-100 text-slate-500")}>
                      <Icon name={iconFor(log.action)} className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="text-sm font-semibold text-slate-900">{f.label}</p>
                        {f.danger && <Badge tone="red">Alert</Badge>}
                      </div>
                      <p className="text-xs text-slate-500 truncate mt-0.5">
                        {log.actorEmail ?? "Unknown"}{log.ip && <span className="font-mono text-slate-400"> · {log.ip}</span>}
                      </p>
                    </div>
                    <time className="text-[11px] text-slate-400 whitespace-nowrap text-right shrink-0">
                      {new Date(log.createdAt).toLocaleDateString()}<br className="sm:hidden" />
                      <span className="hidden sm:inline"> · </span>{new Date(log.createdAt).toLocaleTimeString()}
                    </time>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <Pagination page={page} limit={LIMIT} total={data?.total ?? 0} onChange={setPage} />
      </Card>

      {selected && (
        <Modal open onClose={() => setSelected(null)} title={formatAction(selected.action).label} description={selected.action} icon={iconFor(selected.action)}>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div><dt className="text-xs text-slate-400">Actor</dt><dd className="font-medium text-slate-800 break-all">{selected.actorEmail ?? "—"}</dd></div>
            <div><dt className="text-xs text-slate-400">Role</dt><dd className="font-medium text-slate-800">{selected.actorRole ?? "—"}</dd></div>
            <div><dt className="text-xs text-slate-400">When</dt><dd className="font-medium text-slate-800">{new Date(selected.createdAt).toLocaleString()}</dd></div>
            <div><dt className="text-xs text-slate-400">IP address</dt><dd className="font-mono text-slate-800">{selected.ip ?? "—"}</dd></div>
            {selected.entity && <div><dt className="text-xs text-slate-400">Target</dt><dd className="font-mono text-xs text-slate-800 break-all">{selected.entity} · {selected.entityId}</dd></div>}
            <div className="sm:col-span-2"><dt className="text-xs text-slate-400">Device</dt><dd className="text-xs text-slate-600 break-words">{selected.userAgent ?? "—"}</dd></div>
          </dl>
          {selected.metadata != null && (
            <pre className="mt-4 rounded-xl bg-slate-950 text-green-300 text-[11px] p-4 overflow-x-auto">{JSON.stringify(selected.metadata, null, 2)}</pre>
          )}
        </Modal>
      )}
    </Page>
  );
}
