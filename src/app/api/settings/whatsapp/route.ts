import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accounts = await prisma.whatsappAccount.findMany({
    where: { organizationId: session.user.organizationId },
    select: {
      id: true, phoneNumber: true, phoneNumberId: true, displayName: true,
      wabaId: true, isActive: true, qualityRating: true, messagingLimit: true, createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ accounts });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { phoneNumber, phoneNumberId, displayName, wabaId, accessToken } = await req.json();

  if (!phoneNumberId) {
    return NextResponse.json({ error: "Phone Number ID is required" }, { status: 400 });
  }

  const account = await prisma.whatsappAccount.create({
    data: {
      organizationId: session.user.organizationId,
      phoneNumber: phoneNumber.replace(/\D/g, ""),
      phoneNumberId,
      displayName,
      wabaId,
      accessToken,
    },
    select: { id: true, phoneNumber: true, phoneNumberId: true, displayName: true, wabaId: true, isActive: true },
  });

  return NextResponse.json({ account }, { status: 201 });
}
