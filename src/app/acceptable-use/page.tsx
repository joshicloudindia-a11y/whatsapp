import type { Metadata } from "next";
import { B, Callout, LegalPage, Mail, P, UL, type LegalSection } from "@/components/legal/legal-shell";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Acceptable Use Policy · ChatFlow",
  description: "Messaging and platform rules for using ChatFlow and the WhatsApp Business Platform responsibly.",
};
export const revalidate = 86400;

const sections: LegalSection[] = [
  {
    id: "opt-in",
    title: "Message only people who opted in",
    body: (
      <UL items={[
        "Before you send WhatsApp messages to someone, get their clear opt-in to receive messages from your business on WhatsApp.",
        "Make it clear who you are and what kind of messages they will receive.",
        "Do not use bought, rented, scraped or shared contact lists.",
        "Keep records of opt-in, and show them to us or Meta if asked.",
      ]} />
    ),
  },
  {
    id: "opt-out",
    title: "Honour opt-outs immediately",
    body: (
      <>
        <P>
          When a contact asks to stop receiving messages, stop messaging them. {LEGAL.brand} automatically marks contacts as opted out when
          they reply <B>STOP</B>, and opts them back in when they reply <B>START</B>. Opted-out contacts are skipped in broadcasts.
        </P>
        <P>Do not try to get around this, for example by re-importing an opted-out contact or moving them to another number.</P>
      </>
    ),
  },
  {
    id: "content",
    title: "Prohibited content",
    body: (
      <>
        <P>You may not use {LEGAL.brand} to send, promote or sell:</P>
        <UL items={[
          "Illegal goods or services, drugs, prescription medicines without authorisation, tobacco, or alcohol where it is restricted.",
          "Weapons, ammunition or explosives.",
          "Real-money gambling, betting or lotteries, except where licensed and permitted by Meta.",
          "Adult or sexually explicit content, or dating services that Meta prohibits.",
          "Fraud, scams, phishing, fake schemes that promise quick money, or deceptive financial products.",
          "Content that is hateful, harassing, threatening, violent or discriminatory.",
          "Content that infringes someone else's intellectual property or privacy.",
          "Malware, or links that harm devices or steal data.",
          "Anything else that WhatsApp's Business Messaging Policy or Commerce Policy prohibits.",
        ]} />
      </>
    ),
  },
  {
    id: "messaging-quality",
    title: "Good messaging practices",
    body: (
      <UL items={[
        "Send messages that are relevant and expected. Low quality ratings and blocks can get your number limited by Meta.",
        "Use the right template category: marketing, utility or authentication. Do not disguise promotions as utility messages.",
        "Respect the 24-hour customer service window. Outside it, use approved templates.",
        "Do not impersonate another person, business or brand, and do not misrepresent your identity.",
      ]} />
    ),
  },
  {
    id: "platform",
    title: "Protecting the platform",
    body: (
      <UL items={[
        "Do not try to gain unauthorised access to accounts, data or systems. Do not probe, scan or test our security without written permission.",
        "Do not overload the Service, get around rate limits, or interfere with other customers.",
        "Do not scrape, copy or reverse engineer the Service, or resell it without an agreement with us.",
        "Do not share accounts, API keys or access tokens outside your organization.",
      ]} />
    ),
  },
  {
    id: "enforcement",
    title: "Enforcement and reporting",
    body: (
      <>
        <P>
          If we believe this policy has been broken, we may remove content, pause broadcasts, limit features, or suspend or close the
          account. Where appropriate, we will notify you first. Meta may also take action on your number or WhatsApp Business Account on
          its own.
        </P>
        <Callout icon="flag">
          To report abuse or spam sent through {LEGAL.brand}, email <Mail /> with the sending number, the date and a screenshot.
        </Callout>
      </>
    ),
  },
];

export default async function AcceptableUsePage() {
  const year = new Date().getFullYear();
  return (
    <LegalPage
      slug="acceptable-use"
      year={year}
      sections={sections}
      intro={
        <P>
          This policy describes what you can and cannot do with {LEGAL.brand}. It works together with our Terms of Service and
          WhatsApp&apos;s Business Messaging and Commerce policies. Following it protects your customers, your number&apos;s quality
          rating and your WhatsApp Business Account.
        </P>
      }
    />
  );
}
