import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(2).optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).optional(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, avatar: true, emailVerified: true, createdAt: true },
  });

  return NextResponse.json({ user });
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = schema.parse(await req.json());
    const updateData: any = {};

    if (body.name) updateData.name = body.name;

    // Password change
    if (body.newPassword) {
      if (!body.currentPassword) {
        return NextResponse.json({ error: "Current password required" }, { status: 400 });
      }
      const user = await prisma.user.findUnique({ where: { id: session.user.id } });
      if (!user?.passwordHash) return NextResponse.json({ error: "No password set" }, { status: 400 });

      const valid = await bcrypt.compare(body.currentPassword, user.passwordHash);
      if (!valid) return NextResponse.json({ error: "Current password incorrect" }, { status: 400 });

      updateData.passwordHash = await bcrypt.hash(body.newPassword, 12);
    }

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: updateData,
      select: { id: true, name: true, email: true, avatar: true },
    });

    return NextResponse.json({ user });
  } catch (error: any) {
    if (error.name === "ZodError") return NextResponse.json({ error: "Invalid input" }, { status: 422 });
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
