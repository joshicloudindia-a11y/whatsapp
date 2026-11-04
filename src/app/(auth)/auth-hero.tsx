"use client";

import { Icon } from "@/components/ui/icon";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface Variant {
  image: string;
  alt: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  objectPosition: string;
}

const VARIANTS: Record<string, Variant> = {
  login: {
    image: "/images/auth/login.jpg",
    alt: "Indian woman in a kurta smiling while replying to messages on her smartphone",
    eyebrow: "Welcome back",
    title: "The smarter way to grow on WhatsApp",
    subtitle: "Manage conversations, automate campaigns and build chatbots — all in one platform.",
    objectPosition: "center 70%",
  },
  register: {
    image: "/images/auth/register.jpg",
    alt: "Indian shop owner working at his store counter in Manali",
    eyebrow: "Start free · No credit card",
    title: "Join 8,000+ businesses selling on WhatsApp",
    subtitle: "Set up your shared inbox, broadcasts and chatbot in minutes.",
    objectPosition: "center 40%",
  },
  recover: {
    image: "/images/auth/recover.jpg",
    alt: "Young Sikh businessman working on his laptop",
    eyebrow: "Account recovery",
    title: "Back to your customers in a minute",
    subtitle: "We'll help you get secure access to your ChatFlow account.",
    objectPosition: "35% center",
  },
};

function variantFor(pathname: string): Variant {
  if (pathname.startsWith("/register") || pathname.startsWith("/accept-invite")) return VARIANTS.register;
  if (pathname.startsWith("/login")) return VARIANTS.login;
  return VARIANTS.recover;
}

export function Logo({ light = true }: { light?: boolean }) {
  return (
    <Link href="/" className="inline-flex items-center gap-2.5">
      <span className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#25D366] shadow-lg shadow-green-500/30">
        <svg viewBox="0 0 24 24" fill="white" className="w-6 h-6" aria-hidden>
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
      </span>
      <span className={`text-xl font-bold ${light ? "text-white" : "text-slate-900"}`}>ChatFlow</span>
    </Link>
  );
}

const STATS = [
  { value: "90%+", label: "Open rate" },
  { value: "3x", label: "Faster replies" },
  { value: "8k+", label: "Businesses" },
];

/** Large photo panel on desktop. */
export function AuthHeroDesktop() {
  const v = variantFor(usePathname());
  return (
    <aside className="hidden lg:flex relative lg:w-[48%] xl:w-1/2 overflow-hidden">
      <Image src={v.image} alt={v.alt} fill priority sizes="50vw" className="object-cover" style={{ objectPosition: v.objectPosition }} />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/35 to-slate-950/10" />
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-slate-950/60 to-transparent" />

      <div className="relative z-10 flex flex-col justify-between w-full p-10 xl:p-14">
        <Logo />

        {/* Floating chat preview */}
        <div className="self-end max-w-[18rem] space-y-2.5 auth-float">
          <div className="rounded-2xl rounded-tl-sm bg-white/95 backdrop-blur px-4 py-3 shadow-2xl">
            <p className="text-[13px] text-slate-800">Namaste! Blue kurta M size mein available hai?</p>
            <p className="text-[10px] text-slate-400 mt-1">Customer · 10:42</p>
          </div>
          <div className="ml-8 rounded-2xl rounded-tr-sm bg-[#d9fdd3] px-4 py-3 shadow-2xl">
            <p className="text-[13px] text-slate-800">Haan ji! ₹799 · UPI payment link bhej diya.</p>
            <p className="text-[10px] text-green-700/70 mt-1 flex items-center gap-1">ChatFlow bot · 10:42 <Icon name="done_all" className="w-3.5 h-3.5 text-sky-500" /></p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="space-y-3 max-w-xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#25D366]">{v.eyebrow}</p>
            <h1 className="text-4xl xl:text-5xl font-bold text-white leading-[1.1] tracking-tight">{v.title}</h1>
            <p className="text-base xl:text-lg text-slate-300">{v.subtitle}</p>
          </div>
          <div className="grid grid-cols-3 gap-3 max-w-lg">
            {STATS.map((s) => (
              <div key={s.label} className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-4">
                <p className="text-2xl font-bold text-[#25D366]">{s.value}</p>
                <p className="text-xs text-slate-300 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400">© {new Date().getFullYear()} ChatFlow. Built on the WhatsApp Business API.</p>
        </div>
      </div>
    </aside>
  );
}

/** Compact photo banner on mobile/tablet. */
export function AuthHeroMobile() {
  const v = variantFor(usePathname());
  return (
    <div className="lg:hidden relative h-52 sm:h-64 overflow-hidden">
      <Image src={v.image} alt={v.alt} fill priority sizes="100vw" className="object-cover" style={{ objectPosition: v.objectPosition }} />
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/60 via-slate-950/30 to-slate-950/85" />
      <div className="relative z-10 h-full flex flex-col justify-between p-5 sm:p-8 pb-14 sm:pb-16">
        <Logo />
        <div>
          <p className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em] text-[#25D366]">{v.eyebrow}</p>
          <p className="mt-1 text-lg sm:text-2xl font-bold text-white leading-snug max-w-md">{v.title}</p>
        </div>
      </div>
    </div>
  );
}
