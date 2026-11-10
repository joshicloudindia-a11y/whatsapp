import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { Eyebrow } from "@/components/landing/brand";
import { LegalFrame } from "@/components/legal/legal-shell";
import { LEGAL, LEGAL_DOCS } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Legal · ChatFlow",
  description: "ChatFlow policies: privacy, terms, refunds, acceptable use, cookies and data deletion.",
};
export const revalidate = 86400;

export default async function LegalHubPage() {
  const year = new Date().getFullYear();
  return (
    <LegalFrame year={year}>
      <section className="relative overflow-hidden bg-slate-950">
        <div aria-hidden className="pointer-events-none absolute -top-32 right-0 h-80 w-80 rounded-full bg-[#25D366]/20 blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <Eyebrow dark>Legal center</Eyebrow>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">Policies &amp; terms</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
            Everything about how {LEGAL.brand} works, how we protect your data, and the rules that keep WhatsApp messaging trustworthy.
          </p>
        </div>
      </section>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {LEGAL_DOCS.map((d) => (
            <li key={d.slug}>
              <Link href={`/${d.slug}`}
                className="group flex h-full flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-green-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366] sm:p-6">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-green-50 text-green-600 transition group-hover:bg-[#25D366] group-hover:text-white">
                  <Icon name={d.icon} className="w-5 h-5" />
                </span>
                <h2 className="mt-4 text-base font-bold text-slate-900">{d.title}</h2>
                <p className="mt-1.5 flex-1 text-sm leading-6 text-slate-500">{d.summary}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-green-700">
                  Read policy <Icon name="arrow_forward" className="w-4 h-4 transition group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-8 flex flex-col gap-3 rounded-3xl bg-slate-900 p-5 text-slate-300 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <p className="text-sm font-semibold text-white">Need help with a legal or privacy question?</p>
            <p className="text-xs text-slate-400 mt-0.5">Effective {LEGAL.effectiveDate}</p>
          </div>
          <a href={`mailto:${LEGAL.email}`} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-[#2fe076]">
            <Icon name="mail" className="w-4 h-4" /> {LEGAL.email}
          </a>
        </div>
      </main>
    </LegalFrame>
  );
}
