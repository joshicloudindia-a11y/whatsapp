import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit, requireAdmin } from "@/lib/admin-auth";

const csv = (v: unknown) => {
  const s = v == null ? "" : typeof v === "string" ? v : JSON.stringify(v);
  // Neutralise spreadsheet formula injection and escape quotes.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

/** GET /api/admin/audit-logs/export?category=&search=&days=30 → CSV (max 10,000 rows) */
export async function GET(req: NextRequest) {
  const { ctx, response } = await requireAdmin("audit:export");
  if (!ctx) return response;

  const sp = req.nextUrl.searchParams;
  const days = Math.min(365, Math.max(1, parseInt(sp.get("days") ?? "30") || 30));
  const search = (sp.get("search") ?? "").slice(0, 100);
  const category = sp.get("category") ?? "all";
  const prefixes: Record<string, string> = { auth: "admin.", users: "user.", orgs: "org.", plans: "plan.", whatsapp: "whatsapp.", roles: "role.", security: "access." };

  const where: Prisma.AuditLogWhereInput = { createdAt: { gte: new Date(Date.now() - days * 86400000) } };
  if (search) where.OR = [{ actorEmail: { contains: search } }, { action: { contains: search } }, { ip: { contains: search } }];
  if (prefixes[category]) where.action = { startsWith: prefixes[category] };

  const logs = await prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 10000 });
  const header = ["Time (UTC)", "Action", "Actor email", "Actor role", "Entity", "Entity ID", "IP", "User agent", "Details"];
  const lines = [header.map(csv).join(",")].concat(
    logs.map((l) => [l.createdAt.toISOString(), l.action, l.actorEmail, l.actorRole, l.entity, l.entityId, l.ip, l.userAgent, l.metadata].map(csv).join(","))
  );

  await audit(ctx, "audit.export", { metadata: { rows: logs.length, days, category, search } });
  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="chatflow-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
