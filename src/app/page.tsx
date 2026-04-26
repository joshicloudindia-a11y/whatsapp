import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import LandingPage from "@/components/landing/LandingPage";

export default async function Home() {
  const session = await getServerSession(authOptions);
  const isLoggedIn = !!session;
  const isSuperAdmin = !!(session?.user as any)?.isSuperAdmin;
  return <LandingPage isLoggedIn={isLoggedIn} isSuperAdmin={isSuperAdmin} />;
}
