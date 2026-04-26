"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [loading, setLoading] = useState(false);
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
        router.push("/dashboard");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border p-8 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-slate-900">Welcome back</h1>
        <p className="text-slate-500 text-sm">Sign in to your ChatFlow account</p>
        {params.get("verified") && (
          <p className="text-green-600 text-sm bg-green-50 px-3 py-2 rounded-lg">
            Email verified! You can now log in.
          </p>
        )}
        {params.get("error") && (
          <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">
            {params.get("error") === "expired" ? "Verification link expired." : "Invalid link."}
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">Email</label>
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
          <div className="flex justify-between">
            <label className="text-sm font-medium text-slate-700">Password</label>
            <Link href="/forgot-password" className="text-sm text-green-600 hover:underline">
              Forgot password?
            </Link>
          </div>
          <input
            type="password"
            required
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="••••••••"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 text-sm font-semibold text-white rounded-lg transition-opacity disabled:opacity-60"
          style={{ background: "#25D366" }}
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <p className="text-center text-sm text-slate-500">
        Don't have an account?{" "}
        <Link href="/register" className="text-green-600 font-medium hover:underline">
          Sign up free
        </Link>
      </p>
    </div>
  );
}
