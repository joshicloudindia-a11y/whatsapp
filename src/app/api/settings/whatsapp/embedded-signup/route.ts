import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import {
  exchangeEmbeddedSignupCode, getPhoneNumberInfo, grantedWabaIds, listWabaPhoneNumbers,
  registerPhoneNumber, subscribeAppToWaba,
} from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

const SELECT = {
  id: true, phoneNumber: true, phoneNumberId: true, displayName: true, wabaId: true,
  isActive: true, qualityRating: true, messagingLimit: true, createdAt: true,
} as const;

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const isId = (v: unknown): v is string => typeof v === "string" && /^\d{5,25}$/.test(v);

/**
 * Completes Meta Embedded Signup: exchange code → business token, subscribe our app to the
 * customer's WABA, register the number on Cloud API and save it to the organization.
 */
export async function POST(req: NextRequest) {
  const { member, response } = await requireOrgMember({ admin: true });
  if (!member) return response;

  const body = (await req.json().catch(() => null)) ?? {};
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!code) return bad("Missing signup code from Facebook");

  let token: string;
  try {
    token = await exchangeEmbeddedSignupCode(code);
  } catch (e) {
    return bad(`Could not complete Facebook signup: ${(e as Error).message}`);
  }

  // WABA + number come from the signup session; fall back to what the token was granted.
  let wabaId = isId(body.wabaId) ? body.wabaId : null;
  if (!wabaId) wabaId = (await grantedWabaIds(token).catch(() => []))[0] ?? null;
  if (!wabaId) return bad("No WhatsApp Business Account was shared during signup. Please try again and select an account.");

  let phoneNumberId = isId(body.phoneNumberId) ? body.phoneNumberId : null;
  if (!phoneNumberId) {
    const numbers = await listWabaPhoneNumbers(wabaId, token).catch(() => []);
    const taken = new Set((await prisma.whatsappAccount.findMany({ where: { phoneNumberId: { in: numbers.map((n) => n.id) } }, select: { phoneNumberId: true } })).map((a) => a.phoneNumberId));
    phoneNumberId = numbers.find((n) => !taken.has(n.id))?.id ?? numbers[0]?.id ?? null;
  }
  if (!phoneNumberId) return bad("This WhatsApp Business Account has no phone number yet. Add one in WhatsApp Manager, then connect again.");

  const existing = await prisma.whatsappAccount.findFirst({ where: { phoneNumberId }, select: { id: true, organizationId: true } });
  if (existing && existing.organizationId !== member.organizationId) return bad("This number is already connected to another organization", 409);

  let info;
  try {
    info = await getPhoneNumberInfo(phoneNumberId, token);
  } catch (e) {
    return bad(`Meta rejected the connected number: ${(e as Error).message}`);
  }

  const webhookSubscribed = await subscribeAppToWaba(wabaId, token).catch(() => false);

  // Register on Cloud API. The PIN becomes the number's two-step verification PIN, so we show it once.
  const pin = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  let registered = true;
  let registerError: string | null = null;
  try {
    await registerPhoneNumber(phoneNumberId, token, pin);
  } catch (e) {
    registered = false;
    registerError = (e as Error).message;
  }

  const data = {
    phoneNumber: (info.display_phone_number ?? "").replace(/\D/g, ""),
    wabaId,
    accessToken: token,
    displayName: info.verified_name || info.display_phone_number || phoneNumberId,
    qualityRating: info.quality_rating ?? null,
    messagingLimit: info.messaging_limit_tier ?? null,
    isActive: true,
  };
  const account = existing
    ? await prisma.whatsappAccount.update({ where: { id: existing.id }, data, select: SELECT })
    : await prisma.whatsappAccount.create({ data: { ...data, organizationId: member.organizationId, phoneNumberId }, select: SELECT });

  return NextResponse.json(
    { account, webhookSubscribed, registered, registerError, pin: registered ? pin : null },
    { status: existing ? 200 : 201 },
  );
}
