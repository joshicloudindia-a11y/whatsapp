import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { status = "RESOLVED" } = await req.json();

  const conversation = await prisma.conversation.update({
    where: { id, organizationId: session.user.organizationId },
    data: { status },
  });

  return NextResponse.json({ success: true, conversation });
}
