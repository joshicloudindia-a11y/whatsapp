"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";
import { cn, getInitials, timeAgo } from "@/lib/utils";
import { Meter, SButton, SettingsCard, SettingsHeader, sInput, settingsError } from "./ui";

const ROLES = [
  { value: "ADMIN", label: "Admin", desc: "Full access including team, billing and settings" },
  { value: "AGENT", label: "Agent", desc: "Replies to customers in the inbox" },
  { value: "CAMPAIGN_MANAGER", label: "Campaign manager", desc: "Creates and sends broadcasts" },
  { value: "TEMPLATE_MANAGER", label: "Template manager", desc: "Creates message templates" },
  { value: "AUTOMATION_MANAGER", label: "Automation manager", desc: "Builds chatbots and automations" },
  { value: "BILLING_MANAGER", label: "Billing manager", desc: "Manages the subscription" },
];
const roleLabel = (r: string) => ROLES.find((x) => x.value === r)?.label ?? r;

interface Member { id: string; role: string; joinedAt: string | null; createdAt: string; user: { id: string; name: string | null; email: string; lastLoginAt: string | null } }
interface Invite { id: string; email: string; role: string; expiresAt: string; createdAt: string }
interface TeamData { members: Member[]; invitations: Invite[]; seats: { members: number; pending: number; used: number; limit: number; planName: string }; me: { userId: string; isAdmin: boolean } }

export function TeamSettings() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["team"], queryFn: () => axios.get("/api/settings/team").then((r) => r.data as TeamData) });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("AGENT");
  const [inviting, setInviting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [removing, setRemoving] = useState<Member | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["team"] });

  const invite = async (e: React.FormEvent, target?: { email: string; role: string }) => {
    e.preventDefault();
    const payload = target ?? { email, role };
    target ? setBusy(target.email) : setInviting(true);
    try {
      const r = await axios.post("/api/settings/team/invite", payload);
      toast.success(r.data.resent ? `Invitation re-sent to ${payload.email}` : `Invitation sent to ${payload.email}`);
      if (!target) setEmail("");
      refresh();
    } catch (e) { toast.error(settingsError(e)); refresh(); }
    finally { setInviting(false); setBusy(null); }
  };

  const cancelInvite = async (inv: Invite) => {
    setBusy(inv.id);
    try { await axios.delete("/api/settings/team/invite", { params: { id: inv.id } }); toast.success("Invitation cancelled"); refresh(); }
    catch (e) { toast.error(settingsError(e)); }
    finally { setBusy(null); }
  };

  const changeRole = async (m: Member, newRole: string) => {
    setBusy(m.id);
    try { await axios.patch(`/api/settings/team/${m.id}`, { role: newRole }); toast.success(`${m.user.name ?? m.user.email} is now ${roleLabel(newRole)}`); refresh(); }
    catch (e) { toast.error(settingsError(e)); }
    finally { setBusy(null); }
  };

  const remove = async () => {
    if (!removing) return;
    setBusy(removing.id);
    try { await axios.delete(`/api/settings/team/${removing.id}`); toast.success("Member removed"); setRemoving(null); refresh(); }
    catch (e) { toast.error(settingsError(e)); }
    finally { setBusy(null); }
  };

  if (isLoading || !data) return <div className="max-w-4xl space-y-4">{[0, 1].map((i) => <div key={i} className="h-40 rounded-2xl bg-white border border-slate-200 animate-pulse" />)}</div>;

  const { seats, me } = data;
  const full = seats.used >= seats.limit;
  const q = search.trim().toLowerCase();
  const members = data.members.filter((m) => !q || (m.user.name ?? "").toLowerCase().includes(q) || m.user.email.toLowerCase().includes(q));

  return (
    <div className="max-w-4xl space-y-5">
      <SettingsHeader title="Team" description="Invite teammates and control what they can do." />

      {/* Seats */}
      <SettingsCard>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3 flex-1">
            <span className="w-11 h-11 rounded-xl bg-green-50 text-green-600 flex items-center justify-center shrink-0"><Icon name="group" className="w-5 h-5" /></span>
            <div className="flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-bold text-slate-900">{seats.used} of {seats.limit} seats used</p>
                <p className="text-xs text-slate-500">{seats.planName}</p>
              </div>
              <Meter used={seats.used} limit={seats.limit} className="mt-2" />
              <p className="mt-1.5 text-[11px] text-slate-500">{seats.members} member{seats.members === 1 ? "" : "s"} · {seats.pending} pending invite{seats.pending === 1 ? "" : "s"}</p>
            </div>
          </div>
          {full && me.isAdmin && <a href="/settings?tab=billing" className="self-start sm:self-auto shrink-0 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-xs font-semibold text-green-700 hover:bg-green-100">Upgrade for more seats</a>}
        </div>
      </SettingsCard>

      {/* Invite */}
      {me.isAdmin && (
        <form onSubmit={(e) => invite(e)}>
          <SettingsCard title="Invite a teammate" description="They'll get an email link valid for 7 days." icon="person_add">
            <div className="grid gap-2 sm:grid-cols-[1fr_200px_auto]">
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="colleague@company.com" className={sInput} disabled={full} />
              <select value={role} onChange={(e) => setRole(e.target.value)} className={sInput} disabled={full}>
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <SButton type="submit" loading={inviting} disabled={full}><Icon name="mail" className="w-4 h-4" /> Send invite</SButton>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">{full ? "All seats are in use. Remove a member, cancel an invite or upgrade your plan." : ROLES.find((r) => r.value === role)?.desc}</p>
          </SettingsCard>
        </form>
      )}

      {/* Pending invitations */}
      {me.isAdmin && data.invitations.length > 0 && (
        <SettingsCard title={`Pending invitations (${data.invitations.length})`} icon="schedule">
          <ul className="-my-2 divide-y divide-slate-100">
            {data.invitations.map((inv) => {
              const expired = new Date(inv.expiresAt) < new Date();
              return (
                <li key={inv.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="w-9 h-9 rounded-full border-2 border-dashed border-slate-300 text-slate-400 flex items-center justify-center shrink-0"><Icon name="mail" className="w-4 h-4" /></span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{inv.email}</p>
                      <p className="text-[11px] text-slate-500">
                        {roleLabel(inv.role)} · Sent {timeAgo(inv.createdAt)} · {expired
                          ? <span className="text-red-500 font-semibold">Expired, resend to renew</span>
                          : `expires ${new Date(inv.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 pl-12 sm:pl-0">
                    <button onClick={(e) => invite(e, { email: inv.email, role: inv.role })} disabled={busy === inv.email}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                      <Icon name="refresh" className="w-3.5 h-3.5" /> Resend
                    </button>
                    <button onClick={() => cancelInvite(inv)} disabled={busy === inv.id}
                      className="rounded-lg border border-red-100 px-2.5 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 disabled:opacity-50">Cancel</button>
                  </div>
                </li>
              );
            })}
          </ul>
        </SettingsCard>
      )}

      {/* Members */}
      <SettingsCard title={`Members (${data.members.length})`} icon="group">
        {data.members.length > 5 && (
          <div className="relative mb-3">
            <Icon name="search" className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search members…" className={cn(sInput, "pl-10")} />
          </div>
        )}
        <ul className="-my-2 divide-y divide-slate-100">
          {members.map((m) => {
            const self = m.user.id === me.userId;
            return (
              <li key={m.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className="w-9 h-9 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 text-white text-xs font-bold flex items-center justify-center shrink-0">{getInitials(m.user.name ?? m.user.email)}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{m.user.name ?? "—"} {self && <span className="ml-1 text-[10px] font-bold text-green-600">YOU</span>}</p>
                    <p className="text-[11px] text-slate-500 truncate">{m.user.email} · joined {timeAgo(m.joinedAt ?? m.createdAt)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 pl-12 sm:pl-0">
                  {me.isAdmin && !self ? (
                    <select value={m.role} onChange={(e) => changeRole(m, e.target.value)} disabled={busy === m.id} aria-label={`Role for ${m.user.email}`}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-500/40">
                      {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  ) : (
                    <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", m.role === "ADMIN" ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-600")}>{roleLabel(m.role)}</span>
                  )}
                  {me.isAdmin && !self && (
                    <button onClick={() => setRemoving(m)} aria-label={`Remove ${m.user.email}`} title="Remove from team"
                      className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-red-100 text-red-500 hover:bg-red-50">
                      <Icon name="person_remove" className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
          {members.length === 0 && <li className="py-6 text-center text-sm text-slate-400">No members match “{search}”.</li>}
        </ul>
      </SettingsCard>

      {removing && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label="Remove member">
          <div className="absolute inset-0 bg-slate-950/50 admin-fade" onClick={() => setRemoving(null)} />
          <div className="relative w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl admin-pop space-y-4">
            <div className="flex items-start gap-3">
              <span className="w-10 h-10 rounded-xl bg-red-50 text-red-500 flex items-center justify-center shrink-0"><Icon name="person_remove" className="w-5 h-5" /></span>
              <div>
                <h3 className="text-base font-bold text-slate-900">Remove {removing.user.name ?? removing.user.email}?</h3>
                <p className="mt-1 text-sm text-slate-600">They lose access to this workspace immediately. Their open conversations become unassigned. Their account itself is not deleted.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <SButton variant="secondary" className="flex-1" onClick={() => setRemoving(null)}>Cancel</SButton>
              <SButton variant="danger" className="flex-1" loading={busy === removing.id} onClick={remove}>Remove</SButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
