"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faInbox, faBullhorn, faRobot, faBolt, faChartLine, faCode,
  faCheck, faBars, faXmark, faArrowRight, faUsers, faHeadset,
  faGlobe, faShield, faStar, faLock, faHouse, faTag, faUser, faRocket,
} from "@fortawesome/free-solid-svg-icons";
import { cn } from "@/lib/utils";

type Plan = {
  id: string; name: string; slug: string; description?: string;
  monthlyPrice: number; annualPrice: number; currency: string;
  isPopular: boolean; features: string[];
  maxUsers: number; maxBroadcasts: number; maxAutomations: number;
  maxApiCalls: number; maxAiCredits: number; maxWhatsappNumbers: number;
};

const CURRENCY_SYMBOL: Record<string, string> = { USD: "$", INR: "₹", EUR: "€", GBP: "£" };

const FEATURES = [
  {
    icon: faInbox, color: "#25D366", bg: "#dcfce7",
    title: "Team Inbox",
    desc: "Collaborate on every WhatsApp conversation. Assign, respond, and resolve together as a team.",
  },
  {
    icon: faBullhorn, color: "#3b82f6", bg: "#dbeafe",
    title: "Broadcast Campaigns",
    desc: "Send personalized messages to thousands of customers at once with detailed delivery analytics.",
  },
  {
    icon: faRobot, color: "#8b5cf6", bg: "#ede9fe",
    title: "Chatbot Builder",
    desc: "Build no-code chatbots with a drag-and-drop flow editor to automate customer interactions 24/7.",
  },
  {
    icon: faBolt, color: "#f59e0b", bg: "#fef3c7",
    title: "Smart Automation",
    desc: "Set up smart workflows that automatically respond, tag, and route conversations based on your rules.",
  },
  {
    icon: faChartLine, color: "#ef4444", bg: "#fee2e2",
    title: "Analytics & Reports",
    desc: "Track message volume, response rates, agent performance, and campaign effectiveness in real time.",
  },
  {
    icon: faCode, color: "#0ea5e9", bg: "#e0f2fe",
    title: "Developer API",
    desc: "Integrate ChatFlow into your CRM, e-commerce, or custom app with our comprehensive REST API.",
  },
];

const STATS = [
  { value: "10,000+", label: "Businesses" },
  { value: "50M+",    label: "Messages / Month" },
  { value: "99.9%",   label: "Uptime SLA" },
  { value: "150+",    label: "Countries" },
];

const HOW_IT_WORKS = [
  {
    step: "01", title: "Connect WhatsApp",
    desc: "Link your WhatsApp Business number via the Meta Business API. Takes under 10 minutes.",
  },
  {
    step: "02", title: "Set Up Your Team",
    desc: "Invite agents, create teams, set roles, and configure your automated workflows.",
  },
  {
    step: "03", title: "Start Messaging at Scale",
    desc: "Launch broadcasts, handle conversations, and watch your customer engagement grow.",
  },
];

const TESTIMONIALS = [
  {
    name: "Rahul Mehta", role: "CEO, GrowFast India",
    text: "ChatFlow transformed how we handle customer support. Our response time dropped from 6 hours to under 10 minutes.",
    rating: 5,
  },
  {
    name: "Priya Sharma", role: "Marketing Head, ShopBolt",
    text: "The broadcast feature is incredible. We sent 50,000 messages for our sale and got a 38% click-through rate.",
    rating: 5,
  },
  {
    name: "David Osei", role: "Founder, TechBridge GH",
    text: "The chatbot builder is so intuitive. We built a complete customer onboarding flow in a single afternoon.",
    rating: 5,
  },
];

// ─── Mobile Bottom Nav ────────────────────────────────────────────────────────
function MobileBottomNav() {
  const items = [
    { icon: faHouse,  label: "Home",     href: "#",          highlight: false },
    { icon: faBolt,   label: "Features", href: "#features",  highlight: false },
    { icon: faTag,    label: "Pricing",  href: "#pricing",   highlight: false },
    { icon: faUser,   label: "Login",    href: "/login",     highlight: false },
    { icon: faRocket, label: "Start",    href: "/register",  highlight: true  },
  ];

  return (
    <div className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-white border-t shadow-2xl"
      style={{ borderColor: "#e2e8f0" }}>
      <div className="flex items-stretch">
        {items.map((item) => {
          const isPage = item.href.startsWith("/");
          const Comp = isPage ? Link : "a";
          return (
            <Comp
              key={item.label}
              href={item.href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-1 py-2.5 text-xs font-medium transition-colors",
                item.highlight ? "text-white" : "text-slate-500 hover:text-green-600"
              )}
              style={item.highlight ? { background: "#25D366" } : {}}
            >
              <FontAwesomeIcon icon={item.icon} className="w-5 h-5" />
              {item.label}
            </Comp>
          );
        })}
      </div>
    </div>
  );
}

// ─── Navbar ───────────────────────────────────────────────────────────────────
function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const links = [
    { label: "Features", href: "#features" },
    { label: "How It Works", href: "#how-it-works" },
    { label: "Pricing", href: "#pricing" },
  ];

  return (
    <nav
      className={cn(
        "fixed top-0 inset-x-0 z-50 transition-all duration-300",
        scrolled ? "bg-white shadow-md" : "bg-transparent"
      )}
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "#25D366" }}>
            <svg viewBox="0 0 24 24" fill="white" className="w-5 h-5">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
          </div>
          <span className={cn("font-bold text-lg", scrolled ? "text-slate-900" : "text-white")}>ChatFlow</span>
        </div>

        <div className="hidden md:flex items-center gap-8">
          {links.map((l) => (
            <a
              key={l.href} href={l.href}
              className={cn("text-sm font-medium transition-colors hover:text-green-500",
                scrolled ? "text-slate-600" : "text-white/80")}
            >
              {l.label}
            </a>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <Link href="/login"
            className={cn("text-sm font-medium px-4 py-2 rounded-xl transition-colors",
              scrolled ? "text-slate-700 hover:bg-slate-100" : "text-white/90 hover:bg-white/10")}
          >
            Login
          </Link>
          <Link href="/register"
            className="text-sm font-semibold px-5 py-2 rounded-xl text-white transition-all hover:brightness-110"
            style={{ background: "#25D366" }}
          >
            Get Started Free
          </Link>
        </div>

        <button
          className={cn("md:hidden p-2 rounded-lg", scrolled ? "text-slate-700" : "text-white")}
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          <FontAwesomeIcon icon={mobileOpen ? faXmark : faBars} className="w-5 h-5" />
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden bg-white border-t shadow-lg px-6 py-4 space-y-3">
          {links.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setMobileOpen(false)}
              className="block text-sm font-medium text-slate-700 py-2">
              {l.label}
            </a>
          ))}
          <div className="flex flex-col gap-2 pt-2 border-t">
            <Link href="/login" className="text-center py-2.5 text-sm font-medium border border-slate-200 rounded-xl text-slate-700">Login</Link>
            <Link href="/register" className="text-center py-2.5 text-sm font-semibold rounded-xl text-white" style={{ background: "#25D366" }}>Get Started Free</Link>
          </div>
        </div>
      )}
    </nav>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="relative min-h-screen flex flex-col justify-center overflow-hidden pt-16" style={{ background: "#0b1d14" }}>
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-20 blur-3xl"
          style={{ background: "radial-gradient(circle, #25D366, transparent)" }} />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full opacity-10 blur-3xl"
          style={{ background: "radial-gradient(circle, #3b82f6, transparent)" }} />
      </div>

      <div className="absolute inset-0 opacity-5"
        style={{ backgroundImage: "linear-gradient(#25D366 1px, transparent 1px), linear-gradient(90deg, #25D366 1px, transparent 1px)", backgroundSize: "60px 60px" }} />

      <div className="relative max-w-7xl mx-auto px-6 py-20 flex flex-col items-center text-center gap-8">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold border"
          style={{ borderColor: "#25D36640", background: "#25D36615", color: "#4ade80" }}>
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          Powered by Meta WhatsApp Business API
        </div>

        <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold text-white leading-tight max-w-4xl">
          The Complete{" "}
          <span style={{ color: "#25D366" }}>WhatsApp</span>
          {" "}Business Platform
        </h1>

        <p className="text-lg sm:text-xl text-white/60 max-w-2xl leading-relaxed">
          Manage team inboxes, run broadcast campaigns, automate conversations, and build chatbots — all from one powerful dashboard.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4">
          <Link href="/register"
            className="flex items-center gap-2 px-8 py-4 rounded-2xl text-base font-bold text-white transition-all hover:brightness-110 shadow-lg"
            style={{ background: "#25D366", boxShadow: "0 0 30px #25D36650" }}
          >
            Get Started Free
            <FontAwesomeIcon icon={faArrowRight} className="w-4 h-4" />
          </Link>
          <Link href="/login"
            className="flex items-center gap-2 px-8 py-4 rounded-2xl text-base font-semibold text-white/80 border border-white/20 hover:bg-white/10 transition-all"
          >
            Login to Dashboard
          </Link>
        </div>

        <p className="text-sm text-white/30">No credit card required · Free 14-day trial</p>

        <div className="w-full max-w-5xl mt-6 rounded-2xl overflow-hidden shadow-2xl border border-white/10"
          style={{ background: "#0f2318" }}>
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10" style={{ background: "#0a1a10" }}>
            <div className="w-3 h-3 rounded-full bg-red-500 opacity-80" />
            <div className="w-3 h-3 rounded-full bg-yellow-400 opacity-80" />
            <div className="w-3 h-3 rounded-full bg-green-500 opacity-80" />
            <div className="ml-4 flex-1 bg-white/10 rounded-lg px-4 py-1 text-xs text-white/30 text-left">
              app.chatflow.io/dashboard
            </div>
          </div>
          <div className="flex" style={{ minHeight: 320 }}>
            <div className="w-44 border-r border-white/10 p-4 space-y-3 shrink-0" style={{ background: "#0a1a10" }}>
              <div className="h-6 rounded-lg bg-green-500/20" />
              {["Dashboard","Inbox","Contacts","Broadcasts","Templates","Chatbots","Automation","Analytics"].map((item, i) => (
                <div key={item} className={cn("h-5 rounded-md", i === 0 ? "bg-green-500/30" : "bg-white/5")} />
              ))}
            </div>
            <div className="flex-1 p-5 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {[["#25D366","Open Chats","142"],["#3b82f6","Messages Sent","8.4K"],["#8b5cf6","New Contacts","237"]].map(([c,l,v]) => (
                  <div key={l} className="rounded-xl p-3 border border-white/10" style={{ background: "#0a1a10" }}>
                    <div className="text-xs mb-1" style={{ color: `${c}99` }}>{l}</div>
                    <div className="text-2xl font-bold" style={{ color: c }}>{v}</div>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-white/10 p-3" style={{ background: "#0a1a10", height: 140 }}>
                <div className="text-xs text-white/30 mb-3">Message Volume — Last 7 Days</div>
                <div className="flex items-end gap-1.5 h-20">
                  {[40,65,45,80,60,90,75].map((h, i) => (
                    <div key={i} className="flex-1 rounded-sm opacity-70"
                      style={{ height: `${h}%`, background: i % 2 === 0 ? "#25D366" : "#3b82f6" }} />
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {["Recent Conversations","Recent Broadcasts"].map((title) => (
                  <div key={title} className="rounded-xl border border-white/10 p-3" style={{ background: "#0a1a10" }}>
                    <div className="text-xs text-white/30 mb-2">{title}</div>
                    {[1,2,3].map(i => (
                      <div key={i} className="flex items-center gap-2 py-1.5 border-b border-white/5 last:border-0">
                        <div className="w-5 h-5 rounded-full bg-green-500/30 shrink-0" />
                        <div className="flex-1 h-2.5 bg-white/10 rounded" />
                        <div className="w-10 h-4 bg-green-500/20 rounded-full" />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Stats ────────────────────────────────────────────────────────────────────
function Stats() {
  return (
    <section className="py-12 bg-white border-b" style={{ borderColor: "#e2e8f0" }}>
      <div className="max-w-5xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
        {STATS.map((s) => (
          <div key={s.label}>
            <p className="text-4xl font-extrabold text-slate-900">{s.value}</p>
            <p className="text-sm text-slate-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Features ─────────────────────────────────────────────────────────────────
function Features() {
  return (
    <section id="features" className="py-24" style={{ background: "#f8fafc" }}>
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-14">
          <p className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: "#25D366" }}>Features</p>
          <h2 className="text-4xl font-extrabold text-slate-900">Everything you need to grow on WhatsApp</h2>
          <p className="text-lg text-slate-500 mt-3 max-w-2xl mx-auto">
            One platform that replaces five tools — inbox, CRM, campaigns, automation, and analytics.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((f) => (
            <div key={f.title}
              className="bg-white rounded-2xl border p-6 hover:shadow-md transition-shadow group"
              style={{ borderColor: "#e2e8f0" }}
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110"
                style={{ background: f.bg }}>
                <FontAwesomeIcon icon={f.icon} className="w-5 h-5" style={{ color: f.color }} />
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-2">{f.title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── How It Works ─────────────────────────────────────────────────────────────
function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24 bg-white">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-14">
          <p className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: "#25D366" }}>How It Works</p>
          <h2 className="text-4xl font-extrabold text-slate-900">Up and running in minutes</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 relative">
          <div className="hidden md:block absolute top-8 left-1/6 right-1/6 h-px"
            style={{ background: "linear-gradient(90deg, #25D366, #3b82f6, #8b5cf6)" }} />

          {HOW_IT_WORKS.map((s, i) => (
            <div key={s.step} className="flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-black text-white shadow-lg z-10 relative"
                style={{ background: i === 0 ? "#25D366" : i === 1 ? "#3b82f6" : "#8b5cf6" }}>
                {s.step}
              </div>
              <h3 className="text-lg font-bold text-slate-900">{s.title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Pricing ──────────────────────────────────────────────────────────────────
function Pricing() {
  const [annual, setAnnual] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["public-plans"],
    queryFn: () => axios.get("/api/plans").then((r) => r.data),
  });

  const plans: Plan[] = data?.plans ?? [];

  return (
    <section id="pricing" className="py-24" style={{ background: "#f8fafc" }}>
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-10">
          <p className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: "#25D366" }}>Pricing</p>
          <h2 className="text-4xl font-extrabold text-slate-900">Simple, transparent pricing</h2>
          <p className="text-lg text-slate-500 mt-3">No hidden fees. Cancel anytime.</p>

          <div className="flex items-center justify-center gap-4 mt-6">
            <span className={cn("text-sm font-medium", !annual ? "text-slate-900" : "text-slate-400")}>Monthly</span>
            <button
              onClick={() => setAnnual(!annual)}
              className="relative inline-flex h-6 w-12 rounded-full transition-colors"
              style={{ background: annual ? "#25D366" : "#cbd5e1" }}
            >
              <span className={cn("inline-block w-5 h-5 bg-white rounded-full shadow transform transition-transform mt-0.5",
                annual ? "translate-x-6 ml-0.5" : "translate-x-0.5")} />
            </button>
            <span className={cn("text-sm font-medium", annual ? "text-slate-900" : "text-slate-400")}>
              Annual
              <span className="ml-1.5 px-1.5 py-0.5 text-xs font-semibold text-white rounded-full" style={{ background: "#25D366" }}>
                Save 20%
              </span>
            </span>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1,2,3].map(i => (
              <div key={i} className="bg-white rounded-2xl border p-8 animate-pulse h-96" style={{ borderColor: "#e2e8f0" }}>
                <div className="h-5 bg-slate-100 rounded w-1/3 mb-4" />
                <div className="h-12 bg-slate-100 rounded w-1/2 mb-6" />
                <div className="space-y-3">
                  {[1,2,3,4].map(j => <div key={j} className="h-4 bg-slate-100 rounded" />)}
                </div>
              </div>
            ))}
          </div>
        ) : plans.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <p className="text-lg font-medium">Pricing plans coming soon</p>
            <p className="text-sm mt-1">Contact us for custom pricing</p>
          </div>
        ) : (
          <div className={cn("grid gap-6", plans.length === 1 ? "max-w-sm mx-auto" : plans.length === 2 ? "grid-cols-1 md:grid-cols-2 max-w-3xl mx-auto" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3")}>
            {plans.map((plan) => {
              const price = annual ? plan.annualPrice : plan.monthlyPrice;
              const sym = CURRENCY_SYMBOL[plan.currency] ?? "$";
              return (
                <div
                  key={plan.id}
                  className={cn("relative bg-white rounded-2xl border flex flex-col overflow-hidden transition-shadow hover:shadow-xl",
                    plan.isPopular ? "border-2 shadow-lg" : ""
                  )}
                  style={{ borderColor: plan.isPopular ? "#25D366" : "#e2e8f0" }}
                >
                  {plan.isPopular && (
                    <div className="text-center py-2 text-xs font-bold text-white" style={{ background: "#25D366" }}>
                      MOST POPULAR
                    </div>
                  )}

                  <div className="p-8 flex flex-col flex-1">
                    <h3 className="text-xl font-bold text-slate-900">{plan.name}</h3>
                    {plan.description && <p className="text-sm text-slate-500 mt-1">{plan.description}</p>}

                    <div className="my-6">
                      <span className="text-5xl font-extrabold text-slate-900">{sym}{price}</span>
                      <span className="text-slate-400 text-sm ml-1">/ {annual ? "year" : "month"}</span>
                      {annual && plan.monthlyPrice > 0 && (
                        <p className="text-xs text-green-600 mt-1 font-medium">
                          Save {sym}{Math.round((plan.monthlyPrice * 12) - plan.annualPrice)} vs monthly
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-6">
                      {[
                        { label: "Users", val: plan.maxUsers },
                        { label: "WA Numbers", val: plan.maxWhatsappNumbers },
                        { label: "Broadcasts/mo", val: plan.maxBroadcasts >= 999999 ? "Unlimited" : plan.maxBroadcasts.toLocaleString() },
                        { label: "Automations", val: plan.maxAutomations.toLocaleString() },
                        { label: "API Calls/mo", val: plan.maxApiCalls >= 1000000 ? `${(plan.maxApiCalls/1000).toFixed(0)}K` : plan.maxApiCalls.toLocaleString() },
                        { label: "AI Credits/mo", val: plan.maxAiCredits },
                      ].map((s) => (
                        <div key={s.label} className="text-xs p-2 bg-slate-50 rounded-lg">
                          <span className="text-slate-400 block">{s.label}</span>
                          <span className="font-semibold text-slate-800">{s.val}</span>
                        </div>
                      ))}
                    </div>

                    {plan.features.length > 0 && (
                      <ul className="space-y-2.5 mb-6 flex-1">
                        {plan.features.map((f, i) => (
                          <li key={i} className="flex items-start gap-2.5 text-sm text-slate-600">
                            <FontAwesomeIcon icon={faCheck} className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "#25D366" }} />
                            {f}
                          </li>
                        ))}
                      </ul>
                    )}

                    <Link
                      href="/register"
                      className={cn("mt-auto block text-center py-3 rounded-xl text-sm font-bold transition-all",
                        plan.isPopular ? "text-white hover:brightness-110" : "border-2 text-slate-700 hover:bg-slate-50"
                      )}
                      style={plan.isPopular ? { background: "#25D366" } : { borderColor: "#e2e8f0" }}
                    >
                      {price === 0 ? "Get Started Free" : "Start Free Trial"}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-center text-sm text-slate-400 mt-8">
          All plans include 14-day free trial · No credit card required · Cancel anytime
        </p>
      </div>
    </section>
  );
}

// ─── Testimonials ─────────────────────────────────────────────────────────────
function Testimonials() {
  return (
    <section className="py-24 bg-white">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-14">
          <p className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: "#25D366" }}>Testimonials</p>
          <h2 className="text-4xl font-extrabold text-slate-900">Loved by businesses worldwide</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t) => (
            <div key={t.name} className="bg-slate-50 rounded-2xl p-7 flex flex-col gap-4 border" style={{ borderColor: "#e2e8f0" }}>
              <div className="flex gap-0.5">
                {Array.from({ length: t.rating }).map((_, i) => (
                  <FontAwesomeIcon key={i} icon={faStar} className="w-4 h-4" style={{ color: "#f59e0b" }} />
                ))}
              </div>
              <p className="text-sm text-slate-600 leading-relaxed flex-1">"{t.text}"</p>
              <div>
                <p className="text-sm font-bold text-slate-900">{t.name}</p>
                <p className="text-xs text-slate-400">{t.role}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Trust badges ─────────────────────────────────────────────────────────────
function TrustBadges() {
  const badges = [
    { icon: faShield,  label: "SOC 2 Compliant" },
    { icon: faLock,    label: "End-to-End Encrypted" },
    { icon: faGlobe,   label: "GDPR Ready" },
    { icon: faHeadset, label: "24/7 Support" },
    { icon: faUsers,   label: "99.9% Uptime SLA" },
  ];
  return (
    <section className="py-12 border-t border-b" style={{ background: "#f8fafc", borderColor: "#e2e8f0" }}>
      <div className="max-w-5xl mx-auto px-6 flex flex-wrap items-center justify-center gap-8">
        {badges.map((b) => (
          <div key={b.label} className="flex items-center gap-2 text-sm font-medium text-slate-600">
            <FontAwesomeIcon icon={b.icon} className="w-4 h-4" style={{ color: "#25D366" }} />
            {b.label}
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── CTA ──────────────────────────────────────────────────────────────────────
function CTA() {
  return (
    <section className="py-24" style={{ background: "#0b1d14" }}>
      <div className="max-w-3xl mx-auto px-6 text-center">
        <h2 className="text-4xl font-extrabold text-white mb-4">
          Ready to grow your business on WhatsApp?
        </h2>
        <p className="text-lg text-white/50 mb-10">
          Join 10,000+ businesses already using ChatFlow to connect with their customers.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/register"
            className="flex items-center gap-2 px-8 py-4 rounded-2xl text-base font-bold text-white transition-all hover:brightness-110"
            style={{ background: "#25D366", boxShadow: "0 0 30px #25D36640" }}
          >
            Start Free Trial
            <FontAwesomeIcon icon={faArrowRight} className="w-4 h-4" />
          </Link>
          <Link
            href="/login"
            className="px-8 py-4 rounded-2xl text-base font-semibold text-white/70 border border-white/20 hover:bg-white/10 transition-all"
          >
            Already have an account?
          </Link>
        </div>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer style={{ background: "#060f0a" }}>
      <div className="max-w-7xl mx-auto px-6 py-14 grid grid-cols-1 md:grid-cols-4 gap-10">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "#25D366" }}>
              <svg viewBox="0 0 24 24" fill="white" className="w-5 h-5">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
            </div>
            <span className="font-bold text-lg text-white">ChatFlow</span>
          </div>
          <p className="text-sm text-white/40 leading-relaxed max-w-xs">
            The complete WhatsApp Business Platform for modern teams. Inbox, campaigns, automation, and analytics in one place.
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-white/30 mb-4">Product</p>
          <ul className="space-y-2.5">
            {["Features","Pricing","How It Works","API Docs","Changelog"].map((l) => (
              <li key={l}>
                <a href="#" className="text-sm text-white/50 hover:text-white transition-colors">{l}</a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-white/30 mb-4">Account</p>
          <ul className="space-y-2.5">
            {[["Login","/login"],["Register","/register"],["Forgot Password","/forgot-password"]].map(([l,h]) => (
              <li key={l}>
                <Link href={h} className="text-sm text-white/50 hover:text-white transition-colors">{l}</Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t max-w-7xl mx-auto px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-2"
        style={{ borderColor: "#ffffff10" }}>
        <p className="text-xs text-white/25">© {new Date().getFullYear()} ChatFlow. All rights reserved.</p>
        <p className="text-xs text-white/25">Built on Meta WhatsApp Business API</p>
      </div>
      {/* Space for mobile bottom nav */}
      <div className="md:hidden h-16" />
    </footer>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <Hero />
      <Stats />
      <Features />
      <HowItWorks />
      <Testimonials />
      <TrustBadges />
      <Pricing />
      <CTA />
      <Footer />
      <MobileBottomNav />
    </div>
  );
}
