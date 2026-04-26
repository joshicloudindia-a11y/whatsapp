"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch {
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border p-8 text-center space-y-4">
        <h2 className="text-xl font-bold">Check your email</h2>
        <p className="text-slate-500 text-sm">
          If an account exists for <strong>{email}</strong>, you'll receive a reset link shortly.
        </p>
        <Link href="/login" className="inline-block text-sm text-green-600 font-medium hover:underline">
          Back to login
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reset your password</h1>
        <p className="text-slate-500 text-sm mt-1">We'll send you a reset link.</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 text-sm font-semibold text-white rounded-lg disabled:opacity-60"
          style={{ background: "#25D366" }}
        >
          {loading ? "Sending..." : "Send reset link"}
        </button>
      </form>
      <Link href="/login" className="block text-center text-sm text-slate-500 hover:underline">
        Back to login
      </Link>
    </div>
  );
}
