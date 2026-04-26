import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateToken } from "@/lib/utils";
import bcrypt from "bcryptjs";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const keys = await prisma.apiKey.findMany({
    where: { organizationId: session.user.organizationId, isActive: true },
    select: { id: true, name: true, keyPrefix: true, lastUsedAt: true, expiresAt: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ keys });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await req.json();
  const plainKey = `cf_${generateToken(40)}`;
  const keyPrefix = plainKey.slice(0, 10);
  const keyHash = await bcrypt.hash(plainKey, 10);

  await prisma.apiKey.create({
    data: {
      organizationId: session.user.organizationId,
      name,
      keyHash,
      keyPrefix,
    },
  });

  return NextResponse.json({ plainKey }, { status: 201 });
}
