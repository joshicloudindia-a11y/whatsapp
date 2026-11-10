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
    id: "eligibility",
    title: "Refund eligibility",
    body: (
      <>
        <P>We issue a full refund when:</P>
        <UL items={[
          <><B>First purchase:</B> you ask within 7 days of your first payment for a paid plan, and you have not used it substantially (for example, you have not sent a broadcast to more than 1,000 recipients).</>,
          <><B>Duplicate or wrong charge:</B> you were charged twice, or charged an amount different from what you approved.</>,
          <><B>Service failure:</B> your plan could not be activated, or the Service was unavailable for most of the billing period because of a fault on our side.</>,
        ]} />
        <P>Otherwise, payments are not refundable. This includes renewals, unused time after a mid-period cancellation, and downgrades.</P>
        <P>
          Decisions made by Meta, such as rejecting a message template, a display name or a WhatsApp Business Account, limiting messaging,
          or restricting a phone number, are outside our control. On their own, they are not grounds for a refund, except within the 7-day
          first-purchase window above.
        </P>
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
    title: "How to request a refund",
    body: (
      <UL items={[
        <>Email <Mail /> from the email address of your account, with the subject &ldquo;Refund request&rdquo;.</>,
        "Include your organization name, the payment date and amount, and the payment or invoice ID.",
        "We confirm receipt within 2 business days and tell you our decision within 7 business days.",
        "Approved refunds go back to the original payment method through our payment partner (Razorpay). They usually reach your account within 5 to 7 business days, depending on your bank.",
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
          We want you to be happy with {LEGAL.brand}. This policy explains how plans are delivered, how to cancel, and when you can get a
          refund.
        </P>
      }
    />
  );
}
