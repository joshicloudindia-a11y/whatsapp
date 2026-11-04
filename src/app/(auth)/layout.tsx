import { AuthHeroDesktop, AuthHeroMobile } from "./auth-hero";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col lg:flex-row bg-slate-50">
      <AuthHeroDesktop />
      <AuthHeroMobile />

      {/* Form column: overlaps the photo banner on mobile, centred on desktop */}
      <main className="flex-1 flex flex-col relative z-10 -mt-8 sm:-mt-10 lg:mt-0">
        <div className="flex-1 flex items-start lg:items-center justify-center px-4 sm:px-6 lg:px-10 py-0 lg:py-12">
          <div className="w-full max-w-md auth-card">{children}</div>
        </div>
        <p className="lg:hidden text-center text-xs text-slate-400 py-6">
          © {new Date().getFullYear()} ChatFlow. Built on the WhatsApp Business API.
        </p>
      </main>
    </div>
  );
}
