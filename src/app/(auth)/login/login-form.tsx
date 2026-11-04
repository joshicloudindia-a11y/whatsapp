"use client";

import { Icon } from "@/components/ui/icon";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";

const inputCls =
  "w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl text-sm bg-slate-50/60 placeholder:text-slate-400 " +
  "transition focus:bg-white focus:outline-none focus:ring-4 focus:ring-green-500/15 focus:border-green-500";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await signIn("credentials", {
        email: form.email,
        password: form.password,
        redirect: false,
      });
      if (result?.error) {
        toast.error("Invalid email or password");
      } else {
        // Only allow same-site relative redirects (prevents open redirects).
        const cb = params.get("callbackUrl");
        router.push(cb && cb.startsWith("/") && !cb.startsWith("//") ? cb : "/dashboard");
      }
    } finally {
      setLoading(false);
    }
  };

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

        <button
          type="submit"
          disabled={loading}
          className="group w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold text-white rounded-xl bg-[#25D366] hover:bg-[#1fb857] shadow-lg shadow-green-500/25 transition active:scale-[.99] disabled:opacity-60"
        >
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
