"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";

const ROLES = ["ADMIN", "AGENT", "CAMPAIGN_MANAGER", "TEMPLATE_MANAGER", "AUTOMATION_MANAGER", "BILLING_MANAGER"];

export default function AdminUsersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editUser, setEditUser] = useState<any | null>(null);
  const [roleValue, setRoleValue] = useState("");
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users", search],
    queryFn: () => axios.get(`/api/admin/users?search=${search}&limit=50`).then((r) => r.data),
  });

  const users = data?.users ?? [];

  const toggleSuperAdmin = async (user: any) => {
    const newVal = !user.isSuperAdmin;
    if (!confirm(`${newVal ? "Grant" : "Revoke"} super admin for ${user.email}?`)) return;
    try {
      await axios.patch(`/api/admin/users/${user.id}`, { isSuperAdmin: newVal });
      toast.success(`Super admin ${newVal ? "granted" : "revoked"}`);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    } catch {
      toast.error("Failed");
    }
  };

  const toggleActive = async (user: any) => {
    try {
      await axios.patch(`/api/admin/users/${user.id}`, { isActive: !user.isActive });
      toast.success(user.isActive ? "User suspended" : "User activated");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    } catch {
      toast.error("Failed");
    }
  };

  const openRoleEdit = (user: any) => {
    setEditUser(user);
    setRoleValue(user.memberships?.[0]?.role ?? "AGENT");
  };

  const saveRole = async () => {
    if (!editUser) return;
    const orgId = editUser.memberships?.[0]?.organization?.id;
    if (!orgId) { toast.error("User has no organization"); return; }
    setSaving(true);
    try {
      await axios.patch(`/api/admin/users/${editUser.id}`, { role: roleValue, organizationId: orgId });
      toast.success("Role updated");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setEditUser(null);
    } catch {
      toast.error("Failed to update role");
    } finally {
      setSaving(false);
    }
  };

  const deleteUser = async (user: any) => {
    if (!confirm(`Permanently delete ${user.email}?`)) return;
    try {
      await axios.delete(`/api/admin/users/${user.id}`);
      toast.success("User deleted");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? "Failed");
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Users</h1>
          <p className="text-slate-500 text-sm mt-1">Manage all platform users and their roles</p>
        </div>
        <div className="text-sm text-slate-500">{data?.total ?? 0} total</div>
      </div>

      <input
        type="text"
        placeholder="Search by name or email..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-sm px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
      />

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">User</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Organization</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Role</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Super Admin</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Joined</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading ? (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-slate-400 text-sm">Loading...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-slate-400 text-sm">No users found</td></tr>
            ) : users.map((user: any) => {
              const membership = user.memberships?.[0];
              return (
                <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="text-sm font-semibold text-slate-900">{user.name ?? "—"}</p>
                    <p className="text-xs text-slate-400">{user.email}</p>
                  </td>
                  <td className="px-5 py-3.5">
                    {membership ? (
                      <>
                        <p className="text-sm text-slate-700">{membership.organization?.name}</p>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{membership.organization?.plan}</span>
                      </>
                    ) : (
                      <span className="text-xs text-slate-400">No org</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-blue-50 text-blue-600">
                      {membership?.role ?? "—"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${user.isActive ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"}`}>
                      {user.isActive ? "Active" : "Suspended"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <button
                      onClick={() => toggleSuperAdmin(user)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${user.isSuperAdmin ? "bg-green-500" : "bg-slate-200"}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${user.isSuperAdmin ? "translate-x-4.5" : "translate-x-0.5"}`} />
                    </button>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-400">{new Date(user.createdAt).toLocaleDateString()}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openRoleEdit(user)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 font-medium"
                      >
                        Role
                      </button>
                      <button
                        onClick={() => toggleActive(user)}
                        className={`text-xs px-3 py-1.5 rounded-lg border font-medium ${user.isActive ? "border-orange-100 text-orange-500 hover:bg-orange-50" : "border-green-100 text-green-600 hover:bg-green-50"}`}
                      >
                        {user.isActive ? "Suspend" : "Activate"}
                      </button>
                      <button
                        onClick={() => deleteUser(user)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-red-100 text-red-500 hover:bg-red-50 font-medium"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Role Edit Modal */}
      {editUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-5">
            <div>
              <h3 className="text-base font-bold text-slate-900">Change Role</h3>
              <p className="text-sm text-slate-500 mt-1">{editUser.email}</p>
            </div>
            <div className="space-y-2">
              {ROLES.map((r) => (
                <button
                  key={r}
                  onClick={() => setRoleValue(r)}
                  className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border-2 transition-all text-left"
                  style={{
                    borderColor: roleValue === r ? "#25D366" : "#e2e8f0",
                    background: roleValue === r ? "#25D36610" : "white",
                  }}
                >
                  <span className="text-sm font-medium text-slate-700">{r.replace(/_/g, " ")}</span>
                  {roleValue === r && <span className="text-xs text-green-600">✓</span>}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setEditUser(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600">Cancel</button>
              <button onClick={saveRole} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60" style={{ background: "#25D366" }}>
                {saving ? "Saving..." : "Save Role"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
