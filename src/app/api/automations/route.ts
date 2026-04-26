import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const automations = await prisma.automation.findMany({
    where: { organizationId: session.user.organizationId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ automations });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, triggerEvent, conditions, actions } = await req.json();

  const automation = await prisma.automation.create({
    data: {
      organizationId: session.user.organizationId,
      name,
      triggerEvent,
      conditions: conditions ?? [],
      actions: actions ?? [],
    },
  });

  return NextResponse.json({ automation }, { status: 201 });
}
