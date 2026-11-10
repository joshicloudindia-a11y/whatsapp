import type { Metadata } from "next";
import { B, Callout, DocLink, LegalPage, Mail, P, UL, type LegalSection } from "@/components/legal/legal-shell";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms of Service · ChatFlow",
  description: "The terms that govern your use of the ChatFlow WhatsApp Business platform.",
};
export const revalidate = 86400;

const sections: LegalSection[] = [
  {
    id: "acceptance",
    title: "Agreement to these terms",
    body: (
      <>
        <P>
          These Terms of Service (&ldquo;Terms&rdquo;) are an agreement between you and {LEGAL.entity || LEGAL.brand} (&ldquo;{LEGAL.brand}&rdquo;,
          &ldquo;we&rdquo;, &ldquo;us&rdquo;). They govern your use of {LEGAL.site} and the {LEGAL.brand}{" "}platform (the &ldquo;Service&rdquo;).
        </P>
        <P>
          By creating an account, or by using the Service, you agree to these Terms, our <DocLink slug="privacy">Privacy Policy</DocLink> and
          our <DocLink slug="acceptable-use">Acceptable Use Policy</DocLink>. If you accept on behalf of a business, you confirm that you have
          the authority to bind that business.
        </P>
      </>
    ),
  },
  {
    id: "accounts",
    title: "Eligibility and accounts",
    body: (
      <UL items={[
        "You must be at least 18 years old and able to enter into a binding contract under Indian law.",
        "Keep your account details accurate and your password confidential. You are responsible for all activity under your account and your organization's team members.",
        "Organization admins control who can join their organization, and which roles and permissions each member has.",
        <>Tell us immediately at <Mail /> if you suspect unauthorised access.</>,
      ]} />
    ),
  },
  {
    id: "service",
    title: "The Service",
    body: (
      <>
        <P>
          {LEGAL.brand} gives you tools to use the WhatsApp Business Platform. These include a shared team inbox, contacts, message templates,
          broadcasts, chatbots, automations, analytics, calling, video meetings, and a developer API with webhooks.
        </P>
        <P>
          Features depend on your plan and may change as we improve the product. We may add, change or remove features. If a change
          materially reduces a paid feature you rely on, we will give you reasonable notice.
        </P>
      </>
    ),
  },
  {
    id: "whatsapp",
    title: "WhatsApp and Meta",
    body: (
      <>
        <UL items={[
          "Your use of WhatsApp through the Service is also governed by Meta's WhatsApp Business Terms of Service, WhatsApp Business Messaging Policy and WhatsApp Commerce Policy. You must comply with them.",
          "Meta decides whether to approve your business, display name, phone number and message templates. Meta can also limit, flag or disable your number or WhatsApp Business Account. We do not control these decisions.",
          "Meta charges WhatsApp messaging and conversation fees separately. These are billed by Meta to the payment method on your WhatsApp Business Account, and they are not included in your ChatFlow subscription unless your plan says so.",
          "You authorise us to access your WhatsApp Business Account through the permissions you grant, only to provide the Service. You can revoke this access at any time.",
        ]} />
        <Callout tone="amber" icon="info">
          {LEGAL.brand} is an independent software provider. It is not owned, endorsed or sponsored by Meta Platforms, Inc. or WhatsApp LLC.
        </Callout>
      </>
    ),
  },
  {
    id: "responsibilities",
    title: "Your responsibilities",
    body: (
      <UL items={[
        "Get valid opt-in consent before sending WhatsApp messages to anyone, and honour opt-out requests promptly. ChatFlow handles STOP/START keywords automatically.",
        "Make sure every message, template and file you send is lawful, accurate and not misleading, and that you have the right to use it.",
        <>Don&apos;t use the Service for anything our <DocLink slug="acceptable-use">Acceptable Use Policy</DocLink> prohibits, including spam, fraud and illegal goods.</>,
        "Follow applicable laws, including the Information Technology Act, 2000, the Digital Personal Data Protection Act, 2023, consumer protection laws and TRAI regulations where they apply.",
        "Keep your API keys and access tokens secret, and rotate them if they may have been exposed.",
      ]} />
    ),
  },
  {
    id: "payment",
    title: "Plans, billing and taxes",
    body: (
      <>
        <UL items={[
          "Paid plans are billed in advance, monthly or yearly, in Indian Rupees unless stated otherwise. Prices exclude GST and other applicable taxes, which are added to your invoice.",
          "Subscriptions renew automatically at the end of each billing period until you cancel.",
          "If a payment fails, we may retry it, and we may limit or suspend paid features until the payment succeeds.",
          "We may change our prices. Changes apply from your next billing period, and we will notify you before they take effect.",
        ]} />
        <P>All payments are non-refundable, except for duplicate or failed payments. See our <DocLink slug="refund-policy">Refund &amp; Cancellation Policy</DocLink>.</P>
      </>
    ),
  },
  {
    id: "your-data",
    title: "Your content and data",
    body: (
      <>
        <P>
          You own the content and data you put into the Service, including contacts, messages, templates and media (&ldquo;Customer Data&rdquo;).
          You give us a limited licence to host, process and transmit Customer Data only to provide and secure the Service, and as our
          Privacy Policy describes.
        </P>
        <P>
          You are responsible for Customer Data and for having the rights and consents it needs. You can export or delete your data at
          any time while your account is active.
        </P>
      </>
    ),
  },
  {
    id: "ip",
    title: "Our intellectual property",
    body: (
      <P>
        The Service, its software, design and brand belong to us and our licensors. You may not copy, modify, resell, reverse engineer, or
        build a competing product from the Service, except as the law expressly permits. If you send us feedback, we may use it freely
        without any obligation to you.
      </P>
    ),
  },
  {
    id: "api",
    title: "API and integrations",
    body: (
      <P>
        If you use our API or webhooks, you must respect the documented rate limits and keep your keys secure. You are responsible for any
        systems you connect. We may throttle or revoke API access that threatens the stability or security of the Service.
      </P>
    ),
  },
  {
    id: "availability",
    title: "Availability and support",
    body: (
      <P>
        We work hard to keep the Service available, but we do not guarantee that it will be uninterrupted or error-free. Planned
        maintenance, third-party outages (including outages of the WhatsApp Business Platform) and events beyond our reasonable control may
        affect availability. Support is available by email at <Mail />.
      </P>
    ),
  },
  {
    id: "termination",
    title: "Suspension and termination",
    body: (
      <UL items={[
        "You can stop using the Service and close your account at any time.",
        "We may suspend or terminate access if you materially breach these Terms or the Acceptable Use Policy, fail to pay, or create a security, legal or reputational risk for us or other users. Where reasonable, we will notify you first and give you a chance to fix the problem.",
        <>After termination, you can request an export of your data for 30 days. After that, we delete it as described in our <DocLink slug="data-deletion">Data Deletion</DocLink> page.</>,
      ]} />
    ),
  },
  {
    id: "disclaimers",
    title: "Disclaimers",
    body: (
      <P>
        The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;. To the extent the law allows, we disclaim all implied
        warranties, including merchantability, fitness for a particular purpose and non-infringement. We do not guarantee message delivery,
        open rates or business results, and we do not guarantee any approval decisions made by Meta.
      </P>
    ),
  },
  {
    id: "liability",
    title: "Limitation of liability",
    body: (
      <P>
        To the extent the law allows, neither party is liable for indirect, incidental, special, consequential or punitive damages, or for
        lost profits, revenue or data. Our total liability for all claims relating to the Service is limited to the fees you paid us in the
        12 months before the event that gave rise to the claim. Nothing in these Terms limits liability that cannot be limited by law.
      </P>
    ),
  },
  {
    id: "indemnity",
    title: "Indemnity",
    body: (
      <P>
        You will defend and indemnify us against third-party claims arising from your Customer Data, your messages, or your breach of these
        Terms, the Acceptable Use Policy, Meta&apos;s policies or applicable law.
      </P>
    ),
  },
  {
    id: "law",
    title: "Governing law and disputes",
    body: (
      <P>
        These Terms are governed by the laws of {LEGAL.jurisdiction}. Both parties will first try to resolve a dispute in good faith by
        contacting each other. If a dispute is not resolved within 30 days, it will be subject to the exclusive jurisdiction of the
        competent courts in India.
      </P>
    ),
  },
  {
    id: "changes",
    title: "Changes to these terms",
    body: (
      <P>
        We may update these Terms. For material changes, we will notify account owners at least 15 days in advance by email or in the app.
        Continuing to use the Service after changes take effect means you accept them.
      </P>
    ),
  },
];

export default async function TermsPage() {
  const year = new Date().getFullYear();
  return (
    <LegalPage
      slug="terms"
      year={year}
      sections={sections}
      intro={
        <>
          <P>
            Thank you for choosing {LEGAL.brand}. Please read these Terms carefully. They explain your rights and responsibilities when you
            use our WhatsApp Business platform.
          </P>
          <Callout icon="gavel">
            <B>Key points:</B>{" "}message only people who opted in, follow WhatsApp&apos;s policies, and keep your account secure. You own your
            data, and you can cancel at any time.
          </Callout>
        </>
      }
    />
  );
}
