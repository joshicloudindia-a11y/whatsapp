import type { Metadata } from "next";
import { B, Callout, LegalPage, Mail, P, UL, type LegalSection } from "@/components/legal/legal-shell";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy · ChatFlow",
  description: "How ChatFlow subscriptions, cancellations, refunds and service delivery work.",
};
export const revalidate = 86400;

const sections: LegalSection[] = [
  {
    id: "delivery",
    title: "Service delivery",
    body: (
      <P>
        {LEGAL.brand}{" "}is a software-as-a-service product delivered online. No physical goods are shipped. Your plan is activated on your
        account as soon as the payment is confirmed, usually within a few minutes. If your plan isn&apos;t active within 24 hours of a
        successful payment, contact us at <Mail />.
      </P>
    ),
  },
  {
    id: "billing",
    title: "Billing cycle",
    body: (
      <UL items={[
        "Paid plans are billed in advance, monthly or yearly, and renew automatically until you cancel.",
        "Upgrades take effect immediately. Downgrades take effect from your next billing period.",
        "GST and other applicable taxes are shown on your invoice.",
      ]} />
    ),
  },
  {
    id: "cancellation",
    title: "Cancelling your subscription",
    body: (
      <>
        <UL items={[
          <>Organization admins can cancel at any time from <B>Settings → My Subscription</B>, or by emailing <Mail />.</>,
          "When you cancel, auto-renewal stops. You keep access to paid features until the end of the period you have already paid for.",
          "After that, your organization moves to the free plan, if one is available, or your paid features are paused. Your data is not deleted when you cancel.",
        ]} />
      </>
    ),
  },
  {
    id: "no-refunds",
    title: "No refunds",
    body: (
      <>
        <Callout tone="amber" icon="block">
          <B>All payments to {LEGAL.brand} are final and non-refundable.</B> This includes first purchases, renewals, upgrades,
          unused time after cancellation, downgrades, and partially used billing periods.
        </Callout>
        <P>
          Before you buy, please use the free plan or trial (where available) to check that {LEGAL.brand}{" "}meets your needs. If you
          don&apos;t want to continue, cancel before your next renewal date, and you won&apos;t be charged again.
        </P>
        <P>
          Decisions made by Meta, such as rejecting a message template, a display name or a WhatsApp Business Account, limiting messaging,
          or restricting a phone number, are outside our control and are not grounds for a refund.
        </P>
      </>
    ),
  },
  {
    id: "payment-errors",
    title: "Duplicate or failed payments",
    body: (
      <>
        <P>A payment error is not a refund. If one of these happens, we return the extra amount in full:</P>
        <UL items={[
          <><B>Duplicate charge:</B> you were charged more than once for the same plan and period.</>,
          <><B>Failed activation:</B> money was debited, but your plan was not activated within 24 hours.</>,
          <><B>Wrong amount:</B> you were charged a different amount from the one shown at checkout.</>,
        ]} />
        <P>Failed transactions are often reversed automatically by your bank or by our payment partner (Razorpay), as RBI timelines require.</P>
      </>
    ),
  },
  {
    id: "meta-fees",
    title: "WhatsApp (Meta) charges",
    body: (
      <Callout tone="amber" icon="info">
        WhatsApp messaging and conversation fees are charged by Meta directly to the payment method on your WhatsApp Business Account.
        {" "}{LEGAL.brand} does not collect these fees and cannot refund them. Please contact Meta for billing questions about these charges.
        If your plan includes prepaid messaging credits bought through {LEGAL.brand}, unused credits carry forward while your account is
        active and are not refundable or exchangeable for cash.
      </Callout>
    ),
  },
  {
    id: "how-to",
    title: "Reporting a payment error",
    body: (
      <UL items={[
        <>Email <Mail /> from the email address of your account, with the subject &ldquo;Payment issue&rdquo;.</>,
        "Include your organization name, the payment date and amount, and the payment or invoice ID.",
        "We confirm receipt within 2 business days and resolve verified payment errors within 7 business days.",
        "Amounts we return go back to the original payment method through our payment partner (Razorpay). They usually reach your account within 5 to 7 business days, depending on your bank.",
        "Please contact us before raising a chargeback or payment dispute with your bank. We can usually resolve the issue faster.",
      ]} />
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
        <p className="font-semibold text-slate-900">{LEGAL.entity || LEGAL.brand}</p>
        <p>Email: <Mail /></p>
        {LEGAL.address && <p>Address: {LEGAL.address}</p>}
        <p>Website: <a href={LEGAL.site} className="text-green-700 hover:underline">{LEGAL.domain}</a></p>
      </div>
    ),
  },
];

export default async function RefundPolicyPage() {
  const year = new Date().getFullYear();
  return (
    <LegalPage
      slug="refund-policy"
      year={year}
      sections={sections}
      intro={
        <P>
          This policy explains how {LEGAL.brand} plans are delivered and billed, how to cancel, and what happens if there is a payment
          error. Please read it before you buy. All payments are non-refundable.
        </P>
      }
    />
  );
}
