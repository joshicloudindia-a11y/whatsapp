import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAdminContext } from "@/lib/admin-auth";
import { ADMIN_SESSION_MAX_AGE_MS } from "@/lib/rbac";
import AdminShell from "./AdminShell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Super Admin · ChatFlow",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const result = await getAdminContext();
  if (!result.ok) {
    redirect(`/admin/login?reason=${result.reason}`);
  }

  const session = await getServerSession(authOptions);
  // Server Component: rendered once per request, so reading the clock here is intended.
  // eslint-disable-next-line react-hooks/purity
  const expiresAt = (session?.user.adminAuthAt ?? Date.now()) + ADMIN_SESSION_MAX_AGE_MS;
  const { ctx } = result;

  return (
    <AdminShell user={{ id: ctx.userId, email: ctx.email, name: ctx.name, role: ctx.role }} expiresAt={expiresAt}>
      {children}
    </AdminShell>
  );
}
