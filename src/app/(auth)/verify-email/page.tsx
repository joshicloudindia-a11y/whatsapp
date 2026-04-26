"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Invalid verification link.");
      return;
    }

    fetch(`/api/auth/verify-email?token=${token}`, { redirect: "manual" })
      .then((res) => {
        if (res.status === 0 || res.ok || res.type === "opaqueredirect") {
          setStatus("success");
        } else {
          return res.json().then((d) => { throw new Error(d?.error ?? "Verification failed"); });
        }
      })
      .catch(() => {
        // API redirects on success — treat any redirect as success
        setStatus("success");
      });
  }, [token]);

  // Fallback: just redirect to API route directly (most reliable approach)
  useEffect(() => {
    if (!token) return;
    const timer = setTimeout(() => {
      window.location.href = `/api/auth/verify-email?token=${token}`;
    }, 300);
    return () => clearTimeout(timer);
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border p-8 space-y-6 text-center" style={{ borderColor: "#e2e8f0" }}>
        {/* Logo */}
        <div className="flex flex-col items-center gap-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#25D366" }}>
            <svg viewBox="0 0 24 24" fill="white" className="w-6 h-6">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-900">Email Verification</h1>
        </div>

        {/* Loading */}
        <div className="space-y-3">
          <div className="w-12 h-12 mx-auto flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-sm text-slate-600">Verifying your email address...</p>
          <p className="text-xs text-slate-400">You'll be redirected to login automatically.</p>
        </div>

        <Link href="/login" className="block text-xs text-center font-medium hover:underline" style={{ color: "#25D366" }}>
          Go to Login manually
        </Link>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
