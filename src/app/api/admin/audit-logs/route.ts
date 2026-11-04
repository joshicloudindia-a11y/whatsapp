import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  const { ctx, response } = await requireAdmin("audit:read");
  if (!ctx) return response;

  const { searchParams } = req.nextUrl;
  const search = (searchParams.get("search") ?? "").slice(0, 100);
  const category = searchParams.get("category") ?? "all";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "30") || 30));

  const where: Prisma.AuditLogWhereInput = {};
  if (search) where.OR = [{ actorEmail: { contains: search } }, { action: { contains: search } }, { ip: { contains: search } }];
  const prefixes: Record<string, string> = { auth: "admin.", users: "user.", orgs: "org.", plans: "plan.", whatsapp: "whatsapp.", roles: "role.", security: "access." };
  if (prefixes[category]) where.action = { startsWith: prefixes[category] };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
    prisma.auditLog.count({ where }),
  ]);
  return NextResponse.json({ logs, total, page, limit });
}
