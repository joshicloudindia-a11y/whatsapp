import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import LandingPage from "@/components/landing/LandingPage";

export default async function Home() {
  const session = await getServerSession(authOptions);
  const isLoggedIn = !!session;
  const isSuperAdmin = !!(session?.user as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin;
  // Computed on the server so the client component's render stays pure.
  const year = new Date().getFullYear();
  return <LandingPage isLoggedIn={isLoggedIn} isSuperAdmin={isSuperAdmin} year={year} />;
}
