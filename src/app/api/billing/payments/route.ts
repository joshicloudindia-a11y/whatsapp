import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";

const MAX_LIMIT = 50;

/** Payment history for the caller's organization (newest first). Admins and billing managers only. */
export async function GET(req: NextRequest) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  if (member.role !== "ADMIN" && member.role !== "BILLING_MANAGER") {
    return NextResponse.json({ error: "Only organization admins and billing managers can view payments" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number.parseInt(sp.get("page") ?? "1", 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(sp.get("limit") ?? "20", 10) || 20));
  const where = { organizationId: member.organizationId };

  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true, provider: true, providerPaymentId: true, amount: true, currency: true, status: true,
        plan: true, interval: true, description: true, invoiceNumber: true, paidAt: true,
      },
    }),
    prisma.payment.count({ where }),
  ]);

  return NextResponse.json({ payments, total, page, limit, hasMore: page * limit < total });
}
