import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const chatbot = await prisma.chatbot.findFirst({
    where: { id, organizationId: session.user.organizationId },
  });

  if (!chatbot) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ chatbot });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { nodes, edges, isActive, name, triggerValue, triggerType } = body;

  const chatbot = await prisma.chatbot.update({
    where: { id, organizationId: session.user.organizationId },
    data: {
      ...(nodes !== undefined && { nodes }),
      ...(edges !== undefined && { edges }),
      ...(isActive !== undefined && { isActive }),
      ...(name && { name }),
      ...(triggerValue !== undefined && { triggerValue }),
      ...(triggerType && { triggerType }),
    },
  });

  return NextResponse.json({ chatbot });
}
