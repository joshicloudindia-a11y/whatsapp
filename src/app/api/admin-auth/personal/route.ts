import { NextRequest, NextResponse } from "next/server";
import { resolveStaffLink } from "@/lib/impersonation";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const r = await resolveStaffLink(req.nextUrl.searchParams.get("k"));
  if (!r) return NextResponse.json({ error: "This sign-in link is invalid or has expired. Ask a Super Admin for a new one." }, { status: 404 });
  return NextResponse.json({ name: r.user.name, email: r.user.email, role: { name: r.role.name, color: r.role.color } }, { headers: { "Cache-Control": "no-store" } });
}
