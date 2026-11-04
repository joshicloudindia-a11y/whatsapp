import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Public pricing data: cache at the CDN for 5 min and serve stale while refreshing,
// so the landing page and dashboard banner don't hit the database on every view.
export async function GET() {
  const plans = await prisma.planConfig.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(
    { plans },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400" } }
  );
}
