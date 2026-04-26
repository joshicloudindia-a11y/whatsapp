import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN")
    return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();

  const numericFields = ["monthlyPrice","annualPrice","sortOrder","maxUsers","maxBroadcasts","maxAutomations","maxApiCalls","maxAiCredits","maxWhatsappNumbers"];
  const data: any = { ...body };
  numericFields.forEach((f) => { if (data[f] !== undefined) data[f] = Number(data[f]); });

  try {
    const plan = await prisma.planConfig.update({ where: { id }, data });
    return NextResponse.json({ plan });
  } catch (e: any) {
    if (e.code === "P2025") return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN")
    return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { id } = await params;
  try {
    await prisma.planConfig.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
