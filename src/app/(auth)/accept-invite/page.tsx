"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";

const inputCls = "w-full px-4 py-3 border border-slate-200 rounded-xl text-sm bg-slate-50/60 focus:bg-white focus:outline-none focus:ring-4 focus:ring-green-500/15 focus:border-green-500";
const err = (e: unknown) => (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Something went wrong";

interface Invite { organization: string; email: string; role: string; expiresAt: string; accountExists: boolean; signedInAs: string | null }

function AcceptInvite() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data, error, isLoading } = useQuery<Invite>({
    queryKey: ["invite", token],
    queryFn: () => axios.get("/api/auth/accept-invite", { params: { token } }).then((r) => r.data),
    retry: false,
    enabled: !!token,
  });

  const accept = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await axios.post("/api/auth/accept-invite", { token, name, password });
      toast.success(`You've joined ${data?.organization}!`);
      router.push(data?.accountExists ? "/dashboard" : `/login?verified=1`);
    } catch (e) { toast.error(err(e)); }
    finally { setBusy(false); }
  };

  const card = "bg-white rounded-3xl shadow-xl shadow-slate-900/5 border border-slate-200/80 p-6 sm:p-8 space-y-6";

  if (!token || error) {
    return (
      <div className={card}>
        <span className="w-12 h-12 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center"><Icon name="error" className="w-6 h-6" /></span>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Invitation unavailable</h1>
          <p className="text-sm text-slate-500 mt-1">{error ? err(error) : "This invitation link is missing its token."}</p>
        </div>
        <Link href="/login" className="block text-center rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">Go to sign in</Link>
      </div>
    );
  }
  if (isLoading || !data) return <div className={`${card} h-80 animate-pulse`} />;

  const wrongAccount = data.accountExists && data.signedInAs && data.signedInAs.toLowerCase() !== data.email;
  const needsLogin = data.accountExists && !data.signedInAs;

  return (
    <div className={card}>
      <div className="space-y-3">
        <span className="w-12 h-12 rounded-2xl bg-green-50 text-green-600 flex items-center justify-center"><Icon name="group" className="w-6 h-6" /></span>
        <h1 className="text-2xl font-bold text-slate-900">Join {data.organization}</h1>
        <p className="text-sm text-slate-500">
          You&apos;ve been invited as <b className="text-slate-700">{data.role.replace(/_/g, " ").toLowerCase()}</b> for <b className="text-slate-700">{data.email}</b>.
        </p>
      </div>

      {needsLogin || wrongAccount ? (
        <div className="space-y-4">
          <p className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
            {wrongAccount ? `You're signed in as ${data.signedInAs}. ` : ""}Sign in as <b>{data.email}</b> to accept this invitation.
          </p>
          <Link href={`/login?callbackUrl=${encodeURIComponent(`/accept-invite?token=${token}`)}`}
            className="block text-center rounded-xl bg-[#25D366] py-3 text-sm font-semibold text-white hover:bg-[#1fb857]">Sign in to accept</Link>
        </div>
      ) : (
        <form onSubmit={accept} className="space-y-4">
          {!data.accountExists && (
            <>
              <label className="block space-y-1.5"><span className="text-sm font-semibold text-slate-700">Full name</span>
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required minLength={2} autoComplete="name" /></label>
              <label className="block space-y-1.5"><span className="text-sm font-semibold text-slate-700">Create a password</span>
                <div className="relative">
                  <input type={show ? "text" : "password"} className={`${inputCls} pr-11`} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} autoComplete="new-password" placeholder="10+ chars, upper & lower case, a number" />
                  <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <Icon name={show ? "visibility_off" : "visibility"} className="w-4 h-4" />
                  </button>
                </div>
              </label>
            </>
          )}
          <button type="submit" disabled={busy} className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] py-3 text-sm font-semibold text-white shadow-lg shadow-green-500/25 hover:bg-[#1fb857] disabled:opacity-60">
            {busy && <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />}
            {data.accountExists ? "Accept invitation" : "Create account & join"}
          </button>
          <p className="text-center text-[11px] text-slate-400">Expires {new Date(data.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
        </form>
      )}
    </div>
  );
}

export default function AcceptInvitePage() {
  return <Suspense><AcceptInvite /></Suspense>;
}
