"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";
import { useAdmin } from "@/components/admin/admin-context";
import {
  Page, PageHeader, Card, Button, IconButton, Badge, RoleBadge, Field, inputCls, EmptyState, SkeletonRows, Modal,
  FilterTabs, apiError, cx,
} from "@/components/admin/ui";
import { ALL_PERMISSIONS, PERMISSION_GROUPS, type AdminRoleInfo, type Permission } from "@/lib/rbac";

interface Role extends AdminRoleInfo {
  description: string | null;
  memberCount: number;
  manageable: boolean;
  updatedAt: string;
}
interface RolesResponse { roles: Role[]; me: { roleId: string; level: number; isSuper: boolean } }

const COLORS = ["#7c3aed", "#2563eb", "#0ea5e9", "#0d9488", "#16a34a", "#d97706", "#dc2626", "#db2777", "#64748b", "#0f172a"];

export default function RolesPage() {
  const qc = useQueryClient();
  const { can } = useAdmin();
  const [view, setView] = useState<"roles" | "matrix">("roles");
  const [editing, setEditing] = useState<{ role: Role | null; duplicateOf?: Role } | null>(null);
  const [deleting, setDeleting] = useState<Role | null>(null);

  const { data, isLoading } = useQuery<RolesResponse>({
    queryKey: ["admin-roles-full"],
    queryFn: () => axios.get("/api/admin/roles").then((r) => r.data),
  });
  const roles = data?.roles ?? [];
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-roles-full"] });
    qc.invalidateQueries({ queryKey: ["admin-roles"] });
  };

  const stats = [
    { label: "Roles", value: roles.length, icon: "admin_panel_settings" },
    { label: "Custom roles", value: roles.filter((r) => !r.isSystem).length, icon: "tune" },
    { label: "Admin staff", value: roles.reduce((a, r) => a + r.memberCount, 0), icon: "shield_person" },
    { label: "Permissions", value: ALL_PERMISSIONS.length, icon: "key" },
  ];

  return (
    <Page>
      <PageHeader
        title="Roles & Permissions"
        description="Control exactly what each admin can see and do. Changes apply instantly to every signed-in admin."
        actions={can("roles:manage") && <Button icon="add" onClick={() => setEditing({ role: null })}>New role</Button>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <Card key={s.label} className="p-4 flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-green-50 text-green-600 flex items-center justify-center shrink-0"><Icon name={s.icon} className="w-5 h-5" /></span>
            <div>
              <p className="text-xl font-bold text-slate-900 tabular-nums">{s.value}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </div>
          </Card>
        ))}
      </div>

      <FilterTabs value={view} onChange={setView} options={[{ value: "roles", label: "Roles" }, { value: "matrix", label: "Permission matrix" }]} />

      {isLoading ? <Card><SkeletonRows rows={4} /></Card> : roles.length === 0 ? (
        <Card><EmptyState icon="admin_panel_settings" title="No roles yet" /></Card>
      ) : view === "roles" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {roles.map((r) => (
            <Card key={r.id} className="p-5 flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-white" style={{ background: r.color }}>
                  <Icon name={r.key === "SUPER_ADMIN" ? "workspace_premium" : r.isSystem ? "shield" : "tune"} className="w-5 h-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-bold text-slate-900 truncate">{r.name}</h3>
                    {r.isSystem ? <Badge tone="slate">System</Badge> : <Badge tone="blue">Custom</Badge>}
                    {r.id === data?.me.roleId && <Badge tone="green">Your role</Badge>}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">Level {r.level} · {r.permissions.length} of {ALL_PERMISSIONS.length} permissions</p>
                </div>
              </div>
              {r.description && <p className="text-sm text-slate-600 -mt-1">{r.description}</p>}

              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(r.permissions.length / ALL_PERMISSIONS.length) * 100}%`, background: r.color }} />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {PERMISSION_GROUPS.map((g) => {
                  const n = g.permissions.filter((p) => r.permissions.includes(p.key as Permission)).length;
                  if (!n) return null;
                  return (
                    <span key={g.key} className="inline-flex items-center gap-1 rounded-lg bg-slate-50 border border-slate-100 px-2 py-1 text-[11px] text-slate-600">
                      <Icon name={g.icon} className="w-3 h-3" /> {g.label} <b className="text-slate-800">{n}/{g.permissions.length}</b>
                    </span>
                  );
                })}
              </div>

              <div className="mt-auto flex items-center gap-2 pt-3 border-t border-slate-100">
                <Link href={`/admin/users?roleId=${r.id}`} className="flex-1 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-green-700">
                  <Icon name="group" className="w-4 h-4" /> {r.memberCount} member{r.memberCount === 1 ? "" : "s"}
                </Link>
                {can("roles:manage") ? (
                  <>
                    <IconButton icon={r.manageable ? "edit" : "visibility"} label={r.manageable ? "Edit role" : "View permissions"} onClick={() => setEditing({ role: r })} />
                    <IconButton icon="content_copy" label="Duplicate role" onClick={() => setEditing({ role: null, duplicateOf: r })} />
                    {!r.isSystem && <IconButton icon="delete" label="Delete role" tone="danger" disabled={!r.manageable} onClick={() => setDeleting(r)} />}
                  </>
                ) : (
                  <IconButton icon="visibility" label="View permissions" onClick={() => setEditing({ role: r })} />
                )}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <MatrixView roles={roles} />
      )}

      {editing && (
        <RoleEditor
          role={editing.role}
          duplicateOf={editing.duplicateOf}
          myLevel={data?.me.level ?? 0}
          isSuper={!!data?.me.isSuper}
          onClose={() => setEditing(null)}
          onSaved={() => { refresh(); setEditing(null); }}
        />
      )}
      {deleting && <DeleteRoleDialog role={deleting} roles={roles} onClose={() => setDeleting(null)} onDeleted={() => { refresh(); setDeleting(null); }} />}
    </Page>
  );
}

// ── Read-only comparison of every role × permission ───────────────────────────
function MatrixView({ roles }: { roles: Role[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-slate-50/80 sticky top-0">
            <tr>
              <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 w-64 sticky left-0 bg-slate-50">Permission</th>
              {roles.map((r) => (
                <th key={r.id} className="px-3 py-3 text-center"><RoleBadge role={r} /></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_GROUPS.map((g) => (
              <MatrixGroup key={g.key} group={g} roles={roles} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function MatrixGroup({ group, roles }: { group: (typeof PERMISSION_GROUPS)[number]; roles: Role[] }) {
  return (
    <>
      <tr className="bg-slate-50/50 border-t border-slate-100">
        <td colSpan={roles.length + 1} className="px-4 py-2 text-xs font-bold text-slate-700 sticky left-0">
          <span className="inline-flex items-center gap-1.5"><Icon name={group.icon} className="w-3.5 h-3.5 text-slate-400" /> {group.label}</span>
        </td>
      </tr>
      {group.permissions.map((p) => (
        <tr key={p.key} className="border-t border-slate-50 hover:bg-slate-50/40">
          <td className="px-4 py-2.5 sticky left-0 bg-white">
            <p className="text-[13px] font-medium text-slate-800">{p.label}</p>
            <p className="text-[11px] text-slate-400 font-mono">{p.key}</p>
          </td>
          {roles.map((r) => (
            <td key={r.id} className="px-3 py-2.5 text-center">
              {r.permissions.includes(p.key as Permission)
                ? <Icon name="check_circle" filled className="w-5 h-5" style={{ color: r.color }} />
                : <Icon name="remove" className="w-4 h-4 text-slate-200" />}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ── Create / edit role ───────────────────────────────────────────────────────
function RoleEditor({
  role, duplicateOf, myLevel, isSuper, onClose, onSaved,
}: { role: Role | null; duplicateOf?: Role; myLevel: number; isSuper: boolean; onClose: () => void; onSaved: () => void }) {
  const { user: me, can } = useAdmin();
  const source = role ?? duplicateOf ?? null;
  const readOnly = !!role && (!role.manageable || !can("roles:manage"));
  const isSystem = !!role?.isSystem;
  const maxLevel = isSuper ? 99 : Math.max(1, myLevel - 1);

  const [name, setName] = useState(role ? role.name : duplicateOf ? `${duplicateOf.name} copy` : "");
  const [description, setDescription] = useState(source?.description ?? "");
  const [color, setColor] = useState(source?.color ?? "#0ea5e9");
  const [level, setLevel] = useState(Math.min(source?.level ?? 40, maxLevel));
  const [perms, setPerms] = useState<Set<Permission>>(new Set(source?.permissions ?? ["overview:read"]));
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);

  const held = useMemo(() => new Set(me.role.permissions), [me.role.permissions]);
  const toggle = (p: Permission) => setPerms((s) => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n; });
  const setGroup = (keys: Permission[], on: boolean) => setPerms((s) => {
    const n = new Set(s);
    keys.forEach((k) => { if (held.has(k)) { if (on) n.add(k); else n.delete(k); } });
    return n;
  });

  const q = query.trim().toLowerCase();
  const groups = PERMISSION_GROUPS.map((g) => ({
    ...g,
    permissions: g.permissions.filter((p) => !q || p.label.toLowerCase().includes(q) || p.key.includes(q) || p.description.toLowerCase().includes(q)),
  })).filter((g) => g.permissions.length);

  const save = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { description, color, permissions: [...perms] };
      if (!isSystem) { payload.name = name; payload.level = level; }
      if (role) await axios.patch(`/api/admin/roles/${role.id}`, payload);
      else await axios.post("/api/admin/roles", payload);
      toast.success(role ? "Role updated. Changes apply immediately." : "Role created");
      onSaved();
    } catch (e) { toast.error(apiError(e)); }
    finally { setSaving(false); }
  };

  const title = readOnly ? role!.name : role ? `Edit ${role.name}` : duplicateOf ? `Duplicate ${duplicateOf.name}` : "New role";

  return (
    <Modal
      open onClose={onClose} size="lg" icon="admin_panel_settings" title={title}
      description={readOnly ? (role?.key === "SUPER_ADMIN" ? "Locked: Super Admin always has every permission" : "Read-only: this role is at or above your level") : `${perms.size} of ${ALL_PERMISSIONS.length} permissions selected`}
      footer={readOnly ? <Button variant="secondary" className="flex-1" onClick={onClose}>Close</Button> : (
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" loading={saving} onClick={save} disabled={!isSystem && name.trim().length < 2}>{role ? "Save role" : "Create role"}</Button>
        </>
      )}
    >
      <div className="space-y-5">
        {!readOnly && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Role name" hint={isSystem ? "System role names can't be changed." : undefined}>
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} disabled={isSystem} maxLength={60} placeholder="e.g. Billing Team" />
              </Field>
              <Field label={`Level (1–${maxLevel})`} hint={isSystem ? "System role levels are fixed." : "Higher levels can manage lower ones."}>
                <div className="flex items-center gap-3">
                  <input type="range" min={1} max={maxLevel} value={level} onChange={(e) => setLevel(Number(e.target.value))} disabled={isSystem} className="flex-1 accent-green-500" />
                  <input type="number" min={1} max={maxLevel} value={level} onChange={(e) => setLevel(Math.min(maxLevel, Math.max(1, Number(e.target.value) || 1)))} disabled={isSystem} className={cx(inputCls, "w-20 text-center")} />
                </div>
              </Field>
            </div>
            <Field label="Description">
              <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} placeholder="What is this role for?" />
            </Field>
            <Field label="Colour">
              <div className="flex flex-wrap gap-2">
                {COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setColor(c)} aria-label={`Colour ${c}`}
                    className={cx("w-8 h-8 rounded-full ring-offset-2 transition", color === c ? "ring-2 ring-slate-900" : "hover:scale-110")} style={{ background: c }} />
                ))}
              </div>
            </Field>
          </div>
        )}

        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
            <p className="text-xs font-semibold text-slate-600">Permissions</p>
            <div className="relative sm:w-64">
              <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search permissions…" className={cx(inputCls, "pl-9 py-2")} />
            </div>
          </div>

          {groups.map((g) => {
            const keys = g.permissions.map((p) => p.key as Permission);
            const on = keys.filter((k) => perms.has(k)).length;
            return (
              <div key={g.key} className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-center gap-2 px-3.5 py-2.5 bg-slate-50">
                  <Icon name={g.icon} className="w-4 h-4 text-slate-500" />
                  <p className="flex-1 text-sm font-semibold text-slate-800">{g.label} <span className="text-xs font-normal text-slate-400">{on}/{keys.length}</span></p>
                  {!readOnly && (
                    <button type="button" onClick={() => setGroup(keys, on < keys.length)} className="text-xs font-semibold text-green-600 hover:text-green-700">
                      {on < keys.length ? "Select all" : "Clear"}
                    </button>
                  )}
                </div>
                <ul className="divide-y divide-slate-100">
                  {g.permissions.map((p) => {
                    const key = p.key as Permission;
                    const checked = perms.has(key);
                    const disabled = readOnly || !held.has(key);
                    return (
                      <li key={p.key}>
                        <label className={cx("flex items-start gap-3 px-3.5 py-3", disabled ? "cursor-not-allowed" : "cursor-pointer hover:bg-slate-50/60")}
                          title={!readOnly && !held.has(key) ? "You can't grant a permission you don't have" : undefined}>
                          <input type="checkbox" className="mt-0.5 w-4 h-4 accent-green-500 shrink-0" checked={checked} disabled={disabled} onChange={() => toggle(key)} />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span className={cx("text-sm font-medium", disabled && !checked ? "text-slate-400" : "text-slate-800")}>{p.label}</span>
                              {"danger" in p && p.danger && <Badge tone="red">Sensitive</Badge>}
                              {!readOnly && !held.has(key) && <Badge>Not yours to grant</Badge>}
                            </span>
                            <span className="block text-xs text-slate-500 mt-0.5">{p.description}</span>
                            <span className="block text-[10px] text-slate-400 font-mono mt-0.5">{p.key}</span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
          {groups.length === 0 && <p className="py-6 text-center text-sm text-slate-400">No permissions match “{query}”.</p>}
        </div>
      </div>
    </Modal>
  );
}

// ── Delete with member reassignment ──────────────────────────────────────────
function DeleteRoleDialog({ role, roles, onClose, onDeleted }: { role: Role; roles: Role[]; onClose: () => void; onDeleted: () => void }) {
  const { user: me } = useAdmin();
  const targets = roles.filter((r) => r.id !== role.id && (me.role.key === "SUPER_ADMIN" || r.level < me.role.level));
  const [reassignTo, setReassignTo] = useState(role.memberCount ? (targets.find((t) => t.key === "VIEWER")?.id ?? "none") : "");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  const doDelete = async () => {
    setBusy(true);
    try {
      await axios.delete(`/api/admin/roles/${role.id}`, { params: role.memberCount ? { reassignTo } : {} });
      toast.success("Role deleted");
      onDeleted();
    } catch (e) { toast.error(apiError(e)); }
    finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} size="sm" icon="warning" title={`Delete "${role.name}"?`}
      footer={<>
        <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button variant="danger" className="flex-1" loading={busy} disabled={typed !== role.name} onClick={doDelete}>Delete role</Button>
      </>}>
      <div className="space-y-4 text-sm text-slate-600">
        {role.memberCount > 0 ? (
          <>
            <p><b>{role.memberCount}</b> admin{role.memberCount === 1 ? " has" : "s have"} this role. Move them to:</p>
            <select className={inputCls} value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
              {targets.map((t) => <option key={t.id} value={t.id}>{t.name} (level {t.level})</option>)}
              <option value="none">Remove admin panel access</option>
            </select>
            <p className="text-xs text-slate-500">Moved admins are signed out of the admin panel and must sign in again.</p>
          </>
        ) : <p>No admins currently have this role.</p>}
        <Field label={`Type "${role.name}" to confirm`}>
          <input className={inputCls} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </Field>
      </div>
    </Modal>
  );
}
