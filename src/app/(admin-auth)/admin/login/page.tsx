import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin-auth";
import AdminLoginForm from "./login-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin sign in · ChatFlow",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const result = await getAdminContext();
  if (result.ok) {
    const { callbackUrl } = await searchParams;
    redirect(callbackUrl?.startsWith("/admin") && !callbackUrl.startsWith("//") ? callbackUrl : "/admin");
  }
  return (
    <Suspense>
      <AdminLoginForm />
    </Suspense>
  );
}
