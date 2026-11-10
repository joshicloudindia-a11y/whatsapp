"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { Eyebrow, FOCUS, Logo } from "./brand";
import { HeroMockup } from "./HeroMockup";
import { Pricing } from "./Pricing";
import { LEGAL_DOCS } from "@/lib/legal";

// ─── Content ──────────────────────────────────────────────────────────────────
const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Use cases", href: "#use-cases" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

const HERO_STATS = [
  { value: "8k+", label: "Indian businesses" },
  { value: "90%+", label: "Message open rate" },
  { value: "3x", label: "Faster replies" },
];

const INDUSTRIES = [
  "Kirana & retail stores", "D2C fashion brands", "Coaching institutes", "Real estate brokers",
  "Clinics & diagnostics", "Travel agencies", "Restaurants & cloud kitchens", "Salons & spas",
  "Jewellers", "Electronics dealers", "Gyms & fitness studios", "Insurance advisors",
];

const FEATURES = [
  { icon: "forum", tint: "bg-green-100 text-green-700", title: "Shared team inbox", desc: "One WhatsApp number, many agents. Assign chats, add internal notes and labels, and never miss the 24-hour reply window." },
  { icon: "campaign", tint: "bg-sky-100 text-sky-700", title: "Bulk broadcasts", desc: "Send personalised offers to thousands of opted-in customers, schedule campaigns and track delivered, read and replied." },
  { icon: "smart_toy", tint: "bg-violet-100 text-violet-700", title: "No-code chatbots", desc: "Answer price, stock and order-status questions 24/7 with button-based flows — in English, Hindi or Hinglish." },
  { icon: "bolt", tint: "bg-amber-100 text-amber-700", title: "Automation", desc: "Auto-reply, tag and route chats by keyword, time or label. Welcome messages and away messages on autopilot." },
  { icon: "description", tint: "bg-rose-100 text-rose-700", title: "Approved templates", desc: "Create Meta-approved templates with variables, media and buttons for OTPs, order updates and reminders." },
  { icon: "monitoring", tint: "bg-teal-100 text-teal-700", title: "Analytics & reports", desc: "See response times, agent performance and campaign results. Download reports for your weekly review." },
  { icon: "contacts", tint: "bg-indigo-100 text-indigo-700", title: "Contacts & CSV import", desc: "Import contacts from Excel or CSV, segment with tags and custom fields, and target the right audience." },
  { icon: "admin_panel_settings", tint: "bg-slate-200 text-slate-800", title: "Roles & security", desc: "Owner, admin and agent roles, invite-only team access and secure login so customer data stays protected." },
];

const STEPS = [
  { icon: "smartphone", title: "Connect your number", desc: "Link your WhatsApp Business number through the official Meta Business API. Most teams are live in under 10 minutes." },
  { icon: "group", title: "Invite your team", desc: "Add agents, set roles, import your contacts from CSV and set up quick replies, templates and a welcome bot." },
  { icon: "rocket_launch", title: "Start selling & supporting", desc: "Run broadcasts, reply from one inbox and let automations handle the repetitive questions round the clock." },
];

type UseCase = {
  id: string; label: string; icon: string; image: string; alt: string; objectPosition: string;
  title: string; desc: string; points: string[]; metric: { value: string; label: string };
  chat: { q: string; a: string };
};

const USE_CASES: UseCase[] = [
  {
    id: "retail", label: "Retail / D2C", icon: "sell",
    image: "/images/auth/register.jpg", alt: "Indian shop owner at his store counter in Manali", objectPosition: "center 40%",
    title: "Turn WhatsApp chats into UPI orders",
    desc: "Share catalogues, answer size and stock questions instantly and send payment links — without switching apps.",
    points: ["Festive sale broadcasts to opted-in buyers", "Order confirmation and dispatch updates", "Abandoned-cart nudges with a payment link"],
    metric: { value: "38%", label: "more repeat orders" },
    chat: { q: "Diwali offer wala silk saree abhi bhi hai?", a: "Haan ji! 20% off · ₹2,399. Payment link bhej diya." },
  },
  {
    id: "education", label: "Education", icon: "workspace_premium",
    image: "/images/landing/education.jpg", alt: "Indian tutor and student studying together with a laptop", objectPosition: "center 55%",
    title: "Fill batches and keep parents in the loop",
    desc: "Capture enquiries from ads, share brochures and demo-class links, and send fee and attendance reminders automatically.",
    points: ["Auto-reply with course details and fees", "Demo class and exam reminders", "Fee due alerts with payment link"],
    metric: { value: "2x", label: "more demo-class sign-ups" },
    chat: { q: "Kal ki demo class kitne baje hai?", a: "Kal 5 PM. Class link aur notes bhej diye." },
  },
  {
    id: "real-estate", label: "Real estate", icon: "apartment",
    image: "/images/auth/recover.jpg", alt: "Young Sikh businessman working on his laptop", objectPosition: "35% center",
    title: "Qualify leads and book site visits faster",
    desc: "Respond to portal and ad leads in seconds, share floor plans and location pins, and route hot buyers to the right agent.",
    points: ["Instant lead reply with project brochure", "Site-visit booking and reminders", "Assign leads to agents by locality"],
    metric: { value: "5 min", label: "average first response" },
    chat: { q: "Whitefield mein 2BHK site visit book karni hai", a: "Done! Saturday 11 AM · Location pin bheja." },
  },
  {
    id: "clinics", label: "Clinics", icon: "schedule",
    image: "/images/auth/login.jpg", alt: "Indian woman in a kurta booking an appointment on her phone", objectPosition: "center 65%",
    title: "Appointments and reminders on autopilot",
    desc: "Let patients book, reschedule and get reports on WhatsApp — and cut no-shows with timely reminders.",
    points: ["Appointment booking chatbot", "Reminder one hour before the visit", "Share reports and follow-up instructions"],
    metric: { value: "40%", label: "fewer no-shows" },
    chat: { q: "Dr. Mehta ka appointment kal mil sakta hai?", a: "Kal 10:30 AM confirm. Reminder 1 ghanta pehle aayega." },
  },
];

const FAQS = [
  { q: "What do I need to get started?", a: "A phone number that isn't already active on the regular WhatsApp app, and a Facebook (Meta) business account. We guide you through connecting it to the official WhatsApp Business API — most businesses are live in under 10 minutes." },
  { q: "Will my number get blocked if I send broadcasts?", a: "ChatFlow uses the official Meta API, not unofficial tools. Send broadcasts only to customers who have opted in, using Meta-approved templates, and your number stays healthy. We show delivery and read stats so you can spot issues early." },
  { q: "Can my whole team reply from one WhatsApp number?", a: "Yes. Every agent logs in with their own account and works from the shared inbox. You can assign chats, leave internal notes, use labels and control what each role can see." },
  { q: "Can I import my existing customer list?", a: "Yes. Upload contacts from a CSV or Excel export, map custom fields and tags, and use them to target broadcasts and automations." },
  { q: "Does it support Hindi and other Indian languages?", a: "Templates, quick replies and chatbot flows can be written in any language WhatsApp supports — Hindi, Hinglish, Tamil, Marathi, Bengali and more." },
  { q: "Are WhatsApp message charges included in the plan?", a: "Meta charges a small per-message fee for template messages (like broadcasts and reminders), which is separate from your ChatFlow plan. Replies to customers inside the 24-hour service window are free." },
  { q: "Is there a free trial?", a: "Yes — every plan starts with a 14-day free trial. No credit card is required, and you can cancel anytime." },
];

// ─── Shared bits ──────────────────────────────────────────────────────────────
const btnPrimary = cn(
  "inline-flex items-center justify-center gap-2 rounded-2xl bg-[#25D366] font-bold text-slate-950 shadow-lg shadow-green-500/25 transition-all hover:brightness-110",
  FOCUS, "focus-visible:ring-offset-slate-950"
);
const btnGhostDark = cn(
  "inline-flex items-center justify-center gap-2 rounded-2xl border border-white/20 font-semibold text-white transition-colors hover:bg-white/10",
  FOCUS, "focus-visible:ring-offset-slate-950"
);

function SectionHeading({ eyebrow, title, sub, id, dark = false }: { eyebrow: string; title: string; sub?: string; id: string; dark?: boolean }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <Eyebrow dark={dark}>{eyebrow}</Eyebrow>
      <h2 id={id} className={cn("mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight", dark ? "text-white" : "text-slate-900")}>{title}</h2>
      {sub && <p className={cn("mt-3 text-base sm:text-lg", dark ? "text-slate-300" : "text-slate-600")}>{sub}</p>}
    </div>
  );
}

type NavProps = { isLoggedIn: boolean; dashHref: string; dashLabel: string };

// ─── Navbar ───────────────────────────────────────────────────────────────────
function Navbar({ isLoggedIn, dashHref, dashLabel }: NavProps) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onResize = () => { if (window.innerWidth >= 1024) setOpen(false); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b backdrop-blur-xl transition-colors duration-300",
        scrolled || open ? "border-white/10 bg-slate-950/95 shadow-lg shadow-black/20" : "border-transparent bg-slate-950"
      )}
    >
      <nav aria-label="Main" className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Logo />

        <ul className="hidden lg:flex items-center gap-1">
          {NAV_LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href} className={cn("rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:text-white", FOCUS, "focus-visible:ring-offset-slate-950")}>
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="hidden lg:flex items-center gap-2">
          {isLoggedIn ? (
            <Link href={dashHref} className={cn(btnPrimary, "rounded-xl px-5 py-2.5 text-sm")}>
              <Icon name={dashHref === "/admin" ? "admin_panel_settings" : "dashboard"} className="w-4 h-4" />
              {dashLabel}
            </Link>
          ) : (
            <>
              <Link href="/login" className={cn("inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/10", FOCUS, "focus-visible:ring-offset-slate-950")}>
                <Icon name="login" className="w-4 h-4" /> Login
              </Link>
              <Link href="/register" className={cn(btnPrimary, "rounded-xl px-5 py-2.5 text-sm")}>
                Start free trial
              </Link>
            </>
          )}
        </div>

        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          className={cn("lg:hidden -mr-1 inline-flex h-11 w-11 items-center justify-center rounded-xl text-white hover:bg-white/10", FOCUS, "focus-visible:ring-offset-slate-950")}
        >
          <Icon name={open ? "close" : "menu"} className="w-6 h-6" />
        </button>
      </nav>

      <div id="mobile-menu" hidden={!open} className="lg:hidden border-t border-white/10 bg-slate-950 px-4 pb-6 pt-2 sm:px-6">
        <ul className="divide-y divide-white/5">
          {NAV_LINKS.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                onClick={() => setOpen(false)}
                className={cn("flex items-center justify-between rounded-lg px-1 py-3.5 text-base font-medium text-slate-200 hover:text-white", FOCUS, "focus-visible:ring-offset-slate-950")}
              >
                {l.label}
                <Icon name="chevron_right" className="w-5 h-5 text-slate-500" />
              </a>
            </li>
          ))}
        </ul>
        <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {isLoggedIn ? (
            <Link href={dashHref} className={cn(btnPrimary, "py-3 text-sm sm:col-span-2")}>
              {dashLabel} <Icon name="arrow_forward" className="w-4 h-4" />
            </Link>
          ) : (
            <>
              <Link href="/login" className={cn(btnGhostDark, "py-3 text-sm")}>Login</Link>
              <Link href="/register" className={cn(btnPrimary, "py-3 text-sm")}>Start free trial</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────
function Hero({ isLoggedIn, dashHref, dashLabel }: NavProps) {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden bg-slate-950">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-[#25D366]/15 blur-3xl lg:left-1/4" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-sky-500/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{ backgroundImage: "linear-gradient(#25D366 1px, transparent 1px), linear-gradient(90deg, #25D366 1px, transparent 1px)", backgroundSize: "56px 56px", maskImage: "radial-gradient(ellipse at top, black 30%, transparent 75%)" }}
        />
      </div>

      <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-4 pb-20 pt-12 sm:px-6 sm:pt-16 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:px-8 lg:pb-28 lg:pt-20">
        <div className="landing-fade-up text-center lg:text-left">
          <p className="inline-flex items-center gap-2 rounded-full border border-[#25D366]/30 bg-[#25D366]/10 px-3.5 py-1.5 text-xs font-semibold text-green-300">
            <Icon name="verified" filled className="w-4 h-4 text-[#25D366]" />
            Official WhatsApp Business API platform
          </p>

          <h1 id="hero-title" className="mt-6 text-[2.35rem] leading-[1.08] sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white">
            Sell, support and grow your business on <span className="text-[#25D366]">WhatsApp</span>
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-base sm:text-lg leading-relaxed text-slate-300 lg:mx-0">
            One shared inbox for your whole team, bulk broadcasts that actually get read, and chatbots that reply in Hinglish — built for Indian businesses.
          </p>

          <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center lg:justify-start">
            {isLoggedIn ? (
              <Link href={dashHref} className={cn(btnPrimary, "px-7 py-4 text-base")}>
                <Icon name="rocket_launch" className="w-5 h-5" /> {dashLabel}
              </Link>
            ) : (
              <>
                <Link href="/register" className={cn(btnPrimary, "px-7 py-4 text-base")}>
                  Start free trial <Icon name="arrow_forward" className="w-5 h-5" />
                </Link>
                <Link href="/login" className={cn(btnGhostDark, "px-7 py-4 text-base")}>
                  <Icon name="login" className="w-5 h-5" /> Login
                </Link>
              </>
            )}
          </div>

          <ul className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-slate-300 lg:justify-start">
            {(isLoggedIn ? ["Welcome back — your dashboard is ready"] : ["14-day free trial", "No credit card", "Live in 10 minutes"]).map((t) => (
              <li key={t} className="inline-flex items-center gap-1.5">
                <Icon name="check_circle" filled className="w-4 h-4 text-[#25D366]" /> {t}
              </li>
            ))}
          </ul>

          <dl className="mx-auto mt-10 grid max-w-lg grid-cols-3 gap-2.5 sm:gap-3 lg:mx-0">
            {HERO_STATS.map((s) => (
              <div key={s.label} className="rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4 backdrop-blur-md">
                <dt className="sr-only">{s.label}</dt>
                <dd>
                  <span className="block text-xl sm:text-2xl font-bold text-[#25D366]">{s.value}</span>
                  <span className="mt-0.5 block text-[11px] sm:text-xs leading-tight text-slate-300">{s.label}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <HeroMockup />
      </div>
    </section>
  );
}

// ─── Trust strip ──────────────────────────────────────────────────────────────
function TrustStrip() {
  const row = (hidden: boolean) => (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 items-center gap-3 pr-3">
      {INDUSTRIES.map((n) => (
        <li key={n} className="whitespace-nowrap rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700">
          {n}
        </li>
      ))}
    </ul>
  );
  return (
    <section aria-label="Who uses ChatFlow" className="border-b border-slate-200 bg-slate-50 py-10">
      <p className="px-4 text-center text-sm font-semibold text-slate-600">
        Trusted by 8,000+ growing businesses across India
      </p>
      <div className="relative mt-5 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)]">
        <div className="landing-marquee flex w-max">
          {row(false)}
          {row(true)}
        </div>
      </div>
    </section>
  );
}

// ─── Features ─────────────────────────────────────────────────────────────────
function Features() {
  return (
    <section id="features" aria-labelledby="features-title" className="scroll-mt-20 bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          id="features-title"
          eyebrow="Features"
          title="Everything you need to run your business on WhatsApp"
          sub="Inbox, campaigns, chatbots and reports in one place — no more juggling five phones and three tools."
        />
        <ul className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 sm:gap-5">
          {FEATURES.map((f) => (
            <li key={f.title} className="group flex gap-4 rounded-3xl border border-slate-200 bg-white p-5 sm:block sm:p-6 transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-xl motion-reduce:hover:translate-y-0">
              <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl", f.tint)}>
                <Icon name={f.icon} className="w-6 h-6" />
              </span>
              <div>
                <h3 className="text-base font-bold text-slate-900 sm:mt-5">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600 sm:mt-2">{f.desc}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ─── How it works ─────────────────────────────────────────────────────────────
function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="relative scroll-mt-20 overflow-hidden bg-slate-950 py-20 sm:py-24">
      <div aria-hidden className="pointer-events-none absolute -right-40 top-0 h-96 w-96 rounded-full bg-[#25D366]/10 blur-3xl" />
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionHeading id="how-title" dark eyebrow="How it works" title="Live on WhatsApp in three simple steps" />
        <div className="relative mt-14">
          <div aria-hidden className="absolute left-[16%] right-[16%] top-[3.25rem] hidden h-px bg-gradient-to-r from-[#25D366]/0 via-[#25D366]/50 to-[#25D366]/0 md:block" />
          <ol className="relative grid gap-5 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-7 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-[#25D366] text-slate-950 shadow-lg shadow-green-500/30">
                  <Icon name={s.icon} className="w-7 h-7" />
                </span>
                <span className="text-sm font-bold text-slate-400">Step {i + 1}</span>
              </div>
              <h3 className="mt-5 text-lg font-bold text-white">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">{s.desc}</p>
            </li>
          ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

// ─── Use cases (tabs) ─────────────────────────────────────────────────────────
function UseCases() {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const uc = USE_CASES[active];

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const n = USE_CASES.length;
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (active + 1) % n;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (active - 1 + n) % n;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    if (next === null) return;
    e.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  };

  return (
    <section id="use-cases" aria-labelledby="use-cases-title" className="scroll-mt-20 bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          id="use-cases-title"
          eyebrow="Use cases"
          title="Built for the way India does business"
          sub="From a single shop to a multi-city brand — see how teams like yours use ChatFlow."
        />

        <div role="tablist" aria-label="Industries" onKeyDown={onKeyDown} className="mx-auto mt-10 grid max-w-3xl grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1.5 sm:grid-cols-4">
          {USE_CASES.map((u, i) => {
            const selected = i === active;
            return (
              <button
                key={u.id}
                ref={(el) => { tabs.current[i] = el; }}
                type="button"
                role="tab"
                id={`tab-${u.id}`}
                aria-selected={selected}
                aria-controls={`panel-${u.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActive(i)}
                className={cn(
                  "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                  selected ? "bg-slate-950 text-white shadow" : "text-slate-600 hover:text-slate-900",
                  FOCUS
                )}
              >
                <Icon name={u.icon} className="w-4 h-4" /> {u.label}
              </button>
            );
          })}
        </div>

        <div
          key={uc.id}
          role="tabpanel"
          id={`panel-${uc.id}`}
          aria-labelledby={`tab-${uc.id}`}
          tabIndex={0}
          className={cn("landing-fade-up mt-10 grid items-center gap-8 rounded-[2rem] lg:grid-cols-2 lg:gap-14", "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366]")}
        >
          <div className="relative aspect-[4/3] overflow-hidden rounded-[2rem] bg-slate-200 shadow-xl">
            <Image src={uc.image} alt={uc.alt} fill sizes="(min-width: 1024px) 600px, 100vw" className="object-cover" style={{ objectPosition: uc.objectPosition }} />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent" />
            <div className="absolute inset-x-4 bottom-4 space-y-2 sm:inset-x-6 sm:bottom-6 sm:max-w-sm">
              <div className="mr-10 rounded-2xl rounded-tl-sm bg-white/95 px-3.5 py-2.5 shadow-xl backdrop-blur">
                <p className="text-[13px] text-slate-800">{uc.chat.q}</p>
                <p className="mt-0.5 text-[10px] text-slate-500">Customer</p>
              </div>
              <div className="ml-10 rounded-2xl rounded-tr-sm bg-[#d9fdd3] px-3.5 py-2.5 shadow-xl">
                <p className="text-[13px] text-slate-800">{uc.chat.a}</p>
                <p className="mt-0.5 flex items-center gap-1 text-[10px] text-green-800/80">
                  ChatFlow bot <Icon name="done_all" className="w-3.5 h-3.5 text-sky-500" />
                </p>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">{uc.title}</h3>
            <p className="mt-3 text-base leading-relaxed text-slate-600">{uc.desc}</p>
            <ul className="mt-6 space-y-3">
              {uc.points.map((p) => (
                <li key={p} className="flex items-start gap-3 text-slate-700">
                  <Icon name="check_circle" filled className="mt-0.5 w-5 h-5 text-green-600" /> {p}
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="rounded-2xl border border-green-200 bg-green-50 px-5 py-3">
                <p className="text-2xl font-extrabold text-green-700">{uc.metric.value}</p>
                <p className="text-xs font-medium text-green-800">{uc.metric.label}*</p>
              </div>
              <Link href="/register" className={cn("inline-flex items-center gap-1.5 rounded-lg text-sm font-bold text-slate-900 hover:text-green-700", FOCUS)}>
                Try it for your business <Icon name="arrow_forward" className="w-4 h-4" />
              </Link>
            </div>
            <p className="mt-3 text-xs text-slate-500">*Illustrative figures — results vary by business.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── FAQ ──────────────────────────────────────────────────────────────────────
function FAQ() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="scroll-mt-20 bg-white py-20 sm:py-24">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_1.6fr] lg:gap-16 lg:px-8">
        <div className="text-center lg:text-left">
          <Eyebrow>FAQ</Eyebrow>
          <h2 id="faq-title" className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">Questions? We&apos;ve got answers.</h2>
          <p className="mt-3 text-base text-slate-600">Still unsure? Start a free trial and see it working with your own WhatsApp number.</p>
          <div className="relative mx-auto mt-8 hidden aspect-[4/5] max-w-xs overflow-hidden rounded-[2rem] shadow-xl lg:mx-0 lg:block">
            <Image src="/images/auth/register.jpg" alt="Indian shop owner smiling at his store counter" fill sizes="320px" className="object-cover" style={{ objectPosition: "center 40%" }} />
          </div>
        </div>
        <div className="self-start divide-y divide-slate-200 rounded-3xl border border-slate-200">
          {FAQS.map((f) => (
            <details key={f.q} className="group px-5 sm:px-6 [&_summary::-webkit-details-marker]:hidden">
              <summary className={cn("flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg py-5 text-left text-base font-semibold text-slate-900", FOCUS)}>
                {f.q}
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition-transform group-open:rotate-180 group-open:bg-[#25D366] group-open:text-slate-950 motion-reduce:transition-none">
                  <Icon name="expand_more" className="w-5 h-5" />
                </span>
              </summary>
              <p className="-mt-1 pb-5 pr-2 text-sm leading-relaxed text-slate-600 sm:pr-12">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Final CTA ────────────────────────────────────────────────────────────────
function FinalCTA({ isLoggedIn, dashHref, dashLabel }: NavProps) {
  return (
    <section aria-labelledby="cta-title" className="bg-white px-4 pb-20 sm:px-6 sm:pb-24 lg:px-8">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-slate-950 px-6 py-14 sm:px-12 sm:py-16 lg:px-16">
        <div aria-hidden className="pointer-events-none absolute -left-20 -top-24 h-80 w-80 rounded-full bg-[#25D366]/25 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 right-10 h-72 w-72 rounded-full bg-sky-500/15 blur-3xl" />
        <div className="relative grid items-center gap-10 lg:grid-cols-[1.4fr_1fr]">
          <div className="text-center lg:text-left">
            <h2 id="cta-title" className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
              {isLoggedIn ? "Welcome back to ChatFlow" : "Your customers are already on WhatsApp. Are you?"}
            </h2>
            <p className="mt-4 text-base sm:text-lg text-slate-300">
              {isLoggedIn
                ? "Your inbox, broadcasts and bots are waiting. Pick up where you left off."
                : "Join 8,000+ Indian businesses replying faster and selling more with ChatFlow."}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
              {isLoggedIn ? (
                <Link href={dashHref} className={cn(btnPrimary, "px-7 py-4 text-base")}>
                  <Icon name="rocket_launch" className="w-5 h-5" /> {dashLabel}
                </Link>
              ) : (
                <>
                  <Link href="/register" className={cn(btnPrimary, "px-7 py-4 text-base")}>
                    Start free trial <Icon name="arrow_forward" className="w-5 h-5" />
                  </Link>
                  <Link href="/login" className={cn(btnGhostDark, "px-7 py-4 text-base")}>
                    I already have an account
                  </Link>
                </>
              )}
            </div>
          </div>
          <ul className="grid gap-3">
            {[
              { icon: "timer", t: "Set up in under 10 minutes" },
              { icon: "support_agent", t: "Onboarding help from our team" },
              { icon: "lock", t: "Official Meta API · secure by design" },
            ].map((x) => (
              <li key={x.t} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm font-medium text-slate-200 backdrop-blur-md">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#25D366]/15 text-[#25D366]">
                  <Icon name={x.icon} className="w-5 h-5" />
                </span>
                {x.t}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function Footer({ year, isLoggedIn, dashHref, dashLabel }: NavProps & { year: number }) {
  const account: [string, string][] = isLoggedIn
    ? [[dashLabel, dashHref]]
    : [["Login", "/login"], ["Create account", "/register"], ["Forgot password", "/forgot-password"]];
  return (
    <footer className="bg-slate-950 text-slate-300">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr] lg:px-8">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-400">
            The WhatsApp Business platform for Indian teams — shared inbox, broadcasts, chatbots and analytics in one place.
          </p>
        </div>
        <nav aria-label="Product">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Product</p>
          <ul className="mt-4 space-y-2.5 text-sm">
            {NAV_LINKS.map((l) => (
              <li key={l.href}><a href={l.href} className={cn("rounded hover:text-white", FOCUS, "focus-visible:ring-offset-slate-950")}>{l.label}</a></li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Industries">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Industries</p>
          <ul className="mt-4 space-y-2.5 text-sm">
            {USE_CASES.map((u) => (
              <li key={u.id}><a href="#use-cases" className={cn("rounded hover:text-white", FOCUS, "focus-visible:ring-offset-slate-950")}>{u.label}</a></li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Account">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Account</p>
          <ul className="mt-4 space-y-2.5 text-sm">
            {account.map(([l, h]) => (
              <li key={h}><Link href={h} className={cn("rounded hover:text-white", FOCUS, "focus-visible:ring-offset-slate-950")}>{l}</Link></li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Legal">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Legal</p>
          <ul className="mt-4 space-y-2.5 text-sm">
            {LEGAL_DOCS.map((d) => (
              <li key={d.slug}><Link href={`/${d.slug}`} className={cn("rounded hover:text-white", FOCUS, "focus-visible:ring-offset-slate-950")}>{d.title}</Link></li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-6 text-xs text-slate-500 sm:flex-row sm:px-6 lg:px-8">
          <p>© {year} ChatFlow. All rights reserved.</p>
          <p>Built on the official WhatsApp Business API · Made for Indian businesses</p>
        </div>
      </div>
    </footer>
  );
}

// ─── Mobile sticky CTA (appears after scrolling past the hero) ────────────────
function MobileStickyCTA({ isLoggedIn, dashHref, dashLabel }: NavProps) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 700);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      aria-hidden={!show}
      className={cn(
        "md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-slate-950/95 px-4 py-3 backdrop-blur-xl transition-transform duration-300 motion-reduce:transition-none",
        "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
        show ? "translate-y-0" : "translate-y-full"
      )}
    >
      <div className="flex gap-2.5">
        {isLoggedIn ? (
          <Link href={dashHref} tabIndex={show ? 0 : -1} className={cn(btnPrimary, "flex-1 rounded-xl py-3 text-sm")}>
            {dashLabel} <Icon name="arrow_forward" className="w-4 h-4" />
          </Link>
        ) : (
          <>
            <Link href="/login" tabIndex={show ? 0 : -1} className={cn(btnGhostDark, "rounded-xl px-5 py-3 text-sm")}>Login</Link>
            <Link href="/register" tabIndex={show ? 0 : -1} className={cn(btnPrimary, "flex-1 rounded-xl py-3 text-sm")}>
              Start free trial <Icon name="arrow_forward" className="w-4 h-4" />
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function LandingPage({
  isLoggedIn = false,
  isSuperAdmin = false,
  year,
}: {
  isLoggedIn?: boolean;
  isSuperAdmin?: boolean;
  /** Computed on the server so render stays pure. */
  year: number;
}) {
  const dashHref = isSuperAdmin ? "/admin" : "/dashboard";
  const dashLabel = isSuperAdmin ? "Open admin panel" : "Go to dashboard";
  const nav = { isLoggedIn, dashHref, dashLabel };

  return (
    <div className="min-h-dvh overflow-x-clip bg-white">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-slate-900">
        Skip to content
      </a>
      <Navbar {...nav} />
      <main id="main">
        <Hero {...nav} />
        <TrustStrip />
        <Features />
        <HowItWorks />
        <UseCases />
        <Pricing isLoggedIn={isLoggedIn} />
        <FAQ />
        <FinalCTA {...nav} />
      </main>
      <Footer {...nav} year={year} />
      <div className="h-16 bg-slate-950 md:hidden" aria-hidden />
      <MobileStickyCTA {...nav} />
    </div>
  );
}
