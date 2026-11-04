import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { getPhoneNumberInfo, subscribeAppToWaba } from "@/lib/whatsapp";

const SELECT = {
  id: true, phoneNumber: true, phoneNumberId: true, displayName: true, wabaId: true,
  isActive: true, qualityRating: true, messagingLimit: true, createdAt: true,
} as const;

export async function GET() {
  const { member, response } = await requireOrgMember();
  if (!member) return response;

  const accounts = await prisma.whatsappAccount.findMany({
    where: { organizationId: member.organizationId },
    select: SELECT,
    orderBy: { createdAt: "desc" },
  });

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  return NextResponse.json({
    accounts,
    webhook: {
      callbackUrl: appUrl ? `${appUrl}/api/webhook/whatsapp` : "/api/webhook/whatsapp",
      // The verify token is only shown to org admins.
      verifyToken: member.role === "ADMIN" ? process.env.META_WEBHOOK_VERIFY_TOKEN ?? null : null,
    },
  });
}

export async function POST(req: NextRequest) {
  const { member, response } = await requireOrgMember({ admin: true });
  if (!member) return response;

  const body = (await req.json().catch(() => null)) ?? {};
  const phoneNumberId = String(body.phoneNumberId ?? "").trim();
  const wabaId = String(body.wabaId ?? "").trim();
  const accessToken = String(body.accessToken ?? "").trim();
  const displayNameInput = String(body.displayName ?? "").trim().slice(0, 120);

  if (!/^\d{5,25}$/.test(phoneNumberId)) return NextResponse.json({ error: "Enter a valid Phone Number ID (digits only)" }, { status: 400 });
  if (!/^\d{5,25}$/.test(wabaId)) return NextResponse.json({ error: "Enter a valid WhatsApp Business Account ID (digits only)" }, { status: 400 });
  if (accessToken.length < 20) return NextResponse.json({ error: "Enter a valid permanent access token" }, { status: 400 });

  const dup = await prisma.whatsappAccount.findFirst({ where: { phoneNumberId }, select: { id: true } });
  if (dup) return NextResponse.json({ error: "This number is already connected" }, { status: 409 });

  // Verify credentials with Meta before saving anything.
  let info;
  try {
    info = await getPhoneNumberInfo(phoneNumberId, accessToken);
  } catch (e) {
    return NextResponse.json({ error: `Meta rejected these details: ${(e as Error).message}` }, { status: 400 });
  }

  const webhookSubscribed = await subscribeAppToWaba(wabaId, accessToken).catch(() => false);

  const account = await prisma.whatsappAccount.create({
    data: {
      organizationId: member.organizationId,
      phoneNumber: (info.display_phone_number ?? "").replace(/\D/g, ""),
      phoneNumberId,
      wabaId,
      accessToken,
      displayName: displayNameInput || info.verified_name || info.display_phone_number || phoneNumberId,
      qualityRating: info.quality_rating ?? null,
      messagingLimit: info.messaging_limit_tier ?? null,
    },
    select: SELECT,
  });

  return NextResponse.json({ account, webhookSubscribed }, { status: 201 });
}
