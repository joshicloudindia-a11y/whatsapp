import type { Metadata } from "next";
import { B, DocLink, LegalPage, P, UL, type LegalSection } from "@/components/legal/legal-shell";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Cookie Policy · ChatFlow",
  description: "The cookies and similar technologies ChatFlow uses and how to control them.",
};
export const revalidate = 86400;

const COOKIES: { name: string; purpose: string; type: string; duration: string }[] = [
  { name: "next-auth.session-token", purpose: "Keeps you signed in, securely.", type: "Essential", duration: "Up to 30 days" },
  { name: "next-auth.csrf-token", purpose: "Protects sign-in forms against cross-site request forgery.", type: "Essential", duration: "Session" },
  { name: "next-auth.callback-url", purpose: "Returns you to the right page after you sign in.", type: "Essential", duration: "Session" },
  { name: "Local storage", purpose: "Remembers interface preferences, such as open panels.", type: "Preference", duration: "Until cleared" },
];

const sections: LegalSection[] = [
  {
    id: "what",
    title: "What cookies are",
    body: (
      <P>
        Cookies are small text files that a website stores in your browser. We also use similar browser storage, such as local storage.
        They help a site remember things, for example that you are signed in.
      </P>
    ),
  },
  {
    id: "which",
    title: "Cookies we use",
    body: (
      <>
        <P>We keep cookies to a minimum. We do not use advertising or cross-site tracking cookies.</P>
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-1 py-2 font-semibold">Name</th>
                <th className="px-1 py-2 font-semibold">Purpose</th>
                <th className="px-1 py-2 font-semibold">Type</th>
                <th className="px-1 py-2 font-semibold">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-600">
              {COOKIES.map((c) => (
                <tr key={c.name}>
                  <td className="px-1 py-3 font-mono text-xs text-slate-800">{c.name}</td>
                  <td className="px-1 py-3">{c.purpose}</td>
                  <td className="px-1 py-3">
                    <span className={c.type === "Essential" ? "rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700" : "rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600"}>{c.type}</span>
                  </td>
                  <td className="px-1 py-3 whitespace-nowrap">{c.duration}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <P>On secure (HTTPS) connections, these cookie names may start with a <code className="rounded bg-slate-100 px-1 text-xs">__Secure-</code> or <code className="rounded bg-slate-100 px-1 text-xs">__Host-</code> prefix.</P>
      </>
    ),
  },
  {
    id: "third-party",
    title: "Third-party services",
    body: (
      <UL items={[
        <><B>Google Fonts:</B> loads the icon font. Google may receive your IP address to deliver it.</>,
        <><B>Meta (Facebook) SDK:</B> loads only when an organization admin clicks &ldquo;Connect with Facebook&rdquo; to link a WhatsApp number. Meta may then set its own cookies under its own policies.</>,
        <><B>Payment partner (Razorpay):</B> may set cookies on its checkout to prevent fraud and process your payment.</>,
      ]} />
    ),
  },
  {
    id: "control",
    title: "Managing cookies",
    body: (
      <P>
        You can block or delete cookies in your browser settings. Essential cookies are needed to sign in, so blocking them will stop
        {" "}{LEGAL.brand} from working properly. To learn more about how we handle personal data, see our <DocLink slug="privacy">Privacy Policy</DocLink>.
      </P>
    ),
  },
];

export default async function CookiePolicyPage() {
  const year = new Date().getFullYear();
  return (
    <LegalPage
      slug="cookie-policy"
      year={year}
      sections={sections}
      intro={<P>This policy explains which cookies {LEGAL.brand} uses, why we use them, and how you can control them.</P>}
    />
  );
}
