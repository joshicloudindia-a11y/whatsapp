"use client";

import axios from "axios";
import { signIn } from "next-auth/react";

/** Super Admin → sign in as `userId` (replaces the current session until they exit). */
export async function startImpersonation(userId: string) {
  const { data } = await axios.post(`/api/admin/users/${userId}/impersonate`);
  const res = await signIn("impersonate", { ticket: data.ticket, redirect: false });
  if (!res?.ok || res.error) throw new Error("Could not sign in as this user");
  window.location.assign("/dashboard");
}

/** Leaves "Login as user" and restores the Super Admin's own admin session. */
export async function exitImpersonation(returnTo = "/admin/users") {
  try {
    const { data } = await axios.post("/api/admin-auth/impersonation/exit");
    const res = await signIn("impersonate-return", { ticket: data.ticket, redirect: false });
    if (res?.ok && !res.error) {
      window.location.assign(returnTo);
      return;
    }
  } catch {
    /* fall through: admin session expired or was revoked */
  }
  window.location.assign("/admin/login?reason=expired");
}
