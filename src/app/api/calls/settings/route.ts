import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { getCallingStatus, updateCallingSettings } from "@/lib/calling";
import { errorResponse, jsonError } from "@/lib/calling-access";

export const dynamic = "force-dynamic";

async function account(organizationId: string, id: string | null) {
  if (!id) return null;
  return prisma.whatsappAccount.findFirst({ where: { id, organizationId } });
}

/** GET /api/calls/settings?whatsappAccountId=… → calling eligibility / settings of one of the org's numbers. */
export async function GET(req: NextRequest) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  const acc = await account(member.organizationId, req.nextUrl.searchParams.get("whatsappAccountId"));
  if (!acc) return jsonError("WhatsApp number not found", 404);
  const calling = await getCallingStatus(acc, { fresh: req.nextUrl.searchParams.get("fresh") === "1" });
  return NextResponse.json({ whatsappAccountId: acc.id, phoneNumber: acc.phoneNumber, calling });
}

const ONOFF = ["ENABLED", "DISABLED"] as const;

/**
 * PATCH /api/calls/settings (org admins only)
 * { whatsappAccountId, status?: "ENABLED"|"DISABLED", callIconVisibility?: "DEFAULT"|"DISABLE_ALL", callbackPermission?: "ENABLED"|"DISABLED" }
 * → POST /{phone-number-id}/settings { calling: {...} }
 */
export async function PATCH(req: NextRequest) {
  const { member, response } = await requireOrgMember({ admin: true });
  if (!member) return response;
  const body = (await req.json().catch(() => null)) ?? {};
  const acc = await account(member.organizationId, typeof body.whatsappAccountId === "string" ? body.whatsappAccountId : null);
  if (!acc) return jsonError("WhatsApp number not found", 404);

  const calling: Parameters<typeof updateCallingSettings>[1] = {};
  if (body.status !== undefined) {
    if (!ONOFF.includes(body.status)) return jsonError("status must be ENABLED or DISABLED");
    calling.status = body.status;
  }
  if (body.callIconVisibility !== undefined) {
    if (!["DEFAULT", "DISABLE_ALL"].includes(body.callIconVisibility)) return jsonError("callIconVisibility must be DEFAULT or DISABLE_ALL");
    calling.call_icon_visibility = body.callIconVisibility;
  }
  if (body.callbackPermission !== undefined) {
    if (!ONOFF.includes(body.callbackPermission)) return jsonError("callbackPermission must be ENABLED or DISABLED");
    calling.callback_permission_status = body.callbackPermission;
  }
  if (!Object.keys(calling).length) return jsonError("Nothing to update");

  try {
    await updateCallingSettings(acc, calling);
    const status = await getCallingStatus(acc, { fresh: true });
    return NextResponse.json({ success: true, calling: status });
  } catch (e) {
    return errorResponse(e, "Couldn't update calling settings");
  }
}
