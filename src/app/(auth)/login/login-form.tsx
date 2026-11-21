"use client";

import { Icon } from "@/components/ui/icon";
import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";

const inputCls =
  "w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl text-sm bg-slate-50/60 placeholder:text-slate-400 " +
  "transition focus:bg-white focus:outline-none focus:ring-4 focus:ring-green-500/15 focus:border-green-500";

const primaryBtn =
  "group w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold text-white rounded-xl bg-[#25D366] hover:bg-[#1fb857] shadow-lg shadow-green-500/25 transition active:scale-[.99] disabled:opacity-60";

/** Event-handler clock (kept outside the component so render stays pure). */
const currentTime = () => Date.now();

type StartResponse =
  | { twoFactor: false }
  | { twoFactor: true; challenge: string; email: string; expiresInSeconds: number };

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });

  // Two-step verification (email code) state
  const [step, setStep] = useState<"credentials" | "otp">("credentials");
  const [challenge, setChallenge] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [otpError, setOtpError] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (step !== "otp") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [step]);
  const secondsLeft = Math.max(0, Math.floor((expiresAt - now) / 1000));

  const goToApp = () => {
    // Only allow same-site relative redirects (prevents open redirects).
    const cb = params.get("callbackUrl");
    router.push(cb && cb.startsWith("/") && !cb.startsWith("//") ? cb : "/dashboard");
  };

  /** Step 1: password check via /api/auth-2fa/start. Returns null (after showing a toast) on failure. */
  const startSignIn = async (): Promise<StartResponse | null> => {
    const res = await fetch("/api/auth-2fa/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: form.email, password: form.password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data?.error ?? "Invalid email or password");
      return null;
    }
    return data as StartResponse;
  };

  const showCodeStep = (data: Extract<StartResponse, { twoFactor: true }>, issuedAt: number) => {
    setChallenge(data.challenge);
    setMaskedEmail(data.email);
    setExpiresAt(issuedAt + data.expiresInSeconds * 1000);
    setNow(issuedAt);
    setDigits(Array(6).fill(""));
    setOtpError(null);
    setStep("otp");
    setTimeout(() => boxes.current[0]?.focus(), 50);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const start = await startSignIn();
      if (!start) return;
      if (start.twoFactor) {
        showCodeStep(start, currentTime());
        return;
      }
      const result = await signIn("credentials", {
        email: form.email,
        password: form.password,
        redirect: false,
      });
      if (result?.error) {
        toast.error("Invalid email or password");
      } else {
        goToApp();
      }
    } catch {
      toast.error("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const resendCode = async () => {
    setLoading(true);
    try {
      const start = await startSignIn();
      if (!start) return;
      if (start.twoFactor) {
        showCodeStep(start, currentTime());
        toast.success("A new code is on its way");
      } else {
        // Two-step verification was turned off meanwhile — fall back to a normal sign-in.
        setStep("credentials");
      }
    } catch {
      toast.error("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const verify = async (code: string) => {
    if (loading) return;
    setOtpError(null);
    setLoading(true);
    try {
      const res = await signIn("user-otp", { challenge, code, redirect: false });
      if (res?.error || !res?.ok) {
        setOtpError("Incorrect or expired code. After 5 wrong attempts the account is locked for 15 minutes.");
        setDigits(Array(6).fill(""));
        setTimeout(() => boxes.current[0]?.focus(), 0);
        return;
      }
      setForm((f) => ({ ...f, password: "" }));
      goToApp();
    } catch {
      setOtpError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const setDigit = (i: number, v: string) => {
    const clean = v.replace(/\D/g, "");
    if (clean.length > 1) {
      // Paste (or autofill) of the full code
      const next = clean.slice(0, 6).split("");
      setDigits([...next, ...Array(6 - next.length).fill("")]);
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

  const backToPassword = () => {
    setStep("credentials");
    setChallenge("");
    setDigits(Array(6).fill(""));
    setOtpError(null);
  };

  if (step === "otp") {
    return (
      <div className="bg-white rounded-3xl shadow-xl shadow-slate-900/5 border border-slate-200/80 p-6 sm:p-8 space-y-6">
        <button type="button" onClick={backToPassword} className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1.5">
          <Icon name={"arrow_back"} className="w-3 h-3" /> Back
        </button>

        <div className="space-y-1.5">
          <div className="w-12 h-12 rounded-2xl bg-green-50 border border-green-100 flex items-center justify-center mb-3">
            <Icon name={"mark_email_read"} className="w-5 h-5 text-green-600" />
          </div>
          <h1 className="text-2xl sm:text-[28px] font-bold text-slate-900 tracking-tight">Check your email</h1>
          <p className="text-slate-500 text-sm">
            Two-step verification is on. Enter the 6-digit code we sent to{" "}
            <span className="font-semibold text-slate-800 break-all">{maskedEmail}</span>
          </p>
        </div>

        {otpError && (
          <div role="alert" className="flex gap-2.5 px-3.5 py-2.5 rounded-xl bg-red-50 border border-red-100">
            <Icon name={"error"} className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <p className="text-red-600 text-sm">{otpError}</p>
          </div>
        )}

        <form onSubmit={(e) => { e.preventDefault(); verify(digits.join("")); }} className="space-y-5">
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
                className="w-full min-w-0 aspect-square max-w-[3.25rem] rounded-xl border border-slate-200 bg-slate-50/60 text-center text-xl font-bold text-slate-900 transition focus:bg-white focus:outline-none focus:ring-4 focus:ring-green-500/15 focus:border-green-500 disabled:opacity-50"
              />
            ))}
          </div>

          <button type="submit" disabled={loading || digits.some((d) => !d)} className={primaryBtn}>
            {loading ? (
              <><span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" /> Verifying…</>
            ) : (
              <>Verify &amp; sign in <Icon name={"arrow_forward"} className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" /></>
            )}
          </button>
        </form>

        <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <Icon name={"schedule"} className="w-3.5 h-3.5" />
            {secondsLeft > 0 ? `Code expires in ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}` : "Code expired"}
          </span>
          <button type="button" onClick={resendCode} disabled={loading} className="font-semibold text-green-600 hover:text-green-700 disabled:opacity-50 flex items-center gap-1">
            <Icon name={"refresh"} className="w-3.5 h-3.5" /> Resend code
          </button>
        </div>

        <p className="text-[11px] text-slate-400 text-center">Didn&apos;t get it? Check your spam folder, or go back and confirm your email address.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl shadow-xl shadow-slate-900/5 border border-slate-200/80 p-6 sm:p-8 space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl sm:text-[28px] font-bold text-slate-900 tracking-tight">Welcome back</h1>
        <p className="text-slate-500 text-sm">Sign in to your ChatFlow account to continue</p>
      </div>

      {params.get("verified") && (
        <p className="flex items-center gap-2 text-green-700 text-sm bg-green-50 border border-green-100 px-3.5 py-2.5 rounded-xl">
          <Icon name={"check_circle"} className="w-4 h-4" /> Email verified! You can now log in.
        </p>
      )}
      {params.get("error") && (
        <div className="flex gap-2.5 px-3.5 py-2.5 rounded-xl bg-red-50 border border-red-100">
          <Icon name={"error"} className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <div className="space-y-0.5">
            <p className="text-red-600 text-sm font-medium">
              {params.get("error") === "expired" ? "Verification link expired." : "Invalid link."}
            </p>
            {params.get("error") === "expired" && (
              <p className="text-red-500 text-xs">
                You can still log in — your account is active.{" "}
                <Link href="/forgot-password" className="underline font-medium">Need help?</Link>
              </p>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold text-slate-700">Email</span>
          <div className="relative">
            <Icon name={"mail"} className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="you@company.com"
              className={inputCls}
            />
          </div>
        </label>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-semibold text-slate-700">Password</label>
            <Link href="/forgot-password" className="text-xs font-semibold text-green-600 hover:text-green-700">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Icon name={"lock"} className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              id="password"
              type={showPw ? "text" : "password"}
              required
              autoComplete="current-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Enter your password"
              className={`${inputCls} pr-11`}
            />
            <button
              type="button"
              onClick={() => setShowPw((s) => !s)}
              aria-label={showPw ? "Hide password" : "Show password"}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            >
              <Icon name={showPw ? "visibility_off" : "visibility"} className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <button type="submit" disabled={loading} className={primaryBtn}>
          {loading ? (
            <><span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" /> Signing in…</>
          ) : (
            <>Sign in <Icon name={"arrow_forward"} className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" /></>
          )}
        </button>
      </form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100" /></div>
        <p className="relative mx-auto w-fit bg-white px-3 text-xs text-slate-400">New to ChatFlow?</p>
      </div>

      <Link
        href="/register"
        className="w-full flex items-center justify-center py-3 text-sm font-semibold rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition"
      >
        Create a free account
      </Link>

    </div>
  );
}
