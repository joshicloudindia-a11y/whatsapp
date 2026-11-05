import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { BUSINESS_VERTICALS, getBusinessProfile, getMarketingMessagesStatus, updateBusinessProfile } from "@/lib/whatsapp";
import { normalizeWebsite } from "@/lib/utils";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function load(id: string, organizationId: string) {
  return prisma.whatsappAccount.findFirst({ where: { id, organizationId }, select: { phoneNumberId: true, wabaId: true, accessToken: true } });
}

/** WhatsApp business profile + Marketing Messages API status for one number. */
export async function GET(_req: NextRequest, { params }: Params) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  const acc = await load((await params).id, member.organizationId);
  if (!acc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [profile, marketing] = await Promise.allSettled([
    getBusinessProfile(acc.phoneNumberId, acc.accessToken),
    getMarketingMessagesStatus(acc.wabaId, acc.accessToken),
  ]);
  return NextResponse.json({
    profile: profile.status === "fulfilled" ? profile.value : null,
    profileError: profile.status === "rejected" ? (profile.reason as Error).message : null,
    marketingStatus: marketing.status === "fulfilled" ? marketing.value : "UNKNOWN",
    verticals: BUSINESS_VERTICALS,
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { member, response } = await requireOrgMember({ admin: true });
  if (!member) return response;
  const acc = await load((await params).id, member.organizationId);
  if (!acc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const b = (await req.json().catch(() => null)) ?? {};
  const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
  const about = str(b.about, 139);
  const email = str(b.email, 128);
  if (email && !EMAIL_RE.test(email)) return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
  const vertical = BUSINESS_VERTICALS.includes(b.vertical) ? b.vertical : undefined;
  const websites = (Array.isArray(b.websites) ? b.websites : [])
    .map((w: unknown) => normalizeWebsite(String(w ?? "")))
    .filter(Boolean)
    .slice(0, 2) as string[];

  try {
    await updateBusinessProfile(acc.phoneNumberId, acc.accessToken, {
      ...(about && { about }),
      address: str(b.address, 256),
      description: str(b.description, 512),
      email,
      websites,
      ...(vertical && { vertical }),
    });
  } catch (e) {
    return NextResponse.json({ error: `Meta rejected the profile: ${(e as Error).message}` }, { status: 400 });
  }
  return NextResponse.json({ profile: await getBusinessProfile(acc.phoneNumberId, acc.accessToken).catch(() => null) });
}
