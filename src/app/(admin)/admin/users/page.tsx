"use client";

import { Icon } from "@/components/ui/icon";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";
import { useAdmin } from "@/components/admin/admin-context";
import {
  Page, PageHeader, Card, Button, IconButton, Badge, RoleBadge, Avatar, Field, inputCls, SearchInput,
  FilterTabs, EmptyState, SkeletonRows, Pagination, Modal, ConfirmDialog, apiError, useDebounced, cx,
} from "@/components/admin/ui";
import {
  type AdminRoleInfo,
} from "@/lib/rbac";

const MEMBER_ROLES = ["ADMIN", "AGENT", "CAMPAIGN_MANAGER", "TEMPLATE_MANAGER", "AUTOMATION_MANAGER", "BILLING_MANAGER"];
type Filter = "all" | "admins" | "suspended" | "locked";
const LIMIT = 20;

interface UserRow {
  id: string; name: string | null; email: string; isActive: boolean; isSuperAdmin: boolean;
  adminRoleInfo: AdminRoleInfo | null; lockedUntil: string | null; lastLoginAt: string | null; lastLoginIp: string | null; createdAt: string;
  memberships: { role: string; organization: { id: string; name: string; plan: string } }[];
}

function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const arr = new Uint32Array(16);
  crypto.getRandomValues(arr);
  let pw = Array.from(arr, (n) => chars[n % chars.length]).join("");
  if (!/[A-Z]/.test(pw)) pw = "A" + pw.slice(1);
  if (!/[a-z]/.test(pw)) pw = pw.slice(0, 1) + "a" + pw.slice(2);
  if (!/\d/.test(pw)) pw = pw.slice(0, 2) + "7" + pw.slice(3);
  return pw;
}

function PasswordInput({ value, onChange, required }: { value: string; onChange: (v: string) => void; required?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <input
          type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)}
          className={cx(inputCls, "pr-10 font-mono")} required={required} minLength={10} autoComplete="new-password"
          placeholder="Min 10 chars, Aa + number"
        />
        <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
          <Icon name={show ? "visibility_off" : "visibility"} className="w-3.5 h-3.5" />
        </button>
      </div>
      <Button type="button" variant="secondary" icon={"casino"} onClick={() => { onChange(generatePassword()); setShow(true); }} className="px-3" title="Generate strong password">
        <span className="hidden sm:inline">Generate</span>
      </Button>
    </div>
  );
}

interface RoleOption extends AdminRoleInfo { description: string | null; memberCount: number }

/** Lists DB roles; roles at/above the current admin's level are disabled (server enforces too). */
function RolePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { user: me } = useAdmin();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-roles"],
    queryFn: () => axios.get("/api/admin/roles").then((r) => r.data.roles as RoleOption[]),
  });
  const isSuper = me.role.key === "SUPER_ADMIN";
  const options: (RoleOption | null)[] = [null, ...(data ?? [])];
  if (isLoading) return <div className="h-24 rounded-xl bg-slate-100 animate-pulse" />;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((r) => {
        const id = r?.id ?? "";
        const selected = value === id;
        const allowed = !r || isSuper || r.level < me.role.level;
        return (
          <button type="button" key={id || "none"} onClick={() => allowed && onChange(id)} disabled={!allowed}
            className={cx("flex items-start gap-3 rounded-xl border-2 px-3.5 py-2.5 text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
              selected ? "border-green-500 bg-green-50/60" : "border-slate-200 hover:border-slate-300")}>
            <span className={cx("mt-0.5 w-4 h-4 rounded-full border-2 shrink-0", selected ? "border-green-500 bg-green-500 ring-2 ring-white ring-inset" : "border-slate-300")} />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                {r && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: r.color }} />}
                {r ? r.name : "No admin access"}
              </span>
              <span className="block text-xs text-slate-500">
                {r ? `${r.permissions.length} permissions · level ${r.level}${r.description ? ` · ${r.description}` : ""}` : "Regular platform user (cannot open the admin panel)"}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function AdminUsersPage() {
  const qc = useQueryClient();
  const { user: me, can } = useAdmin();
  const params = useSearchParams();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>((params.get("filter") as Filter) || "all");
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search);
  const roleId = params.get("roleId");

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [deleting, setDeleting] = useState<UserRow | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users", debounced, filter, page, roleId],
    queryFn: () =>
      axios.get("/api/admin/users", { params: { search: debounced, filter, page, limit: LIMIT, ...(roleId && { roleId }) } }).then((r) => r.data),
    placeholderData: (prev) => prev,
  });
  const users: UserRow[] = data?.users ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-users"] });

  /** UI mirror of the server's hierarchy rule (server is the source of truth). */
  const canManage = (u: UserRow) => {
    if (u.id === me.id) return true;
    if (me.role.key === "SUPER_ADMIN") return true;
    const r = u.adminRoleInfo;
    return !r || me.role.level > r.level;
  };

  const patch = async (u: UserRow, body: Record<string, unknown>, msg: string) => {
    try {
      await axios.patch(`/api/admin/users/${u.id}`, body);
      toast.success(msg);
      refresh();
      return true;
    } catch (e) {
      toast.error(apiError(e));
      return false;
    }
  };

  const doDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await axios.delete(`/api/admin/users/${deleting.id}`);
      toast.success("User deleted");
      setDeleting(null);
      refresh();
    } catch (e) { toast.error(apiError(e)); }
    finally { setBusy(false); }
  };

  const isLocked = (u: UserRow) => !!u.lockedUntil && new Date(u.lockedUntil) > new Date();

  const StatusBadge = ({ u }: { u: UserRow }) =>
    isLocked(u) ? <Badge tone="amber" dot>Locked</Badge>
    : u.isActive ? <Badge tone="green" dot>Active</Badge>
    : <Badge tone="red" dot>Suspended</Badge>;

  const Actions = ({ u }: { u: UserRow }) => {
    const manageable = canManage(u);
    const self = u.id === me.id;
    return (
      <div className="flex items-center gap-1.5">
        {(can("users:write") || can("admins:manage") || can("users:password") || can("users:sessions")) && <IconButton icon={"edit"} label="Edit user" disabled={!manageable} onClick={() => setEditing(u)} />}
        {can("users:sessions") && isLocked(u) && (
          <IconButton icon={"lock_open"} label="Unlock account" tone="success" disabled={!manageable} onClick={() => patch(u, { unlock: true }, "Account unlocked")} />
        )}
        {can("users:suspend") && !self && (
          <IconButton
            icon={u.isActive ? "block" : "check_circle"} label={u.isActive ? "Suspend" : "Activate"}
            tone={u.isActive ? "warn" : "success"} disabled={!manageable}
            onClick={() => patch(u, { isActive: !u.isActive }, u.isActive ? "User suspended" : "User activated")}
          />
        )}
        {can("users:delete") && !self && (
          <IconButton icon={"delete"} label="Delete user" tone="danger" disabled={!manageable} onClick={() => setDeleting(u)} />
        )}
      </div>
    );
  };

  return (
    <Page>
      <PageHeader
        title="Users & Staff"
        description="Manage platform users, admin staff roles and account security"
        actions={can("users:create") && <Button icon={"person_add"} onClick={() => setCreateOpen(true)}>New user</Button>}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search name or email…" />
        <FilterTabs<Filter>
          value={filter}
          onChange={(v) => { setFilter(v); setPage(1); }}
          options={[
            { value: "all", label: "All" }, { value: "admins", label: "Admin staff" },
            { value: "suspended", label: "Suspended" }, { value: "locked", label: "Locked" },
          ]}
        />
      </div>

      <Card className="overflow-hidden">
        {isLoading ? <SkeletonRows /> : users.length === 0 ? (
          <EmptyState icon={"group"} title="No users found" description="Try a different search or filter." />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/80 text-[11px] uppercase tracking-wider text-slate-500">
                  <tr>
                    {["User", "Organization", "Admin role", "Status", "Last admin login", ""].map((h) => (
                      <th key={h} className="text-left font-semibold px-5 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((u) => {
                    const m = u.memberships?.[0];
                    return (
                      <tr key={u.id} className="hover:bg-slate-50/60">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <Avatar name={u.name ?? u.email} />
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900 truncate">
                                {u.name ?? "—"} {u.id === me.id && <span className="text-[10px] font-bold text-green-600 ml-1">YOU</span>}
                              </p>
                              <p className="text-xs text-slate-400 truncate">{u.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          {m ? (
                            <div>
                              <p className="text-slate-700 truncate max-w-[180px]">{m.organization.name}</p>
                              <p className="text-[11px] text-slate-400">{m.role.replace(/_/g, " ")}</p>
                            </div>
                          ) : <span className="text-xs text-slate-400">No organization</span>}
                        </td>
                        <td className="px-5 py-3.5"><RoleBadge role={u.adminRoleInfo} /></td>
                        <td className="px-5 py-3.5"><StatusBadge u={u} /></td>
                        <td className="px-5 py-3.5 text-xs text-slate-500">
                          {u.lastLoginAt ? (
                            <>
                              <p>{new Date(u.lastLoginAt).toLocaleString()}</p>
                              {u.lastLoginIp && <p className="text-slate-400 font-mono">{u.lastLoginIp}</p>}
                            </>
                          ) : "—"}
                        </td>
                        <td className="px-5 py-3.5"><div className="flex justify-end"><Actions u={u} /></div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="md:hidden divide-y divide-slate-100">
              {users.map((u) => {
                const m = u.memberships?.[0];
                return (
                  <li key={u.id} className="p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <Avatar name={u.name ?? u.email} />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900 text-sm truncate">
                          {u.name ?? "—"} {u.id === me.id && <span className="text-[10px] font-bold text-green-600 ml-1">YOU</span>}
                        </p>
                        <p className="text-xs text-slate-400 truncate">{u.email}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <StatusBadge u={u} />
                          {u.adminRoleInfo && <RoleBadge role={u.adminRoleInfo} />}
                          {m && <Badge>{m.organization.name}</Badge>}
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end"><Actions u={u} /></div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <Pagination page={page} limit={LIMIT} total={data?.total ?? 0} onChange={setPage} />
      </Card>

      <CreateUserModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={refresh} canAssignAdmin={can("admins:manage")} />

      {editing && (
        <EditUserModal
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { refresh(); setEditing(null); }}
          isSelf={editing.id === me.id}
          canAssignAdmin={can("admins:manage")}
          canResetPassword={can("users:password")}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={doDelete}
        loading={busy}
        title="Delete user permanently?"
        confirmLabel="Delete user"
        confirmText={deleting?.adminRoleInfo ? deleting.email : undefined}
        message={<>This will permanently delete <b>{deleting?.email}</b> and their memberships. This cannot be undone.</>}
      />
    </Page>
  );
}

function CreateUserModal({ open, onClose, onCreated, canAssignAdmin }: { open: boolean; onClose: () => void; onCreated: () => void; canAssignAdmin: boolean }) {
  const empty = { name: "", email: "", password: "", organizationId: "", memberRole: "AGENT", adminRoleId: "" };
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof empty>(k: K, v: (typeof empty)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const { data: orgs } = useQuery({
    queryKey: ["admin-org-options"],
    queryFn: () => axios.get("/api/admin/organizations", { params: { limit: 100 } }).then((r) => r.data.organizations as { id: string; name: string }[]),
    enabled: open,
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.post("/api/admin/users", {
        ...form,
        organizationId: form.organizationId || null,
        adminRoleId: form.adminRoleId || null,
      });
      toast.success("User created");
      setForm(empty);
      onCreated();
      onClose();
    } catch (e) { toast.error(apiError(e)); }
    finally { setSaving(false); }
  };

  return (
    <Modal
      open={open} onClose={onClose} title="Create user" description="Add a platform user or admin staff member" icon={"person_add"} size="lg"
      footer={<>
        <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="create-user" className="flex-1" loading={saving}>Create user</Button>
      </>}
    >
      <form id="create-user" onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name"><input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} required maxLength={100} /></Field>
          <Field label="Email"><input type="email" className={inputCls} value={form.email} onChange={(e) => set("email", e.target.value)} required autoComplete="off" /></Field>
        </div>
        <Field label="Password" hint="Share it securely. The user can change it after signing in.">
          <PasswordInput value={form.password} onChange={(v) => set("password", v)} required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Organization (optional)">
            <select className={inputCls} value={form.organizationId} onChange={(e) => set("organizationId", e.target.value)}>
              <option value="">— None —</option>
              {orgs?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </Field>
          <Field label="Organization role">
            <select className={inputCls} value={form.memberRole} onChange={(e) => set("memberRole", e.target.value)} disabled={!form.organizationId}>
              {MEMBER_ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
            </select>
          </Field>
        </div>
        {canAssignAdmin && (
          <Field label="Super admin panel access">
            <RolePicker value={form.adminRoleId} onChange={(v) => set("adminRoleId", v)} />
          </Field>
        )}
      </form>
    </Modal>
  );
}

function EditUserModal({
  user, onClose, onSaved, isSelf, canAssignAdmin, canResetPassword,
}: { user: UserRow; onClose: () => void; onSaved: () => void; isSelf: boolean; canAssignAdmin: boolean; canResetPassword: boolean }) {
  const { can } = useAdmin();
  const membership = user.memberships?.[0];
  const initialRole = user.adminRoleInfo?.id ?? "";
  const [name, setName] = useState(user.name ?? "");
  const [email, setEmail] = useState(user.email);
  const [memberRole, setMemberRole] = useState(membership?.role ?? "AGENT");
  const [orgId, setOrgId] = useState(membership?.organization.id ?? "");
  const { data: orgs } = useQuery({
    queryKey: ["admin-org-options"],
    queryFn: () => axios.get("/api/admin/organizations", { params: { limit: 100 } }).then((r) => r.data.organizations as { id: string; name: string }[]),
  });
  const [adminRole, setAdminRole] = useState<string>(initialRole);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body: Record<string, unknown> = {};
    if (name !== (user.name ?? "")) body.name = name;
    if (email !== user.email) body.email = email;
    if (orgId !== (membership?.organization.id ?? "") || (orgId && memberRole !== membership?.role)) {
      body.organizationId = orgId || null;
      body.memberRole = memberRole;
    }
    if (canAssignAdmin && !isSelf && adminRole !== initialRole) body.adminRoleId = adminRole || null;
    if (canResetPassword && password) body.password = password;
    if (Object.keys(body).length === 0) { onClose(); return; }
    setSaving(true);
    try {
      await axios.patch(`/api/admin/users/${user.id}`, body);
      toast.success("User updated");
      onSaved();
    } catch (e) { toast.error(apiError(e)); }
    finally { setSaving(false); }
  };

  const revoke = async () => {
    try {
      await axios.patch(`/api/admin/users/${user.id}`, { revokeSessions: true });
      toast.success("All admin sessions revoked");
    } catch (e) { toast.error(apiError(e)); }
  };

  return (
    <Modal
      open onClose={onClose} title="Edit user" description={user.email} icon={"edit"} size="lg"
      footer={<>
        <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="edit-user" className="flex-1" loading={saving}>Save changes</Button>
      </>}
    >
      <form id="edit-user" onSubmit={submit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} /></Field>
          <Field label="Email"><input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Organization" hint={membership ? (orgId === membership.organization.id ? "Current organization." : orgId ? "User will be moved to this organization." : "User will be removed from their organization.") : "Add this user to an organization."}>
            <select className={inputCls} value={orgId} onChange={(e) => setOrgId(e.target.value)}>
              <option value="">— No organization —</option>
              {membership && !orgs?.some((o) => o.id === membership.organization.id) && (
                <option value={membership.organization.id}>{membership.organization.name}</option>
              )}
              {orgs?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </Field>
          <Field label="Organization role" hint="Takes effect the next time they sign in.">
            <select className={inputCls} value={memberRole} onChange={(e) => setMemberRole(e.target.value)} disabled={!orgId}>
              {MEMBER_ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
            </select>
          </Field>
        </div>

        {canAssignAdmin && (
          <Field label="Super admin panel access" hint={isSelf ? "You cannot change your own admin role." : "Changing the role signs the user out of the admin panel."}>
            <div className={cx(isSelf && "pointer-events-none opacity-60")}><RolePicker value={adminRole} onChange={setAdminRole} /></div>
          </Field>
        )}

        {canResetPassword && (
          <Field label="Reset password (optional)" hint="Leave empty to keep the current password. Resetting signs the user out of the admin panel.">
            <PasswordInput value={password} onChange={setPassword} />
          </Field>
        )}

        {!isSelf && can("users:sessions") && (
          <div className="rounded-xl border border-slate-200 p-3.5 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <div className="flex items-start gap-3">
              <Icon name={"key"} className="w-3.5 h-3.5 text-slate-400 mt-1" />
              <div>
                <p className="text-sm font-semibold text-slate-800">Force sign-out</p>
                <p className="text-xs text-slate-500">Immediately end all of this user&apos;s admin sessions.</p>
              </div>
            </div>
            <Button type="button" variant="secondary" icon={"logout"} onClick={revoke}>Revoke sessions</Button>
          </div>
        )}
        {user.lockedUntil && new Date(user.lockedUntil) > new Date() && (
          <p className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
            <Icon name={"lock"} className="w-3 h-3" /> Locked until {new Date(user.lockedUntil).toLocaleTimeString()} after repeated failed sign-ins.
          </p>
        )}
      </form>
    </Modal>
  );
}
