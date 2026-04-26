"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";

const inputCls =
  "w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white";

// ─── Step 1: Registration form ────────────────────────────────────────────────
function RegisterForm({
  onSuccess,
}: {
  onSuccess: (email: string, name: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", orgName: "" });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Registration failed");
      } else {
        onSuccess(form.email, form.name);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border p-8 space-y-6" style={{ borderColor: "#e2e8f0" }}>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-slate-900">Start your free trial</h1>
        <p className="text-slate-500 text-sm">7 days free. No credit card required.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Your name</label>
            <input required value={form.name} onChange={(e) => set("name", e.target.value)}
              placeholder="John Doe" className={inputCls} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Business name</label>
            <input required value={form.orgName} onChange={(e) => set("orgName", e.target.value)}
              placeholder="Acme Corp" className={inputCls} />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">Work email</label>
          <input type="email" required value={form.email} onChange={(e) => set("email", e.target.value)}
            placeholder="you@company.com" className={inputCls} />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">Password</label>
          <input type="password" required minLength={8} value={form.password}
            onChange={(e) => set("password", e.target.value)}
            placeholder="Min. 8 characters" className={inputCls} />
        </div>
        <button type="submit" disabled={loading}
          className="w-full py-2.5 text-sm font-semibold text-white rounded-lg transition-opacity disabled:opacity-60"
          style={{ background: "#25D366" }}>
          {loading ? "Creating account…" : "Create free account"}
        </button>
      </form>

      <p className="text-center text-xs text-slate-400">
        By signing up you agree to our Terms of Service and Privacy Policy.
      </p>
      <p className="text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link href="/login" className="text-green-600 font-medium hover:underline">Sign in</Link>
      </p>
    </div>
  );
}

// ─── Step 2: OTP verification ─────────────────────────────────────────────────
function OtpStep({ email, name }: { email: string; name: string }) {
  const router = useRouter();
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  // Countdown timer for resend
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const handleChange = (i: number, val: string) => {
    const digit = val.replace(/\D/g, "").slice(-1);
    const next = [...otp];
    next[i] = digit;
    setOtp(next);
    if (digit && i < 5) inputs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[i] && i > 0) {
      inputs.current[i - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    const next = [...otp];
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setOtp(next);
    inputs.current[Math.min(pasted.length, 5)]?.focus();
  };

  const handleVerify = async () => {
    const code = otp.join("");
    if (code.length < 6) { toast.error("Enter all 6 digits"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp: code }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Verification failed");
        setOtp(["", "", "", "", "", ""]);
        inputs.current[0]?.focus();
      } else {
        toast.success("Email verified! Logging you in…");
        router.push("/login?verified=1");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      const res = await fetch("/api/auth/resend-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to resend");
      } else {
        toast.success("New code sent!");
        setOtp(["", "", "", "", "", ""]);
        setCountdown(60);
        inputs.current[0]?.focus();
      }
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border p-8 space-y-6 text-center" style={{ borderColor: "#e2e8f0" }}>
      {/* Icon */}
      <div className="flex flex-col items-center gap-3">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "#dcf8c6" }}>
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="#25D366" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">Check your email</h2>
          <p className="text-slate-500 text-sm mt-1">
            We sent a 6-digit code to <span className="font-semibold text-slate-700">{email}</span>
          </p>
        </div>
      </div>

      {/* OTP boxes */}
      <div className="flex items-center justify-center gap-2.5">
        {otp.map((digit, i) => (
          <input
            key={i}
            ref={(el) => { inputs.current[i] = el; }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={i === 0 ? handlePaste : undefined}
            className="w-11 h-14 text-center text-xl font-bold border-2 rounded-xl focus:outline-none transition-colors"
            style={{
              borderColor: digit ? "#25D366" : "#e2e8f0",
              color: "#0f172a",
            }}
          />
        ))}
      </div>

      {/* Verify button */}
      <button
        onClick={handleVerify}
        disabled={loading || otp.join("").length < 6}
        className="w-full py-3 text-sm font-semibold text-white rounded-xl transition-opacity disabled:opacity-50"
        style={{ background: "#25D366" }}
      >
        {loading ? "Verifying…" : "Verify Email"}
      </button>

      {/* Resend */}
      <div className="text-sm text-slate-500">
        Didn't receive it?{" "}
        {countdown > 0 ? (
          <span className="text-slate-400">Resend in {countdown}s</span>
        ) : (
          <button
            onClick={handleResend}
            disabled={resending}
            className="text-green-600 font-medium hover:underline disabled:opacity-50"
          >
            {resending ? "Sending…" : "Resend code"}
          </button>
        )}
      </div>

      <p className="text-xs text-slate-400">
        Wrong email?{" "}
        <Link href="/register" className="text-green-600 hover:underline font-medium">
          Go back
        </Link>
      </p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function RegisterPage() {
  const [step, setStep] = useState<"form" | "otp">("form");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  if (step === "otp") {
    return <OtpStep email={email} name={name} />;
  }

  return (
    <RegisterForm
      onSuccess={(e, n) => { setEmail(e); setName(n); setStep("otp"); }}
    />
  );
}
