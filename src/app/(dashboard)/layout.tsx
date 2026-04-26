import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import UpgradeRequired from "@/components/billing/UpgradeRequired";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const orgId = session.user.organizationId;

  // Check payment status from DB (not JWT — avoids stale data)
  const sub = orgId
    ? await prisma.subscription.findUnique({
        where: { organizationId: orgId },
        select: { stripeSubscriptionId: true, status: true },
      })
    : null;

  const isPaid = !!(sub?.stripeSubscriptionId) || sub?.status === "ACTIVE";

  if (!isPaid) {
    // No sidebar — show upgrade wall
    const org = orgId
      ? await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } })
      : null;

    return (
      <UpgradeRequired
        orgName={org?.name ?? "Your Organization"}
        userName={session.user.name ?? session.user.email ?? "there"}
        isAdmin={session.user.role === "ADMIN"}
      />
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
