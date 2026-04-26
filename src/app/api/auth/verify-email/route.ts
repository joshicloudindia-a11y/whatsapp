import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/login?error=invalid`);

  const vToken = await prisma.verificationToken.findUnique({ where: { token } });
  if (!vToken || vToken.expiresAt < new Date()) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/login?error=expired`);
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: vToken.userId }, data: { emailVerified: new Date() } }),
    prisma.verificationToken.delete({ where: { id: vToken.id } }),
  ]);

  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/login?verified=1`);
}
