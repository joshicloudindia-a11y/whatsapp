"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", orgName: "" });

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
        setDone(true);
      }
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border p-8 text-center space-y-4">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto" style={{ background: "#dcf8c6" }}>
          <svg className="w-8 h-8" viewBox="0 0 24 24" fill="#25D366">
            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="#25D366" strokeWidth="2" fill="none"/>
          </svg>
        </div>
        <h2 className="text-xl font-bold text-slate-900">Check your email</h2>
        <p className="text-slate-500 text-sm">
          We sent a verification link to <strong>{form.email}</strong>. Click it to activate your account.
        </p>
        <Link href="/login" className="inline-block text-sm text-green-600 font-medium hover:underline">
          Back to login
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border p-8 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-slate-900">Start your free trial</h1>
        <p className="text-slate-500 text-sm">7 days free. No credit card required.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Your name</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="John Doe"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Business name</label>
            <input
              required
              value={form.orgName}
              onChange={(e) => setForm({ ...form, orgName: e.target.value })}
              placeholder="Acme Corp"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">Work email</label>
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="you@company.com"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">Password</label>
          <input
            type="password"
            required
            minLength={8}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="Min. 8 characters"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 text-sm font-semibold text-white rounded-lg transition-opacity disabled:opacity-60"
          style={{ background: "#25D366" }}
        >
          {loading ? "Creating account..." : "Create free account"}
        </button>
      </form>

      <p className="text-center text-xs text-slate-400">
        By signing up you agree to our Terms of Service and Privacy Policy.
      </p>
      <p className="text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link href="/login" className="text-green-600 font-medium hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
