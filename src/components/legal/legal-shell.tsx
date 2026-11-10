import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { Logo, Eyebrow, FOCUS } from "@/components/landing/brand";
import { LEGAL, LEGAL_DOCS } from "@/lib/legal";
import { cn } from "@/lib/utils";

export interface LegalSection { id: string; title: string; body: ReactNode }

// ─── Content helpers (consistent typography across every policy) ─────────────
export function P({ children }: { children: ReactNode }) {
  return <p className="text-[15px] leading-7 text-slate-600">{children}</p>;
}
export function UL({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3 text-[15px] leading-7 text-slate-600">
          <span className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#25D366]" aria-hidden />
          <span className="min-w-0">{it}</span>
        </li>
      ))}
    </ul>
  );
}
export function B({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-slate-900">{children}</strong>;
}
export function Callout({ icon = "info", tone = "green", children }: { icon?: string; tone?: "green" | "amber"; children: ReactNode }) {
  return (
    <div className={cn("flex gap-3 rounded-2xl border p-4 text-sm leading-6",
      tone === "green" ? "border-green-200 bg-green-50/70 text-green-900" : "border-amber-200 bg-amber-50/70 text-amber-900")}>
      <Icon name={icon} className={cn("w-5 h-5 shrink-0 mt-0.5", tone === "green" ? "text-green-600" : "text-amber-600")} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
export function Mail({ to = LEGAL.email }: { to?: string }) {
  return <a href={`mailto:${to}`} className="font-medium text-green-700 underline decoration-green-300 underline-offset-2 hover:decoration-green-600 break-all">{to}</a>;
}
export function DocLink({ slug, children }: { slug: string; children: ReactNode }) {
  return <Link href={`/${slug}`} className="font-medium text-green-700 underline decoration-green-300 underline-offset-2 hover:decoration-green-600">{children}</Link>;
}

// ─── Chrome ──────────────────────────────────────────────────────────────────
function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/95 backdrop-blur-xl">
      <nav aria-label="Main" className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Logo />
        <div className="flex items-center gap-1 sm:gap-2">
          <Link href="/legal" className={cn("hidden sm:inline-flex rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:text-white", FOCUS, "focus-visible:ring-offset-slate-950")}>Legal</Link>
          <Link href="/login" className={cn("rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:text-white", FOCUS, "focus-visible:ring-offset-slate-950")}>Login</Link>
          <Link href="/register" className={cn("rounded-xl bg-[#25D366] px-3.5 py-2 text-sm font-semibold text-slate-950 hover:bg-[#2fe076]", FOCUS, "focus-visible:ring-offset-slate-950")}>Get started</Link>
        </div>
      </nav>
    </header>
  );
}

function DocTabs({ current }: { current?: string }) {
  return (
    <nav aria-label="Legal documents" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]">
      <ul className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
        {LEGAL_DOCS.map((d) => {
          const active = d.slug === current;
          return (
            <li key={d.slug}>
              <Link href={`/${d.slug}`} aria-current={active ? "page" : undefined}
                className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors", FOCUS, "focus-visible:ring-offset-slate-950",
                  active ? "border-[#25D366] bg-[#25D366] text-slate-950" : "border-white/15 bg-white/5 text-slate-300 hover:border-white/30 hover:text-white")}>
                <Icon name={d.icon} className="w-3.5 h-3.5" /> {d.short}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Footer({ year }: { year: number }) {
  return (
    <footer className="bg-slate-950 text-slate-400">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <Logo />
        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {LEGAL_DOCS.map((d) => (
            <li key={d.slug}><Link href={`/${d.slug}`} className={cn("rounded hover:text-white", FOCUS, "focus-visible:ring-offset-slate-950")}>{d.title}</Link></li>
          ))}
        </ul>
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-7xl px-4 py-5 text-xs text-slate-500 sm:px-6 lg:px-8">
          © {year} {LEGAL.entity || LEGAL.brand}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

export function LegalFrame({ children, year }: { children: ReactNode; year: number }) {
  return (
    <div id="top" className="min-h-screen bg-slate-50 flex flex-col">
      <Header />
      {children}
      <Footer year={year} />
    </div>
  );
}

/** Full policy page: dark hero, document switcher, sticky table of contents, numbered sections. */
export function LegalPage({ slug, intro, sections, year }: { slug: string; intro: ReactNode; sections: LegalSection[]; year: number }) {
  const doc = LEGAL_DOCS.find((d) => d.slug === slug)!;
  return (
    <LegalFrame year={year}>
      <section className="relative overflow-hidden bg-slate-950">
        <div aria-hidden className="pointer-events-none absolute -top-32 right-0 h-80 w-80 rounded-full bg-[#25D366]/20 blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-4 pt-10 pb-8 sm:px-6 sm:pt-14 lg:px-8">
          <nav aria-label="Breadcrumb" className="mb-5 flex items-center gap-1.5 text-xs text-slate-400">
            <Link href="/" className="hover:text-white">Home</Link>
            <Icon name="chevron_right" className="w-3.5 h-3.5" />
            <Link href="/legal" className="hover:text-white">Legal</Link>
            <Icon name="chevron_right" className="w-3.5 h-3.5" />
            <span className="text-slate-300">{doc.short}</span>
          </nav>
          <div className="flex items-start gap-4">
            <span className="hidden sm:flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#25D366]/15 ring-1 ring-[#25D366]/30">
              <Icon name={doc.icon} className="w-7 h-7 text-[#25D366]" />
            </span>
            <div className="min-w-0">
              <Eyebrow dark>Legal</Eyebrow>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">{doc.title}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">{doc.summary}</p>
              <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1 text-xs font-medium text-slate-300 ring-1 ring-white/10">
                <Icon name="calendar_today" className="w-3.5 h-3.5" /> Effective {LEGAL.effectiveDate}
              </p>
            </div>
          </div>
          <div className="mt-8"><DocTabs current={slug} /></div>
        </div>
      </section>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <div className="lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-10">
          {/* Table of contents */}
          <aside className="mb-6 lg:mb-0">
            <details className="group rounded-2xl border border-slate-200 bg-white lg:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-slate-800">
                <span className="inline-flex items-center gap-2"><Icon name="toc" className="w-4 h-4 text-green-600" /> On this page</span>
                <Icon name="expand_more" className="w-5 h-5 text-slate-400 transition-transform group-open:rotate-180" />
              </summary>
              <ol className="border-t border-slate-100 px-2 py-2">
                {sections.map((s, i) => (
                  <li key={s.id}><a href={`#${s.id}`} className="flex gap-2 rounded-lg px-2 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900"><span className="w-5 shrink-0 text-slate-400 tabular-nums">{i + 1}.</span>{s.title}</a></li>
                ))}
              </ol>
            </details>
            <nav aria-label="On this page" className="hidden lg:block sticky top-24">
              <p className="px-3 text-xs font-bold uppercase tracking-widest text-slate-400">On this page</p>
              <ol className="mt-3 space-y-0.5 border-l border-slate-200">
                {sections.map((s, i) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className="-ml-px flex gap-2 border-l-2 border-transparent py-1.5 pl-3 pr-2 text-sm text-slate-500 hover:border-[#25D366] hover:text-slate-900">
                      <span className="w-5 shrink-0 text-slate-400 tabular-nums">{i + 1}.</span>{s.title}
                    </a>
                  </li>
                ))}
              </ol>
              <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-900">Questions?</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">We usually reply within one business day.</p>
                <a href={`mailto:${LEGAL.email}`} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-green-700 hover:text-green-800 break-all">
                  <Icon name="mail" className="w-4 h-4" /> {LEGAL.email}
                </a>
              </div>
            </nav>
          </aside>

          {/* Document */}
          <article className="min-w-0 space-y-5">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
              <div className="space-y-4">{intro}</div>
            </div>
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} className="scroll-mt-24 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
                <h2 className="flex items-start gap-3 text-lg font-bold text-slate-900 sm:text-xl">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-green-50 text-sm font-bold text-green-700 tabular-nums">{i + 1}</span>
                  <span className="pt-0.5">{s.title}</span>
                </h2>
                <div className="mt-4 space-y-4">{s.body}</div>
              </section>
            ))}
            <div className="flex flex-col gap-3 rounded-3xl bg-slate-900 p-5 text-slate-300 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <p className="text-sm">Still have a question about this policy?</p>
              <a href={`mailto:${LEGAL.email}`} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-[#2fe076]">
                <Icon name="mail" className="w-4 h-4" /> Contact us
              </a>
            </div>
            <a href="#top" className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-600">
              <Icon name="arrow_upward" className="w-3.5 h-3.5" /> Back to top
            </a>
          </article>
        </div>
      </main>
    </LegalFrame>
  );
}
