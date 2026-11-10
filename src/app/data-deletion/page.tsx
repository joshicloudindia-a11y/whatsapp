import type { Metadata } from "next";
import { B, Callout, DocLink, LegalPage, Mail, P, UL, type LegalSection } from "@/components/legal/legal-shell";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Data Deletion · ChatFlow",
  description: "How to delete your ChatFlow account and data, including data received through Meta and WhatsApp.",
};
export const revalidate = 86400;

const sections: LegalSection[] = [
  {
    id: "disconnect",
    title: "Disconnect a WhatsApp number",
    body: (
      <>
        <P>Organization admins can do this at any time, from inside {LEGAL.brand}:</P>
        <UL items={[
          <>Go to <B>Settings → WhatsApp</B>.</>,
          <>Click <B>Remove</B> next to the number.</>,
          "We immediately delete the stored access token and the number's connection details. Incoming messages to that number stop arriving in ChatFlow.",
        ]} />
      </>
    ),
  },
  {
    id: "remove-app",
    title: "Remove ChatFlow from your Facebook account",
    body: (
      <UL items={[
        <>On Facebook, open <B>Settings &amp; privacy → Settings → Business integrations</B>, or open <B>Meta Business Suite → Business settings → Integrations</B>.</>,
        <>Find <B>{LEGAL.brand}</B> and click <B>Remove</B>.</>,
        "This revokes our access to your WhatsApp Business Account. To also delete data we already hold, follow the steps below.",
      ]} />
    ),
  },
  {
    id: "request",
    title: "Request deletion of your account and data",
    body: (
      <>
        <UL items={[
          <>Email <Mail /> from the email address of your account, with the subject <B>&ldquo;Data deletion request&rdquo;</B>.</>,
          "Tell us whether you want your personal account deleted, or your whole organization (only organization admins can ask for this).",
          "To protect your data, we may ask you to confirm your identity.",
        ]} />
        <Callout icon="schedule">
          We confirm your request within <B>3 business days</B> and complete the deletion within <B>30 days</B>. We email you a confirmation
          with a reference number when it is done.
        </Callout>
      </>
    ),
  },
  {
    id: "what-is-deleted",
    title: "What we delete",
    body: (
      <UL items={[
        "Your profile, login details and team memberships.",
        "For an organization: WhatsApp connections and access tokens, contacts, conversations, messages, media, templates, broadcasts, chatbots, automations, API keys and webhooks.",
        "Data we received from Meta about your WhatsApp Business Account and phone numbers.",
      ]} />
    ),
  },
  {
    id: "what-we-keep",
    title: "What we may keep",
    body: (
      <UL items={[
        "Invoices and payment records, for the period that Indian tax and accounting laws require.",
        "Limited security and audit logs, for up to 12 months, to prevent fraud and abuse.",
        "Data we must keep to meet a legal obligation, or to establish or defend a legal claim.",
        "Backups are overwritten in their normal cycle, within 30 days.",
      ]} />
    ),
  },
  {
    id: "end-customers",
    title: "If you messaged a business that uses ChatFlow",
    body: (
      <P>
        The business you messaged controls your conversation data, so please ask that business to delete it first. You can also email
        {" "}<Mail /> with your phone number and the name of the business. We will pass your request to them and help them complete it.
        For more details, see our <DocLink slug="privacy">Privacy Policy</DocLink>.
      </P>
    ),
  },
];

export default async function DataDeletionPage() {
  const year = new Date().getFullYear();
  return (
    <LegalPage
      slug="data-deletion"
      year={year}
      sections={sections}
      intro={
        <P>
          You can delete your data from {LEGAL.brand} at any time. This page explains how to disconnect WhatsApp, remove our app from
          Facebook, and ask us to delete your account and data, including data we received from Meta.
        </P>
      }
    />
  );
}
