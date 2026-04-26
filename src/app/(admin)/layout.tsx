import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChartPie,
  faBuilding,
  faUsers,
  faCreditCard,
  faArrowLeft,
} from "@fortawesome/free-solid-svg-icons";

const NAV = [
  { href: "/admin",               label: "Overview",        icon: faChartPie },
  { href: "/admin/organizations", label: "Organizations",   icon: faBuilding },
  { href: "/admin/users",         label: "Users",           icon: faUsers },
  { href: "/admin/plans",         label: "Plans & Pricing", icon: faCreditCard },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isSuperAdmin: true },
  });

  if (!dbUser?.isSuperAdmin) redirect("/dashboard");

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950">
      {/* Sidebar */}
      <aside className="w-60 flex flex-col shrink-0 border-r border-slate-800 bg-slate-900">
        {/* Brand */}
        <div className="h-16 flex items-center gap-3 px-5 border-b border-slate-800">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#25D366" }}>
            <svg viewBox="0 0 24 24" fill="white" className="w-4 h-4">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
          </div>
          <div>
            <p className="text-white text-sm font-bold leading-none">ChatFlow</p>
            <p className="text-xs font-semibold mt-0.5" style={{ color: "#25D366" }}>Super Admin</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors group"
            >
              <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-slate-800 group-hover:bg-slate-700 transition-colors shrink-0">
                <FontAwesomeIcon icon={item.icon} className="w-3.5 h-3.5" />
              </div>
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-slate-800 space-y-1">
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition-colors font-medium"
          >
            <FontAwesomeIcon icon={faArrowLeft} className="w-3 h-3 shrink-0" />
            Back to Dashboard
          </Link>
          <div className="px-3 py-2">
            <p className="text-xs text-slate-500 truncate">{session.user.email}</p>
          </div>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-auto bg-slate-50">
        {children}
      </main>
    </div>
  );
}
