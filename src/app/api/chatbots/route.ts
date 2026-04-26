import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const chatbots = await prisma.chatbot.findMany({
    where: { organizationId: session.user.organizationId },
    include: { _count: { select: { sessions: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ chatbots });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, description, triggerType, triggerValue } = body;

  const chatbot = await prisma.chatbot.create({
    data: {
      organizationId: session.user.organizationId,
      name,
      description,
      triggerType: triggerType ?? "KEYWORD",
      triggerValue,
      nodes: [],
      edges: [],
    },
  });

  return NextResponse.json({ chatbot }, { status: 201 });
}
