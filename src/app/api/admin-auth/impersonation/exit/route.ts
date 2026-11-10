import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";
import { TICKET_TTL_MS, signToken } from "@/lib/impersonation";

export const dynamic = "force-dynamic";

/** Ends "Login as user": returns a ticket for signIn("impersonate-return") that restores the Super Admin session. */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET });
  const imp = token?.impersonator;
  if (!session?.user?.id || !imp) return NextResponse.json({ error: "Not signed in as another user" }, { status: 400 });
  return NextResponse.json({ ticket: signToken("ret", { a: imp.id, t: session.user.id, aa: imp.adminAuthAt }, TICKET_TTL_MS) });
}
