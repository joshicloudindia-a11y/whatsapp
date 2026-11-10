import type { Metadata } from "next";
import { B, Callout, DocLink, LegalPage, Mail, P, UL, type LegalSection } from "@/components/legal/legal-shell";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy · ChatFlow",
  description: "How ChatFlow collects, uses, shares and protects personal data, including data received through the WhatsApp Business Platform.",
};
export const revalidate = 86400;

const sections: LegalSection[] = [
  {
    id: "who-we-are",
    title: "Who we are and our role",
    body: (
      <>
        <P>
          {LEGAL.brand} ({LEGAL.domain}){LEGAL.entity ? <>, operated by {LEGAL.entity}</> : null}, is a software platform that helps businesses
          communicate with their customers on WhatsApp through Meta&apos;s official WhatsApp Business Platform.
        </P>
        <UL items={[
          <><B>Account data</B> (you, your team and your organization): we decide how this data is used, so we act as the Data Fiduciary (data controller).</>,
          <><B>Customer data</B> (your contacts, their messages, media and call details): you decide how this data is used, so your business is the Data Fiduciary and we process it on your behalf as a Data Processor.</>,
        ]} />
      </>
    ),
  },
  {
    id: "data-we-collect",
    title: "Information we collect",
    body: (
      <>
        <UL items={[
          <><B>Account information:</B> name, email address, password (stored only as a secure hash), role, and invitations you send or accept.</>,
          <><B>Organization information:</B> business name, website, plan and billing details such as GSTIN where you provide it.</>,
          <><B>WhatsApp Business data received from Meta:</B> your WhatsApp Business Account ID, phone number ID, display name, quality rating, messaging limits, the access token you authorise, message templates, and business profile details.</>,
          <><B>Messaging data:</B> contact names and phone numbers, inbound and outbound messages, media, reactions, delivery and read statuses, opt-in/opt-out status, and call logs (time, duration, status).</>,
          <><B>Contacts you upload:</B> lists you import, plus tags, notes and custom fields you add.</>,
          <><B>Payment information:</B> payments are processed by our payment partner (Razorpay). We receive confirmation of the payment, plan and amount. We never see or store your full card, UPI PIN or bank credentials.</>,
          <><B>Usage and device data:</B> IP address, browser and device type, pages used, sign-in times, and security events such as failed login attempts.</>,
          <><B>Support communications:</B> what you send us when you contact support.</>,
        ]} />
        <Callout icon="videocam">
          Video meetings run peer-to-peer over WebRTC. Audio and video go directly between participants and are not recorded or stored by {LEGAL.brand}.
          We only keep the meeting room details (title, code, times) needed to run it.
        </Callout>
      </>
    ),
  },
  {
    id: "how-we-use",
    title: "How we use information",
    body: (
      <UL items={[
        "To provide the service: show your shared inbox, send broadcasts, run chatbots and automations, and generate analytics.",
        "To connect and operate your WhatsApp number through the WhatsApp Business Platform (Cloud API and Business Management API).",
        "To process subscriptions, invoices and payments.",
        "To keep accounts secure: one-time passwords, account lockout after repeated failed logins, abuse detection and audit logs.",
        "To provide support and send service messages, such as security alerts, invoices and important changes.",
        "To comply with law, respond to lawful requests, and enforce our Terms and Acceptable Use Policy.",
        "To improve the product using aggregated, de-identified usage information.",
      ]} />
    ),
  },
  {
    id: "meta-data",
    title: "Data from Meta and WhatsApp",
    body: (
      <>
        <P>When you connect a WhatsApp number, we receive data from Meta Platforms, Inc. through its APIs. We handle this data as follows:</P>
        <UL items={[
          "We use it only to provide the features you request in ChatFlow.",
          "We do not sell it, and we do not use it for advertising or to build profiles of your customers.",
          "We do not share it with third parties except the service providers listed below, who process it on our behalf.",
          "We follow Meta's Platform Terms and the WhatsApp Business policies when handling it.",
          <>You can disconnect your number and request deletion at any time. See our <DocLink slug="data-deletion">Data Deletion</DocLink> page.</>,
        ]} />
      </>
    ),
  },
  {
    id: "legal-basis",
    title: "Consent and legal basis",
    body: (
      <>
        <P>
          We process account data on the basis of your consent and to perform our contract with you, as permitted under India&apos;s
          Digital Personal Data Protection Act, 2023 and the Information Technology Act, 2000 and its rules. We also process it for
          legitimate uses such as security and complying with law.
        </P>
        <P>
          For customer data, your business is responsible for having a valid basis for messaging each contact, including the
          WhatsApp opt-in that Meta requires. See our <DocLink slug="acceptable-use">Acceptable Use Policy</DocLink>.
        </P>
      </>
    ),
  },
  {
    id: "sharing",
    title: "How we share information",
    body: (
      <>
        <P>We do not sell personal data. We share it only with:</P>
        <UL items={[
          <><B>Meta / WhatsApp:</B> to send and receive messages, manage templates, numbers and calls on your behalf.</>,
          <><B>Infrastructure providers:</B> cloud hosting (Vercel) and our managed database (TiDB Cloud), which store and process data for us under contract.</>,
          <><B>Payment partner:</B> Razorpay, to process subscription payments.</>,
          <><B>Email delivery:</B> to send account emails such as verification, invitations and one-time passwords.</>,
          <><B>Authorities:</B> when required by law or a valid legal order, or to protect the rights, safety and property of our users or the public.</>,
          <><B>Business transfers:</B> to a successor if we are involved in a merger, acquisition or sale of assets. This policy will continue to protect your data.</>,
        ]} />
      </>
    ),
  },
  {
    id: "retention",
    title: "How long we keep data",
    body: (
      <UL items={[
        "Account and organization data: for as long as your account is active.",
        "Messages, contacts and media: for as long as your organization keeps them, until you delete them or close your account.",
        "After you close your account: we delete or anonymise personal data within 30 days, except where we must keep it longer.",
        "Invoices and payment records: for the period required by Indian tax and accounting laws.",
        "Security and audit logs: for up to 12 months, unless they are needed to investigate an incident.",
      ]} />
    ),
  },
  {
    id: "security",
    title: "How we protect data",
    body: (
      <UL items={[
        "All traffic is encrypted in transit with HTTPS/TLS.",
        "Passwords are stored only as salted bcrypt hashes.",
        "Every incoming webhook from Meta is checked for a valid signature.",
        "Administrator access needs email one-time passwords, has role-based permissions, and is recorded in audit logs.",
        "Data is separated per organization, and access is limited to the people who need it.",
        "We keep monitoring and improving our safeguards. No system is perfectly secure, and we will notify you and the authorities of a personal data breach as the law requires.",
      ]} />
    ),
  },
  {
    id: "transfers",
    title: "Where data is processed",
    body: (
      <P>
        Our service providers, including Meta, may process data on servers outside India. Where this happens, we rely on providers
        that offer appropriate safeguards, and we transfer data only as permitted under Indian law.
      </P>
    ),
  },
  {
    id: "your-rights",
    title: "Your rights",
    body: (
      <>
        <P>Subject to applicable law, you can:</P>
        <UL items={[
          "Ask for a summary of the personal data we hold about you and how we process it.",
          "Correct, complete or update inaccurate data. Most details can be edited in Settings.",
          "Ask us to erase your data, or withdraw consent. This may mean we can no longer provide the service.",
          "Nominate another person to exercise your rights if you die or become incapacitated.",
          "Raise a grievance with us, and then escalate it to the Data Protection Board of India.",
        ]} />
        <P>
          To exercise these rights, email <Mail />. If you are a customer of a business that uses {LEGAL.brand}, please contact that
          business first. We will help them respond to you.
        </P>
      </>
    ),
  },
  {
    id: "children",
    title: "Children",
    body: (
      <P>
        {LEGAL.brand} is a business tool and is not meant for anyone under 18. We do not knowingly collect personal data from children.
        If you believe a child has given us data, contact us and we will delete it.
      </P>
    ),
  },
  {
    id: "cookies",
    title: "Cookies",
    body: <P>We use a small number of essential cookies to keep you signed in and secure. See our <DocLink slug="cookie-policy">Cookie Policy</DocLink>.</P>,
  },
  {
    id: "grievance",
    title: "Grievance Officer",
    body: (
      <>
        <P>
          In line with the Information Technology Act, 2000 and the Digital Personal Data Protection Act, 2023, you can contact our
          Grievance Officer about how your personal data is handled:
        </P>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
          <p className="font-semibold text-slate-900">Grievance Officer, {LEGAL.entity || LEGAL.brand}</p>
          <p>Email: <Mail to={LEGAL.grievanceEmail} /></p>
          {LEGAL.address && <p>Address: {LEGAL.address}</p>}
          <p className="mt-1 text-slate-500">We acknowledge grievances within 48 hours and aim to resolve them within 30 days.</p>
        </div>
      </>
    ),
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: (
      <P>
        We may update this policy from time to time. For material changes, we will notify account owners by email or in the app before
        the changes take effect. The &ldquo;Effective&rdquo; date at the top always shows the latest version.
      </P>
    ),
  },
];

export default async function PrivacyPage() {
  const year = new Date().getFullYear();
  return (
    <LegalPage
      slug="privacy"
      year={year}
      sections={sections}
      intro={
        <>
          <P>
            Your privacy matters to us. This policy explains what personal data {LEGAL.brand} collects when you use our website and
            platform, how we use and protect it, and the choices you have.
          </P>
          <Callout icon="verified_user">
            <B>In short:</B> we use your data only to run {LEGAL.brand}{" "}for you. We never sell it, and we never use your customers&apos;
            WhatsApp data for advertising.
          </Callout>
        </>
      }
    />
  );
}
