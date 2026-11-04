import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendMail, invitationEmailHtml } from "@/lib/mailer";
import { generateToken } from "@/lib/utils";
import { requireOrgMember } from "@/lib/org-auth";
import { EMAIL_RE } from "@/lib/admin-users";
import { ORG_ROLES, seatUsage, type OrgRole } from "@/lib/team";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Invite a teammate (or resend a pending invite to the same email). */
export async function POST(req: NextRequest) {
  const { member, response } = await requireOrgMember({ admin: true });
  if (!member) return response;
  const session = await getServerSession(authOptions);

  const body = (await req.json().catch(() => null)) ?? {};
  const email = String(body.email ?? "").toLowerCase().trim();
  const role = (body.role ?? "AGENT") as OrgRole;
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  if (!ORG_ROLES.includes(role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });

  const organizationId = member.organizationId;
  const [org, existingMember, pending] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
    prisma.organizationMember.findFirst({ where: { organizationId, isActive: true, user: { email } }, select: { id: true } }),
    prisma.invitation.findFirst({ where: { organizationId, email, acceptedAt: null }, select: { id: true } }),
  ]);
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  if (existingMember) return NextResponse.json({ error: "This person is already a member of your team" }, { status: 409 });

  if (!pending) {
    const seats = await seatUsage(organizationId);
    if (seats.used >= seats.limit) {
      return NextResponse.json({ error: `Your ${seats.planName} includes ${seats.limit} seats and all are in use. Upgrade or remove a member first.` }, { status: 402 });
    }
  }

  const token = generateToken(48);
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const invitation = pending
    ? await prisma.invitation.update({ where: { id: pending.id }, data: { token, role, expiresAt }, select: { id: true } })
    : await prisma.invitation.create({ data: { organizationId, email, role, token, expiresAt }, select: { id: true } });

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  try {
    await sendMail({
      to: email,
      subject: `You're invited to join ${org.name} on ChatFlow`,
      html: invitationEmailHtml(org.name, session?.user?.name ?? "Your team", `${appUrl}/accept-invite?token=${token}`),
    });
  } catch (e) {
    console.error("[team] invite email failed", e);
    return NextResponse.json({ error: "Invitation saved but the email could not be sent. Try resending." , invitationId: invitation.id }, { status: 502 });
  }

  return NextResponse.json({ success: true, resent: !!pending, invitationId: invitation.id });
}

/** Cancel a pending invitation: DELETE /api/settings/team/invite?id=... */
export async function DELETE(req: NextRequest) {
  const { member, response } = await requireOrgMember({ admin: true });
  if (!member) return response;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const result = await prisma.invitation.deleteMany({ where: { id, organizationId: member.organizationId, acceptedAt: null } });
  if (result.count === 0) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
