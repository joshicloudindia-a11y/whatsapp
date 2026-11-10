import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Sidebar, MobileNav } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import UpgradeRequired from "@/components/billing/UpgradeRequired";
import { ImpersonationBanner } from "@/components/admin/impersonation-banner";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const imp = session.user.impersonator;
  const banner = imp ? (
    <ImpersonationBanner
      userLabel={session.user.name || session.user.email || "user"}
      adminLabel={imp.name || imp.email}
      expiresAt={imp.expiresAt}
    />
  ) : null;

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
      <>
        {banner && <div className="sticky top-0 z-50">{banner}</div>}
        <UpgradeRequired
          orgName={org?.name ?? "Your Organization"}
          userName={session.user.name ?? session.user.email ?? "there"}
          isAdmin={session.user.role === "ADMIN"}
        />
      </>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-50">
      {banner}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Header />
          {/* Bottom padding keeps content clear of the phone bottom nav */}
          <main className="flex-1 overflow-auto pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">{children}</main>
        </div>
      </div>
      <MobileNav />
    </div>
  );
}
