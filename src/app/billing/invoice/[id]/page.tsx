import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgMember } from "@/lib/org-auth";
import { LEGAL } from "@/lib/legal";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { PROVIDER_LABEL, formatPaymentAmount, formatPaymentDate, paymentStatusBadge } from "@/lib/payment-format";
import { PrintButton } from "./print-button";

export const metadata: Metadata = {
  title: "Invoice — ChatFlow",
  robots: { index: false, follow: false },
};

const BACK_HREF = "/settings?tab=billing";

/**
 * Printable invoice. Lives outside the (dashboard) layout so the printed page has no app chrome.
 * The proxy already requires a session; here we also require an active ADMIN / BILLING_MANAGER
 * member of the organization that owns the payment.
 */
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const member = await getOrgMember();
  if (!member) redirect(`/login?callbackUrl=${encodeURIComponent(`/billing/invoice/${id}`)}`);

  if (member.role !== "ADMIN" && member.role !== "BILLING_MANAGER") {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-slate-100 px-4 text-center">
        <div className="max-w-sm">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50">
            <Icon name="lock" className="w-6 h-6 text-amber-600" />
          </span>
          <h1 className="mt-4 text-lg font-bold text-slate-900">Invoices are restricted</h1>
          <p className="mt-1 text-sm text-slate-500">Only organization admins and billing managers can view invoices.</p>
          <Link href="/dashboard" className="mt-4 inline-block text-sm font-semibold text-green-700 hover:underline">Back to dashboard</Link>
        </div>
      </div>
    );
  }

  const payment = await prisma.payment.findFirst({
    where: { id, organizationId: member.organizationId },
    include: { organization: { select: { name: true, website: true } } },
  });
  if (!payment) notFound();

  const status = paymentStatusBadge(payment.status);
  const amount = formatPaymentAmount(payment.amount, payment.currency);
  const intervalLabel = payment.interval === "annual" ? "Annual" : payment.interval === "monthly" ? "Monthly" : payment.interval;
  const planLine = [payment.plan, intervalLabel].filter(Boolean).join(" · ") || "Subscription";
  const siteHost = LEGAL.site.replace(/^https?:\/\//, "").replace(/\/$/, "");

  return (
    <div className="min-h-dvh bg-slate-100 px-4 py-6 sm:py-10 print:bg-white print:p-0">
      <style>{`@page { size: A4; margin: 14mm; } @media print { html, body { background: #fff !important; height: auto !important; } }`}</style>

      <div className="mx-auto mb-4 flex max-w-3xl flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={BACK_HREF} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900">
          <Icon name="arrow_back" className="w-[18px] h-[18px]" /> Back to billing
        </Link>
        <PrintButton />
      </div>

      <article className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
        {/* Header */}
        <header className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-2xl font-extrabold tracking-tight text-slate-900">{LEGAL.brand}</p>
            <p className="mt-0.5 text-xs text-slate-500">{siteHost}</p>
          </div>
          <div className="sm:text-right">
            <h1 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Invoice</h1>
            <p className="mt-1 text-lg font-bold text-slate-900 tabular-nums">{payment.invoiceNumber}</p>
            <p className="mt-0.5 text-sm text-slate-500">Date: {formatPaymentDate(payment.paidAt)}</p>
            <span className={cn("mt-2 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold print:border print:border-slate-300", status.cls)}>{status.label}</span>
          </div>
        </header>

        {/* Parties */}
        <section className="mt-8 grid gap-6 border-t border-slate-100 pt-6 sm:grid-cols-2">
          <div>
            <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">From</h2>
            <p className="mt-2 text-sm font-semibold text-slate-900">{LEGAL.entity || LEGAL.brand}</p>
            {LEGAL.entity && <p className="text-sm text-slate-600">Operator of {LEGAL.brand}</p>}
            {LEGAL.address && <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{LEGAL.address}</p>}
            <p className="mt-1 text-sm text-slate-600">{LEGAL.email}</p>
            <p className="text-sm text-slate-600">{LEGAL.site}</p>
          </div>
          <div className="sm:text-right">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Billed to</h2>
            <p className="mt-2 text-sm font-semibold text-slate-900">{payment.organization.name}</p>
            {payment.organization.website && <p className="text-sm text-slate-600 break-all">{payment.organization.website}</p>}
          </div>
        </section>

        {/* Line item */}
        <section className="mt-8">
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="grid grid-cols-[1fr_auto] gap-4 bg-slate-50 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <span>Description</span>
              <span className="text-right">Amount</span>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-4 px-4 py-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">{planLine}</p>
                {payment.description && <p className="mt-0.5 text-sm text-slate-500">{payment.description}</p>}
              </div>
              <p className="text-right text-sm font-semibold text-slate-900 tabular-nums">{amount}</p>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-4 border-t border-slate-200 bg-slate-50 px-4 py-3">
              <span className="text-sm font-bold text-slate-900">Amount paid</span>
              <span className="text-right text-base font-extrabold text-slate-900 tabular-nums">{amount}</span>
            </div>
          </div>
        </section>

        {/* Payment details */}
        <section className="mt-8">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Payment details</h2>
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-3 sm:block">
              <dt className="text-slate-500">Payment provider</dt>
              <dd className="font-medium text-slate-900">{PROVIDER_LABEL[payment.provider] ?? payment.provider}</dd>
            </div>
            <div className="flex justify-between gap-3 sm:block">
              <dt className="text-slate-500">Payment ID</dt>
              <dd className="font-mono text-xs text-slate-900 break-all">{payment.providerPaymentId}</dd>
            </div>
            <div className="flex justify-between gap-3 sm:block">
              <dt className="text-slate-500">Status</dt>
              <dd className="font-medium text-slate-900">{status.label}</dd>
            </div>
            <div className="flex justify-between gap-3 sm:block">
              <dt className="text-slate-500">Currency</dt>
              <dd className="font-medium text-slate-900">{payment.currency.toUpperCase()}</dd>
            </div>
          </dl>
        </section>

        <footer className="mt-10 border-t border-slate-100 pt-4 text-xs leading-relaxed text-slate-500">
          <p>
            The amount shown is the total amount paid, as charged by the payment provider. Any applicable taxes are included or excluded
            exactly as charged at the time of payment; no separate tax breakdown is shown on this invoice.
          </p>
          <p className="mt-2">Questions about this invoice? Contact {LEGAL.email}.</p>
        </footer>
      </article>
    </div>
  );
}
