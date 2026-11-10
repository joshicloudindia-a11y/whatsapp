"use client";

import { Icon } from "@/components/ui/icon";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import axios from "axios";

const REASONS: Record<string, string> = {
  expired: "Your admin session expired. Please sign in again.",
  revoked: "Your admin session was ended by an administrator.",
  not_admin: "This account does not have admin panel access.",
  inactive: "This account is suspended.",
};

const inputCls =
  "w-full rounded-xl border border-white/10 bg-white/5 pl-11 pr-4 py-3 text-sm text-white placeholder:text-slate-500 " +
  "focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500/60";

/** "Mr. Harsh Parmal" → "Harsh" (skips honorifics). */
function firstName(name: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter((w) => !/^(mr|mrs|ms|miss|dr|shri|smt|sri)\.?$/i.test(w));
  return parts[0] || "there";
}

function initials(name: string | null, email: string) {
  const parts = (name ?? "").trim().split(/\s+/).filter((w) => w && !/^(mr|mrs|ms|miss|dr|shri|smt|sri)\.?$/i.test(w));
  return (parts.length ? parts.slice(0, 2).map((w) => w[0]).join("") : email[0]).toUpperCase();
}

function apiError(e: unknown) {
  return (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Something went wrong. Try again.";
}

export default function AdminLoginForm() {
  const params = useSearchParams();
  const rawCallback = params.get("callbackUrl") ?? "/admin";
  const callbackUrl = rawCallback.startsWith("/admin") && !rawCallback.startsWith("//") ? rawCallback : "/admin";
  const reason = params.get("reason");
  const staffKey = params.get("k");

  const [step, setStep] = useState<"credentials" | "otp">("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [challenge, setChallenge] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [error, setError] = useState<string | null>(reason ? REASONS[reason] ?? null : null);
  const [loading, setLoading] = useState(false);
  const [expiresAt, setExpiresAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  // Personal sign-in link for admin staff (?k=…): greet them and lock in their email.
  const [staff, setStaff] = useState<{ name: string | null; email: string; role: { name: string; color: string } } | null>(null);

  useEffect(() => {
    if (!staffKey) return;
    let alive = true;
    axios.get("/api/admin-auth/personal", { params: { k: staffKey } })
      .then(({ data }) => { if (alive) { setStaff(data); setEmail(data.email); } })
      .catch((e) => { if (alive) setError(apiError(e)); });
    return () => { alive = false; };
  }, [staffKey]);

  useEffect(() => {
    if (step !== "otp") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [step]);
  const secondsLeft = Math.max(0, Math.floor((expiresAt - now) / 1000));

  const requestCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await axios.post("/api/admin-auth/login", { email, password, ...(staffKey && { k: staffKey }) });
      setChallenge(data.challenge);
      setMaskedEmail(data.email);
      setExpiresAt(Date.now() + data.expiresInSeconds * 1000);
      setDigits(Array(6).fill(""));
      setStep("otp");
      setTimeout(() => boxes.current[0]?.focus(), 50);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  const verify = async (code: string) => {
    setError(null);
    setLoading(true);
    try {
      const res = await signIn("admin-otp", { challenge, code, redirect: false });
      if (res?.error || !res?.ok) {
        setError("Incorrect or expired code. After 5 wrong attempts the account is locked for 15 minutes.");
        setDigits(Array(6).fill(""));
        boxes.current[0]?.focus();
        return;
      }
      setPassword("");
      window.location.assign(callbackUrl);
    } finally {
      setLoading(false);
    }
  };

  const setDigit = (i: number, v: string) => {
    const clean = v.replace(/\D/g, "");
    if (clean.length > 1) {
      // Paste of the full code
      const next = clean.slice(0, 6).split("");
      const filled = [...next, ...Array(6 - next.length).fill("")];
      setDigits(filled);
      boxes.current[Math.min(next.length, 5)]?.focus();
      if (next.length === 6) verify(next.join(""));
      return;
    }
    const next = [...digits];
    next[i] = clean;
    setDigits(next);
    if (clean && i < 5) boxes.current[i + 1]?.focus();
    if (next.every(Boolean)) verify(next.join(""));
  };

  return (
    <div className="min-h-dvh bg-slate-950 text-white flex">
      {/* Brand panel */}
      <aside className="hidden lg:flex lg:w-[46%] relative overflow-hidden flex-col justify-between p-12 border-r border-white/5">
        <Image src="/images/auth/recover.jpg" alt="" fill priority sizes="46vw" className="object-cover opacity-40" style={{ objectPosition: "35% center" }} />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950/95 via-slate-950/80 to-slate-950/60" />
        <div className="absolute -top-32 -left-32 w-[28rem] h-[28rem] rounded-full bg-green-500/20 blur-[120px]" />
        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#25D366] flex items-center justify-center shadow-lg shadow-green-500/30">
            <Icon name={"admin_panel_settings"} className="w-5 h-5" />
          </div>
          <div>
            <p className="font-bold">ChatFlow</p>
            <p className="text-xs font-semibold text-[#25D366]">Super Admin Console</p>
          </div>
        </div>
        <div className="relative space-y-6 max-w-md">
          <h2 className="text-4xl font-bold leading-tight">Secure control centre for the whole platform.</h2>
          <ul className="space-y-4 text-sm text-slate-300">
            {[
              { icon: "key", t: "Two-step sign-in", d: "Password plus a one-time code emailed to you." },
              { icon: "shield_person", t: "Role-based access", d: "Super Admin, Admin, Support and Viewer permissions." },
              { icon: "lock", t: "Brute-force protection", d: "Accounts lock after 5 failed attempts; sessions end after 8 hours." },
              { icon: "history", t: "Full audit trail", d: "Every sign-in and change is recorded with IP and device." },
            ].map((f) => (
              <li key={f.t} className="flex gap-3">
                <span className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                  <Icon name={f.icon} className="w-3.5 h-3.5 text-[#25D366]" />
                </span>
                <span><span className="block font-semibold text-white">{f.t}</span>{f.d}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-slate-500">Authorised personnel only. Activity is monitored and logged.</p>
      </aside>

      {/* Form */}
      <main className="flex-1 flex items-start sm:items-center justify-center px-4 sm:px-8 pt-8 pb-10 sm:py-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.07] [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:22px_22px]" />
        <div className="lg:hidden absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-green-500/20 blur-[110px]" />
        <div className="relative w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-6">
            <div className="w-11 h-11 rounded-2xl bg-[#25D366] flex items-center justify-center shadow-lg shadow-green-500/30">
              <Icon name={"admin_panel_settings"} className="w-5 h-5" />
            </div>
            <div className="leading-tight">
              <p className="font-bold">ChatFlow</p>
              <p className="text-xs font-semibold text-[#25D366]">Super Admin Console</p>
            </div>
            <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-slate-300">
              <Icon name="lock" className="w-2.5 h-2.5 text-[#25D366]" /> Secure
            </span>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-2xl shadow-black/40 p-6 sm:p-8">
          {/* Step progress */}
          <div className="flex gap-1.5 mb-6" aria-hidden>
            <span className="h-1 flex-1 rounded-full bg-[#25D366]" />
            <span className={`h-1 flex-1 rounded-full transition-colors ${step === "otp" ? "bg-[#25D366]" : "bg-white/10"}`} />
          </div>

          {step === "credentials" ? (
            <form onSubmit={requestCode} className="space-y-5">
              {staff ? (
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-base font-bold text-white" style={{ background: staff.role.color }}>
                    {initials(staff.name, staff.email)}
                  </span>
                  <div className="min-w-0">
                    <h1 className="text-2xl font-bold truncate">Welcome back, {firstName(staff.name)}</h1>
                    <p className="text-sm text-slate-400 mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ background: staff.role.color }}>{staff.role.name}</span>
                      Step 1 of 2 · Enter your password
                    </p>
                  </div>
                </div>
              ) : (
                <div>
                  <h1 className="text-2xl font-bold">Admin sign in</h1>
                  <p className="text-sm text-slate-400 mt-1">Step 1 of 2 · Enter your admin credentials</p>
                </div>
              )}

              {error && <ErrorBox message={error} />}

              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-slate-300">Work email</span>
                <div className="relative">
                <Icon name="mail" className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                <input type="email" className={`${inputCls} ${staff ? "opacity-70 cursor-not-allowed" : ""}`} value={email} onChange={(e) => setEmail(e.target.value)}
                  readOnly={!!staff} required autoComplete="username" autoFocus={!staffKey} placeholder="you@company.com" />
                </div>
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-slate-300">Password</span>
                <div className="relative">
                  <Icon name="lock" className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                  <input type={showPw ? "text" : "password"} className={`${inputCls} pr-11`} value={password}
                    onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" autoFocus={!!staffKey} placeholder="••••••••••" />
                  <button type="button" onClick={() => setShowPw(!showPw)} aria-label={showPw ? "Hide password" : "Show password"}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                    <Icon name={showPw ? "visibility_off" : "visibility"} className="w-4 h-4" />
                  </button>
                </div>
              </label>

              <button type="submit" disabled={loading}
                className="w-full rounded-xl bg-[#25D366] hover:bg-[#1fb857] py-3 text-sm font-bold text-slate-950 transition disabled:opacity-60 flex items-center justify-center gap-2">
                {loading && <span className="w-4 h-4 rounded-full border-2 border-slate-950 border-t-transparent animate-spin" />}
                Continue
              </button>

              <div className="flex items-center justify-between text-xs">
                <Link href="/forgot-password" className="text-slate-400 hover:text-white">Forgot password?</Link>
                <Link href="/login" className="text-slate-400 hover:text-white">Not an admin? App login</Link>
              </div>
            </form>
          ) : (
            <div className="space-y-5">
              <button onClick={() => { setStep("credentials"); setError(null); }} className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5">
                <Icon name={"arrow_back"} className="w-3 h-3" /> Back
              </button>
              <div>
                <div className="w-12 h-12 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center mb-4">
                  <Icon name={"mark_email_read"} className="w-5 h-5 text-[#25D366]" />
                </div>
                <h1 className="text-2xl font-bold">Check your email</h1>
                <p className="text-sm text-slate-400 mt-1">
                  Step 2 of 2 · Enter the 6-digit code sent to <span className="text-white font-medium">{maskedEmail}</span>
                </p>
              </div>

              {error && <ErrorBox message={error} />}

              <div className="flex justify-between gap-2" onPaste={(e) => { e.preventDefault(); setDigit(0, e.clipboardData.getData("text")); }}>
                {digits.map((d, i) => (
                  <input
                    key={i}
                    ref={(el) => { boxes.current[i] = el; }}
                    value={d}
                    onChange={(e) => setDigit(i, e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Backspace" && !digits[i] && i > 0) boxes.current[i - 1]?.focus(); }}
                    inputMode="numeric"
                    autoComplete={i === 0 ? "one-time-code" : "off"}
                    maxLength={6}
                    aria-label={`Digit ${i + 1}`}
                    disabled={loading}
                    className="w-full aspect-square max-w-[3.25rem] rounded-xl border border-white/10 bg-white/5 text-center text-xl font-bold text-white focus:outline-none focus:ring-2 focus:ring-green-500/60 focus:border-green-500/60 disabled:opacity-50"
                  />
                ))}
              </div>

              <button onClick={() => verify(digits.join(""))} disabled={loading || digits.some((d) => !d)}
                className="w-full rounded-xl bg-[#25D366] hover:bg-[#1fb857] py-3 text-sm font-bold text-slate-950 transition disabled:opacity-50 flex items-center justify-center gap-2">
                {loading && <span className="w-4 h-4 rounded-full border-2 border-slate-950 border-t-transparent animate-spin" />}
                Verify & sign in
              </button>

              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>{secondsLeft > 0 ? `Code expires in ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}` : "Code expired"}</span>
                <button onClick={() => requestCode()} disabled={loading} className="font-semibold text-[#25D366] hover:underline disabled:opacity-50">Resend code</button>
              </div>
            </div>
          )}

          </div>

          <div className="lg:hidden mt-6 grid grid-cols-2 gap-2">
            {[
              { icon: "key", t: "2-step sign-in" },
              { icon: "lock", t: "Auto lockout" },
              { icon: "schedule", t: "8-hour sessions" },
              { icon: "history", t: "Full audit trail" },
            ].map((f) => (
              <div key={f.t} className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5 text-xs text-slate-300">
                <Icon name={f.icon} className="w-3.5 h-3.5 text-[#25D366]" /> {f.t}
              </div>
            ))}
          </div>

          <p className="mt-8 text-center text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
            <Icon name={"lock"} className="w-2.5 h-2.5" /> Protected area · All access is logged
          </p>
        </div>
      </main>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div role="alert" className="flex gap-2.5 rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-3 text-sm text-red-300">
      <Icon name={"error"} className="w-4 h-4 mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
