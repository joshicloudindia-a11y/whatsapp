import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { checkWhatsappAccountsHealth } from "@/lib/whatsapp-health";

export const dynamic = "force-dynamic";

/** Token / quality health for the org's WhatsApp numbers. Cached ~10 min per account (admins may pass ?refresh=1). */
export async function GET(req: NextRequest) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;

  const accounts = await prisma.whatsappAccount.findMany({
    where: { organizationId: member.organizationId },
    select: { id: true, phoneNumberId: true, accessToken: true },
    orderBy: { createdAt: "desc" },
  });

  const force = req.nextUrl.searchParams.get("refresh") === "1" && member.role === "ADMIN";
  const health = await checkWhatsappAccountsHealth(accounts, { force });
  return NextResponse.json({ health });
}
