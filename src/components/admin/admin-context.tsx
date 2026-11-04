"use client";

import { createContext, useContext, useMemo } from "react";
import { hasPermission, type AdminRoleInfo, type Permission } from "@/lib/rbac";

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: AdminRoleInfo;
}

interface AdminContextValue {
  user: AdminUser;
  /** Epoch ms when the admin session expires. */
  expiresAt: number;
  can: (permission: Permission) => boolean;
}

const Ctx = createContext<AdminContextValue | null>(null);

export function AdminProvider({ user, expiresAt, children }: { user: AdminUser; expiresAt: number; children: React.ReactNode }) {
  const value = useMemo(
    () => ({ user, expiresAt, can: (p: Permission) => hasPermission(user.role, p) }),
    [user, expiresAt]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdmin() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAdmin must be used inside <AdminProvider>");
  return v;
}
