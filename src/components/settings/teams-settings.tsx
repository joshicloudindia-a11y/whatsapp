"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";
import { cn, getInitials } from "@/lib/utils";
import { SButton, SettingsCard, SettingsHeader, sInput, settingsError } from "./ui";

interface OrgUser { id: string; name: string | null; email: string; avatar: string | null }
interface OrgMember { id: string; role: string; user: OrgUser }
interface TeamRow {
  id: string; name: string; description: string | null; createdAt: string;
  members: { id: string; memberId: string; member: OrgMember }[];
  _count: { conversations: number };
}
interface TeamsData { teams: TeamRow[]; members: OrgMember[]; me: { userId: string; isAdmin: boolean } }

const SUGGESTED = ["Sales", "Support", "Billing"];
const label = (u: OrgUser) => u.name || u.email;

export function TeamsSettings() {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["teams"],
    queryFn: () => axios.get("/api/settings/teams").then((r) => r.data as TeamsData),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["teams"] });

  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string; description: string } | null>(null);
  const [deleting, setDeleting] = useState<TeamRow | null>(null);
  const [adding, setAdding] = useState<string | null>(null); // team id whose "add member" picker is open

  const create = async (e: React.FormEvent, preset?: string) => {
    e.preventDefault();
    const name = (preset ?? newName).trim();
    if (name.length < 2) { toast.error("Team name must be at least 2 characters"); return; }
    setCreating(true);
    try {
      await axios.post("/api/settings/teams", { name, description: preset ? "" : newDesc });
      toast.success(`Team "${name}" created`);
      if (!preset) { setNewName(""); setNewDesc(""); }
      refresh();
    } catch (err) { toast.error(settingsError(err)); }
    finally { setCreating(false); }
  };

  const saveEdit = async () => {
    if (!editing) return;
    setBusy(editing.id);
    try {
      await axios.patch(`/api/settings/teams/${editing.id}`, { name: editing.name, description: editing.description });
      toast.success("Team updated");
      setEditing(null);
      refresh();
    } catch (err) { toast.error(settingsError(err)); }
    finally { setBusy(null); }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(deleting.id);
    try {
      await axios.delete(`/api/settings/teams/${deleting.id}`);
      toast.success(`Team "${deleting.name}" deleted`);
      setDeleting(null);
      refresh();
    } catch (err) { toast.error(settingsError(err)); }
    finally { setBusy(null); }
  };

  const addMember = async (team: TeamRow, memberId: string) => {
    if (!memberId) return;
    setBusy(`${team.id}:${memberId}`);
    try {
      await axios.post(`/api/settings/teams/${team.id}/members`, { memberIds: [memberId] });
      setAdding(null);
      refresh();
    } catch (err) { toast.error(settingsError(err)); }
    finally { setBusy(null); }
  };

  const removeMember = async (team: TeamRow, memberId: string) => {
    setBusy(`${team.id}:${memberId}`);
    try {
      await axios.delete(`/api/settings/teams/${team.id}/members`, { params: { memberId } });
      refresh();
    } catch (err) { toast.error(settingsError(err)); }
    finally { setBusy(null); }
  };

  if (isError) {
    return (
      <div className="max-w-4xl">
        <SettingsCard><p className="text-sm text-red-600">Couldn&apos;t load teams. Please refresh the page.</p></SettingsCard>
      </div>
    );
  }
  if (isLoading || !data) {
    return <div className="max-w-4xl space-y-4">{[0, 1].map((i) => <div key={i} className="h-40 rounded-2xl bg-white border border-slate-200 animate-pulse" />)}</div>;
  }

  const { teams, members, me } = data;
  const existing = new Set(teams.map((t) => t.name.toLowerCase()));
  const suggestions = SUGGESTED.filter((s) => !existing.has(s.toLowerCase()));

  return (
    <div className="max-w-4xl space-y-5">
      <SettingsHeader title="Teams" description="Group teammates (e.g. Sales, Support) and route inbox conversations to a team." />

      {me.isAdmin ? (
        <form onSubmit={(e) => create(e)}>
          <SettingsCard title="Create a team" description="Add members after creating it." icon="group">
            <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={60} placeholder="Team name, e.g. Sales" className={sInput} aria-label="Team name" />
              <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} maxLength={200} placeholder="Description (optional)" className={sInput} aria-label="Team description" />
              <SButton type="submit" loading={creating}><Icon name="add" className="w-4 h-4" /> Create</SButton>
            </div>
            {suggestions.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-slate-500">Quick add:</span>
                {suggestions.map((s) => (
                  <button key={s} type="button" disabled={creating} onClick={(e) => create(e, s)}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-green-300 hover:bg-green-50 hover:text-green-700 disabled:opacity-50">
                    <Icon name="add" className="w-3.5 h-3.5" /> {s}
                  </button>
                ))}
              </div>
            )}
          </SettingsCard>
        </form>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
          <Icon name="lock" className="w-4 h-4 text-slate-400" /> Only organization admins can create or change teams.
        </div>
      )}

      {teams.length === 0 ? (
        <SettingsCard>
          <div className="py-8 text-center">
            <span className="mx-auto w-12 h-12 rounded-2xl bg-green-50 text-green-600 flex items-center justify-center"><Icon name="group" className="w-6 h-6" /></span>
            <p className="mt-3 text-sm font-semibold text-slate-800">No teams yet</p>
            <p className="mt-1 text-xs text-slate-500">Create teams like Sales or Support to route conversations to the right people.</p>
          </div>
        </SettingsCard>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {teams.map((team) => {
            const inTeam = new Set(team.members.map((m) => m.memberId));
            const available = members.filter((m) => !inTeam.has(m.id));
            const isEditing = editing?.id === team.id;
            return (
              <section key={team.id} className="rounded-2xl border border-slate-200/80 bg-white shadow-sm flex flex-col">
                <div className="flex items-start gap-3 p-4 sm:p-5 pb-3">
                  <span className="w-10 h-10 rounded-xl bg-green-50 text-green-600 flex items-center justify-center shrink-0"><Icon name="group" className="w-5 h-5" /></span>
                  {isEditing ? (
                    <div className="flex-1 min-w-0 space-y-2">
                      <input autoFocus value={editing.name} maxLength={60} onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                        onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditing(null); }}
                        className={sInput} aria-label="Team name" />
                      <input value={editing.description} maxLength={200} onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                        placeholder="Description (optional)" className={sInput} aria-label="Team description" />
                      <div className="flex gap-2">
                        <SButton type="button" className="px-3 py-1.5 text-xs" loading={busy === team.id} onClick={saveEdit}><Icon name="check" className="w-4 h-4" /> Save</SButton>
                        <SButton type="button" variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => setEditing(null)}>Cancel</SButton>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-bold text-slate-900 truncate">{team.name}</h3>
                      {team.description && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{team.description}</p>}
                      <p className="mt-1 text-[11px] text-slate-400">
                        {team.members.length} member{team.members.length === 1 ? "" : "s"} · {team._count.conversations} conversation{team._count.conversations === 1 ? "" : "s"}
                      </p>
                    </div>
                  )}
                  {me.isAdmin && !isEditing && (
                    <div className="flex gap-1 shrink-0">
                      <button type="button" title="Rename" aria-label={`Rename ${team.name}`}
                        onClick={() => setEditing({ id: team.id, name: team.name, description: team.description ?? "" })}
                        className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100">
                        <Icon name="edit" className="w-4 h-4" />
                      </button>
                      <button type="button" title="Delete" aria-label={`Delete ${team.name}`} onClick={() => setDeleting(team)}
                        className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50">
                        <Icon name="delete" className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="px-4 sm:px-5 pb-4 sm:pb-5 mt-auto">
                  <div className="flex flex-wrap gap-1.5">
                    {team.members.map((tm) => {
                      const b = busy === `${team.id}:${tm.memberId}`;
                      return (
                        <span key={tm.id} className={cn("inline-flex items-center gap-1.5 rounded-full bg-slate-100 pl-1 pr-2 py-1 text-xs text-slate-700 max-w-full", b && "opacity-50")}>
                          <span className="w-5 h-5 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                            {getInitials(tm.member.user.name ?? tm.member.user.email)}
                          </span>
                          <span className="truncate" title={tm.member.user.email}>{label(tm.member.user)}</span>
                          {me.isAdmin && (
                            <button type="button" disabled={b} onClick={() => removeMember(team, tm.memberId)} aria-label={`Remove ${label(tm.member.user)} from ${team.name}`}
                              className="ml-0.5 w-4 h-4 inline-flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700">
                              <Icon name="close" className="w-3 h-3" />
                            </button>
                          )}
                        </span>
                      );
                    })}
                    {team.members.length === 0 && <span className="text-xs text-slate-400">No members yet.</span>}
                  </div>

                  {me.isAdmin && (
                    adding === team.id ? (
                      <div className="mt-3 flex gap-2">
                        <select autoFocus defaultValue="" disabled={!!busy?.startsWith(`${team.id}:`)}
                          onChange={(e) => addMember(team, e.target.value)} className={cn(sInput, "py-2")} aria-label={`Add member to ${team.name}`}>
                          <option value="" disabled>{available.length ? "Choose a teammate…" : "Everyone is already in this team"}</option>
                          {available.map((m) => <option key={m.id} value={m.id}>{label(m.user)}{m.user.name ? ` (${m.user.email})` : ""}</option>)}
                        </select>
                        <SButton type="button" variant="secondary" className="px-3 py-2" onClick={() => setAdding(null)} aria-label="Close">
                          <Icon name="close" className="w-4 h-4" />
                        </SButton>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setAdding(team.id)} disabled={available.length === 0}
                        className="mt-3 inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-green-400 hover:text-green-700 disabled:opacity-50 disabled:hover:border-slate-300 disabled:hover:text-slate-600">
                        <Icon name="person_add" className="w-3.5 h-3.5" /> {available.length ? "Add member" : "All members added"}
                      </button>
                    )
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {deleting && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label="Delete team">
          <div className="absolute inset-0 bg-slate-950/50 admin-fade" onClick={() => setDeleting(null)} />
          <div className="relative w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl admin-pop space-y-4">
            <div className="flex items-start gap-3">
              <span className="w-10 h-10 rounded-xl bg-red-50 text-red-500 flex items-center justify-center shrink-0"><Icon name="delete" className="w-5 h-5" /></span>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete &ldquo;{deleting.name}&rdquo;?</h3>
                <p className="mt-1 text-sm text-slate-600">
                  {deleting._count.conversations > 0
                    ? `${deleting._count.conversations} conversation${deleting._count.conversations === 1 ? "" : "s"} routed to this team will no longer have a team. `
                    : ""}
                  Members stay in your organization. This can&apos;t be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <SButton variant="secondary" className="flex-1" onClick={() => setDeleting(null)}>Cancel</SButton>
              <SButton variant="danger" className="flex-1" loading={busy === deleting.id} onClick={remove}>Delete team</SButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

